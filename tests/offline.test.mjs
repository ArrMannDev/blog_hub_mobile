import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { load, coverFixture } from "./helpers/offline.mjs";

test("covers copy into permanent account folders without moving the original", async () => {
  const { persistCover, files, directories, image } = coverFixture();
  const userId = randomUUID();

  for (const [mimeType, extension] of [
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ]) {
    const saved = await persistCover(userId.toUpperCase(), {
      ...image,
      mimeType,
    });
    assert.ok(
      saved.uri.startsWith(`file:///documents/offline-covers/${userId}/`),
    );
    assert.ok(saved.name.endsWith(`.${extension}`));
    assert.equal(saved.size, 4);
    assert.equal(saved.mimeType, mimeType);
    assert.deepEqual(files.get(saved.uri), files.get(image.uri));
    assert.equal("file" in saved, false);
    assert.equal(JSON.parse(JSON.stringify(saved)).uri, saved.uri);
  }

  assert.equal(files.has(image.uri), true);
  const originalCopy = await persistCover(userId, image);
  const secondCopy = await persistCover(userId, image);
  assert.notEqual(originalCopy.uri, secondCopy.uri);

  const otherUserId = randomUUID();
  const otherCopy = await persistCover(otherUserId, image);
  assert.ok(otherCopy.uri.includes(`/offline-covers/${otherUserId}/`));
  const settings = directories.get(
    `file:///documents/offline-covers/${userId}`,
  );
  assert.equal(settings.intermediates, true);
  assert.equal(settings.idempotent, true);
});

test("covers reject invalid accounts, unavailable files and invalid sizes", async () => {
  const { persistCover, files, directories, image } = coverFixture();
  const userId = randomUUID();

  await assert.rejects(
    () => persistCover("../another-account", image),
    /valid user ID/,
  );
  await assert.rejects(
    () =>
      persistCover(userId, { ...image, uri: "https://example.com/photo.jpg" }),
    /stored on your device/,
  );
  await assert.rejects(
    () => persistCover(userId, { ...image, uri: "file:///cache/missing.jpg" }),
    /image is missing/,
  );
  await assert.rejects(
    () => persistCover(userId, { ...image, mimeType: "image/gif" }),
    /JPEG, PNG, or WebP/,
  );
  await assert.rejects(
    () => persistCover(userId, { ...image, size: 0 }),
    /no larger than 5 MB/,
  );

  // Picker metadata must not bypass the actual on-device size check.
  files.set(image.uri, new Uint8Array(5 * 1024 * 1024 + 1));
  await assert.rejects(
    () => persistCover(userId, image),
    /no larger than 5 MB/,
  );
  files.set(image.uri, new Uint8Array());
  await assert.rejects(
    () => persistCover(userId, image),
    /no larger than 5 MB/,
  );
  assert.equal(directories.size, 0);
});

test("failed cover copies remove partial output and preserve the original error", async () => {
  const failure = new Error("Not enough storage");
  const { persistCover, files, image } = coverFixture({ copyError: failure });

  await assert.rejects(
    () => persistCover(randomUUID(), image),
    (error) => error === failure,
  );
  assert.equal(files.size, 1);
  assert.equal(files.has(image.uri), true);

  const cleanupFailure = coverFixture({
    copyError: failure,
    cleanupError: new Error("Cleanup failed"),
  });
  await assert.rejects(
    () => cleanupFailure.persistCover(randomUUID(), cleanupFailure.image),
    (error) => error === failure,
  );
  assert.equal(cleanupFailure.files.has(cleanupFailure.image.uri), true);
});

test("empty copied covers are rejected and removed", async () => {
  const { persistCover, files, image } = coverFixture({ emptyCopy: true });
  await assert.rejects(
    () => persistCover(randomUUID(), image),
    /no larger than 5 MB/,
  );
  assert.equal(files.size, 1);
  assert.equal(files.has(image.uri), true);
});

test("local posts save atomically, protect account data and survive reopening", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bloghub-offline-"));
  const databasePath = join(directory, "posts.db");
  let sqlite;

  const db = {
    async execAsync(sql) {
      sqlite.exec(sql);
    },

    async runAsync(sql, ...params) {
      return sqlite.prepare(sql).run(...params);
    },

    async getFirstAsync(sql, ...params) {
      return sqlite.prepare(sql).get(...params) ?? null;
    },

    async getAllAsync(sql, ...params) {
      return sqlite.prepare(sql).all(...params);
    },

    async withExclusiveTransactionAsync(task) {
      sqlite.exec("BEGIN;");

      try {
        await task(db);
        sqlite.exec("COMMIT;");
      } catch (error) {
        sqlite.exec("ROLLBACK;");
        throw error;
      }
    },
  };

  try {
    sqlite = new DatabaseSync(databasePath);
    const { migrateDatabase } = load("lib/offline/migration.ts");

    // Re-running migrations must preserve existing tables.
    await migrateDatabase(db);
    await migrateDatabase(db);

    const validation = load("lib/blog-validation.ts");
    const covers = coverFixture();

    const {
      createLocalPost,
      updateLocalPost,
      deleteLocalPost,
      listLocalPosts,
      getLocalPost,
    } = load("lib/offline/posts.ts", {
      "expo-crypto": { randomUUID },
      "expo-file-system": covers.fileSystem,
      "./cover": { persistCover: covers.persistCover },
      "@/lib/blog-validation": validation,
      "./database": {
        getAccountDatabase: async () => db,
        writeTransaction: (database, task) =>
          database.withExclusiveTransactionAsync(task),
      },
    });

    const userId = randomUUID();
    const input = {
      title: "  Offline story  ",
      content: "Written without internet.",
      categoryId: randomUUID(),
      tagIds: [],
      status: "draft",
    };

    const id = await createLocalPost(userId, input);
    const post = await getLocalPost(userId, id);

    assert.equal(post.title, "Offline story");
    assert.equal(post.sync_status, "pending");
    assert.equal(post.local_revision, 1);
    assert.equal((await listLocalPosts(userId, "draft")).length, 1);
    assert.equal((await listLocalPosts(userId, "published")).length, 0);

    const otherUserId = randomUUID();

    assert.equal(await getLocalPost(otherUserId, id), null);
    assert.equal((await listLocalPosts(otherUserId, "draft")).length, 0);

    const queued = sqlite
      .prepare("SELECT * FROM sync_queue WHERE entity_id = ?")
      .get(id);

    assert.equal(queued.operation_type, "CREATE");
    assert.equal(JSON.parse(queued.payload).input.title, post.title);

    const edits = {
      title: "Edited offline",
      content: "Updated without internet.",
    };

    await updateLocalPost(userId, id, edits, 1);

    const updated = await getLocalPost(userId, id);

    assert.equal(updated.title, edits.title);
    assert.equal(updated.content, edits.content);
    assert.equal(updated.local_revision, 2);
    assert.equal(updated.category_id, input.categoryId);
    assert.equal(updated.status, "draft");

    const operations = sqlite
      .prepare("SELECT * FROM sync_queue WHERE entity_id = ? ORDER BY sequence")
      .all(id);

    assert.equal(operations.length, 2);
    assert.equal(operations[0].operation_type, "CREATE");
    assert.equal(operations[1].operation_type, "UPDATE");
    assert.equal(JSON.parse(operations[1].payload).revision, 2);

    await assert.rejects(
      () => updateLocalPost(userId, id, edits, 1),
      /This post has changed/,
    );

    await assert.rejects(
      () => updateLocalPost(otherUserId, id, edits, 2),
      /Post not found/,
    );

    // A failed queue insert must also roll back the post edit.
    sqlite.exec(`
      CREATE TRIGGER fail_update_queue
      BEFORE INSERT ON sync_queue
      WHEN NEW.operation_type = 'UPDATE'
      BEGIN
        SELECT RAISE(ABORT, 'update queue failed');
      END;
    `);

    await assert.rejects(
      () =>
        updateLocalPost(
          userId,
          id,
          {
            title: "Must roll back",
            content: "Must roll back",
          },
          2,
        ),
      /update queue failed/,
    );

    const unchanged = await getLocalPost(userId, id);

    assert.equal(unchanged.title, edits.title);
    assert.equal(unchanged.local_revision, 2);

    const queueCount = sqlite
      .prepare("SELECT COUNT(*) AS total FROM sync_queue")
      .get();

    assert.equal(queueCount.total, 2);

    sqlite.exec("DROP TRIGGER fail_update_queue;");

    const cancelledId = await createLocalPost(userId, input);
    await updateLocalPost(userId, cancelledId, edits, 1);
    await deleteLocalPost(userId, cancelledId, 2);

    assert.equal(await getLocalPost(userId, cancelledId), null);
    assert.equal(
      sqlite.prepare("SELECT id FROM posts WHERE id = ?").get(cancelledId),
      undefined,
    );
    assert.equal(
      sqlite
        .prepare("SELECT COUNT(*) AS total FROM sync_queue WHERE entity_id = ?")
        .get(cancelledId).total,
      0,
    );

    await assert.rejects(
      () => deleteLocalPost(otherUserId, id, 2),
      /Post not found/,
    );
    await assert.rejects(
      () => deleteLocalPost(userId, id, 1),
      /This post has changed/,
    );

    // An attempted create might already exist on the server.
    sqlite
      .prepare(
        `UPDATE sync_queue SET attempts = 1
         WHERE entity_id = ? AND operation_type = 'CREATE'`,
      )
      .run(id);

    sqlite.exec(`
      CREATE TRIGGER fail_delete_queue
      BEFORE INSERT ON sync_queue
      WHEN NEW.operation_type = 'DELETE'
      BEGIN
        SELECT RAISE(ABORT, 'delete queue failed');
      END;
    `);

    await assert.rejects(
      () => deleteLocalPost(userId, id, 2),
      /delete queue failed/,
    );
    const afterFailedDelete = await getLocalPost(userId, id);
    assert.equal(afterFailedDelete.local_revision, 2);
    assert.equal(afterFailedDelete.is_deleted, 0);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS total FROM sync_queue").get().total,
      2,
    );

    sqlite.exec("DROP TRIGGER fail_delete_queue;");

    await deleteLocalPost(userId, id, 2);
    await deleteLocalPost(userId, id, 2);

    const tombstone = sqlite
      .prepare("SELECT * FROM posts WHERE id = ?")
      .get(id);
    assert.equal(tombstone.is_deleted, 1);
    assert.equal(tombstone.local_revision, 3);

    const deletions = sqlite
      .prepare(
        `SELECT * FROM sync_queue
         WHERE entity_id = ? AND operation_type = 'DELETE'`,
      )
      .all(id);
    assert.equal(deletions.length, 1);
    assert.equal(JSON.parse(deletions[0].payload).revision, 3);

    assert.equal(await getLocalPost(userId, id), null);
    assert.equal((await listLocalPosts(userId, "draft")).length, 0);

    await assert.rejects(
      () => updateLocalPost(userId, id, edits, 2),
      /Post not found/,
    );

    // A failed queue insert must also roll back a new post.
    sqlite.exec(`
      CREATE TRIGGER fail_queue
      BEFORE INSERT ON sync_queue
      BEGIN
        SELECT RAISE(ABORT, 'queue failed');
      END;
    `);

    await assert.rejects(() => createLocalPost(userId, input), /queue failed/);

    const postCount = sqlite
      .prepare("SELECT COUNT(*) AS total FROM posts")
      .get();

    assert.equal(postCount.total, 1);

    sqlite.exec("DROP TRIGGER fail_queue;");

    const persistentId = await createLocalPost(userId, input);
    await updateLocalPost(
      userId,
      persistentId,
      {
        title: "Saved across restarts",
        content: "This content must survive reopening.",
      },
      1,
    );

    const imageId = await createLocalPost(userId, {
      ...input,
      image: covers.image,
      coverImageUrl: "https://example.com/previous.jpg",
    });
    const imagePost = await getLocalPost(userId, imageId);
    const savedImage = JSON.parse(imagePost.local_image);
    assert.ok(
      savedImage.uri.startsWith(`file:///documents/offline-covers/${userId}/`),
    );
    assert.notEqual(savedImage.uri, covers.image.uri);
    assert.equal(imagePost.cover_image_url, null);
    assert.equal(covers.files.has(savedImage.uri), true);
    assert.equal(covers.files.has(covers.image.uri), true);

    const imageOperation = sqlite
      .prepare("SELECT payload FROM sync_queue WHERE entity_id = ?")
      .get(imageId);
    const imagePayload = JSON.parse(imageOperation.payload);
    assert.deepEqual(imagePayload.input.image, savedImage);
    assert.equal("file" in imagePayload.input.image, false);

    const filesBeforeFailure = [...covers.files.keys()].sort();
    const postsBeforeFailure = sqlite
      .prepare("SELECT COUNT(*) AS total FROM posts")
      .get().total;
    const operationsBeforeFailure = sqlite
      .prepare("SELECT COUNT(*) AS total FROM sync_queue")
      .get().total;

    await assert.rejects(
      () =>
        createLocalPost(userId, {
          ...input,
          image: { ...covers.image, uri: "file:///cache/missing.jpg" },
        }),
      /image is missing/,
    );

    sqlite.exec(`
      CREATE TRIGGER fail_cover_save
      BEFORE INSERT ON sync_queue
      BEGIN
        SELECT RAISE(ABORT, 'cover queue failed');
      END;
    `);
    await assert.rejects(
      () => createLocalPost(userId, { ...input, image: covers.image }),
      /cover queue failed/,
    );
    sqlite.exec("DROP TRIGGER fail_cover_save;");

    assert.deepEqual([...covers.files.keys()].sort(), filesBeforeFailure);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS total FROM posts").get().total,
      postsBeforeFailure,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS total FROM sync_queue").get().total,
      operationsBeforeFailure,
    );

    const queueBeforeRestart = sqlite
      .prepare("SELECT * FROM sync_queue ORDER BY sequence")
      .all();

    sqlite.close();
    sqlite = null;
    sqlite = new DatabaseSync(databasePath);
    await migrateDatabase(db);

    const restored = await getLocalPost(userId, persistentId);
    assert.equal(restored.title, "Saved across restarts");
    assert.equal(restored.content, "This content must survive reopening.");
    assert.equal(restored.local_revision, 2);
    assert.equal(restored.sync_status, "pending");
    assert.equal(await getLocalPost(userId, id), null);
    assert.equal(await getLocalPost(otherUserId, persistentId), null);

    const visiblePosts = await listLocalPosts(userId, "draft");
    assert.equal(visiblePosts.length, 2);
    assert.ok(visiblePosts.some((item) => item.id === persistentId));
    assert.ok(visiblePosts.some((item) => item.id === imageId));
    const restoredImagePost = await getLocalPost(userId, imageId);
    assert.equal(restoredImagePost.local_image, imagePost.local_image);

    const restoredTombstone = sqlite
      .prepare("SELECT * FROM posts WHERE id = ?")
      .get(id);
    assert.equal(restoredTombstone.is_deleted, 1);
    assert.equal(restoredTombstone.local_revision, 3);

    const queueAfterRestart = sqlite
      .prepare("SELECT * FROM sync_queue ORDER BY sequence")
      .all();
    assert.deepEqual(queueAfterRestart, queueBeforeRestart);

    const latestImageInput = () =>
      JSON.parse(
        sqlite
          .prepare(
            "SELECT payload FROM sync_queue WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
          )
          .get(imageId).payload,
      ).input;

    await updateLocalPost(
      userId,
      imageId,
      {
        ...edits,
        image: covers.image,
        coverImageUrl: null,
      },
      1,
    );

    const replacement = await getLocalPost(userId, imageId);
    const replacementImage = JSON.parse(replacement.local_image);
    assert.notEqual(replacementImage.uri, savedImage.uri);
    assert.equal(replacement.local_revision, 2);
    assert.equal(replacement.category_id, input.categoryId);
    assert.deepEqual(latestImageInput().image, replacementImage);
    assert.equal("coverImageUrl" in latestImageInput(), false);
    assert.equal(covers.files.has(savedImage.uri), true);
    assert.equal(covers.files.has(replacementImage.uri), true);

    // A text-only edit must retain the pending cover without uploading it twice.
    await updateLocalPost(userId, imageId, edits, 2);
    const preserved = await getLocalPost(userId, imageId);
    assert.equal(preserved.local_image, replacement.local_image);
    assert.equal("image" in latestImageInput(), false);
    assert.equal("coverImageUrl" in latestImageInput(), false);

    const filesBeforeEditFailure = [...covers.files.keys()].sort();
    const queueBeforeEditFailure = sqlite
      .prepare("SELECT * FROM sync_queue ORDER BY sequence")
      .all();

    sqlite.exec(`
      CREATE TRIGGER fail_cover_edit
      BEFORE INSERT ON sync_queue
      WHEN NEW.operation_type = 'UPDATE'
      BEGIN
        SELECT RAISE(ABORT, 'cover edit failed');
      END;
    `);
    await assert.rejects(
      () =>
        updateLocalPost(userId, imageId, { ...edits, image: covers.image }, 3),
      /cover edit failed/,
    );
    sqlite.exec("DROP TRIGGER fail_cover_edit;");

    await assert.rejects(
      () =>
        updateLocalPost(userId, imageId, { ...edits, image: covers.image }, 2),
      /This post has changed/,
    );
    await assert.rejects(
      () =>
        updateLocalPost(
          otherUserId,
          imageId,
          { ...edits, image: covers.image },
          3,
        ),
      /Post not found/,
    );
    await assert.rejects(
      () =>
        updateLocalPost(
          userId,
          imageId,
          {
            ...edits,
            image: { ...covers.image, uri: "file:///cache/missing.jpg" },
          },
          3,
        ),
      /image is missing/,
    );
    assert.deepEqual(await getLocalPost(userId, imageId), preserved);
    assert.deepEqual([...covers.files.keys()].sort(), filesBeforeEditFailure);
    assert.deepEqual(
      sqlite.prepare("SELECT * FROM sync_queue ORDER BY sequence").all(),
      queueBeforeEditFailure,
    );

    await updateLocalPost(
      userId,
      imageId,
      { ...edits, coverImageUrl: null },
      3,
    );
    const removed = await getLocalPost(userId, imageId);
    assert.equal(removed.local_image, null);
    assert.equal(removed.cover_image_url, null);
    assert.equal(latestImageInput().coverImageUrl, null);
    assert.equal("image" in latestImageInput(), false);

    // Queued earlier uploads still reference these files after cover removal.
    assert.equal(covers.files.has(savedImage.uri), true);
    assert.equal(covers.files.has(replacementImage.uri), true);

    await updateLocalPost(
      userId,
      imageId,
      {
        ...edits,
        coverImageUrl: "https://example.com/replacement.jpg",
      },
      4,
    );
    const remoteCover = await getLocalPost(userId, imageId);
    assert.equal(remoteCover.local_image, null);
    assert.equal(
      remoteCover.cover_image_url,
      "https://example.com/replacement.jpg",
    );

    await updateLocalPost(
      userId,
      imageId,
      { ...edits, coverImageUrl: null },
      5,
    );
    const finalQueue = sqlite
      .prepare("SELECT * FROM sync_queue ORDER BY sequence")
      .all();
    sqlite.close();
    sqlite = null;
    sqlite = new DatabaseSync(databasePath);
    await migrateDatabase(db);
    const restoredRemoval = await getLocalPost(userId, imageId);
    assert.equal(restoredRemoval.local_image, null);
    assert.equal(restoredRemoval.cover_image_url, null);
    assert.equal(restoredRemoval.local_revision, 6);
    assert.deepEqual(
      sqlite.prepare("SELECT * FROM sync_queue ORDER BY sequence").all(),
      finalQueue,
    );
  } finally {
    try {
      sqlite?.close();
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(`${databasePath}${suffix}`, { force: true });
      }
      rmdirSync(directory);
    }
  }
});
