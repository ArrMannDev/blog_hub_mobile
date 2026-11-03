import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { load, coverFixture } from "./helpers/offline.mjs";

class ApiError extends Error {
  constructor(status, message = `HTTP ${status}`) {
    super(message);
    this.status = status;
  }
}
class NativeFormData {
  fields = new Map();
  append(key, value) {
    this.fields.set(key, value);
  }
  get(key) {
    return this.fields.get(key);
  }
}

function fixture(t) {
  let online = true;
  let loseResponse = false;
  let rejectNext = 0;
  let onSnapshot = null;
  let onCommitted = null;
  const databases = new Map();
  const server = new Map();
  const receipts = new Map();
  const calls = [];
  const owner = {
    id: randomUUID(),
    displayName: "Writer",
    email: "writer@example.com",
    role: "author",
    status: "active",
  };
  const covers = coverFixture();
  const globals = { FormData: NativeFormData };
  const native = { "expo-file-system": covers.fileSystem };
  const { migrateDatabase } = load("lib/offline/migration.ts");
  const database = load("lib/offline/database.ts", {
    "expo-sqlite": {
      async openDatabaseAsync(name) {
        if (databases.has(name)) return databases.get(name).db;
        const sqlite = new DatabaseSync(":memory:");
        const db = {
          async execAsync(sql) {
            sqlite.exec(sql);
          },
          async runAsync(sql, ...args) {
            return sqlite.prepare(sql).run(...args);
          },
          async getFirstAsync(sql, ...args) {
            return sqlite.prepare(sql).get(...args) ?? null;
          },
          async getAllAsync(sql, ...args) {
            return sqlite.prepare(sql).all(...args);
          },
          async closeAsync() {
            sqlite.close();
          },
          async withExclusiveTransactionAsync(task) {
            sqlite.exec("BEGIN");
            try {
              await task(db);
              sqlite.exec("COMMIT");
            } catch (error) {
              sqlite.exec("ROLLBACK");
              throw error;
            }
          },
        };
        databases.set(name, { sqlite, db });
        return db;
      },
    },
    "./migration": { migrateDatabase },
  });
  t.after(() => {
    for (const { sqlite } of databases.values()) sqlite.close();
  });
  const local = load("lib/offline/posts.ts", {
    "expo-crypto": { randomUUID },
    ...native,
    "@/lib/blog-validation": load("lib/blog-validation.ts"),
    "./database": database,
    "./cover": { persistCover: covers.persistCover },
  });
  const cache = load("lib/offline/cache.ts", { "./database": database });
  const connectivity = { hasInternet: async () => online };
  const body = load("lib/post-body.ts", native, globals);
  const makeBlog = (id, input, userId = owner.id) => ({
    id,
    slug: `story-${id}`,
    author: { id: userId, displayName: "Writer" },
    categoryId: input.categoryId ?? null,
    category: null,
    categoryName: "Life",
    tags: [],
    coverImageUrl: input.image
      ? "https://example.com/cover.jpg"
      : (input.coverImageUrl ?? null),
    status: input.status ?? "draft",
    publicationBlocked: false,
    publishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    title: input.title,
    content: input.content,
  });
  const myBlogsApi = {
    async create(input, token) {
      calls.push({ kind: "online-create", input, token });
      if (rejectNext) {
        const code = rejectNext;
        rejectNext = 0;
        if (code === 500) throw new Error("Timeout");
        throw new ApiError(code);
      }
      const blog = makeBlog(randomUUID(), input);
      server.set(blog.id, blog);
      return blog;
    },
    async detail(id) {
      const blog = server.get(id);
      if (!blog) throw new ApiError(404);
      return { ...blog };
    },
    async update(id, input) {
      calls.push({ kind: "online-update", id, input });
      const blog = server.get(id);
      if (!blog) throw new ApiError(404);
      if (input.expectedVersion && input.expectedVersion !== blog.version)
        throw new ApiError(409);
      const result = { ...blog, ...input, version: blog.version + 1 };
      server.set(id, result);
      return result;
    },
    async setStatus(id, status, token, version) {
      return this.update(id, { status, expectedVersion: version });
    },
    async remove(id) {
      calls.push({ kind: "online-delete", id });
      server.delete(id);
    },
    async list(status, page) {
      const items = [...server.values()].filter(
        (blog) => blog.status === status,
      );
      return { items, page, limit: 10, total: items.length, totalPages: 1 };
    },
  };
  const crud = load("lib/post-crud.ts", {
    "react-native": { Platform: { OS: "ios" } },
    "./api": { ApiError },
    "./my-blogs-api": { myBlogsApi },
    "./connectivity": connectivity,
    "./offline/cache": cache,
    "./offline/posts": local,
    "./offline/database": database,
    "./post-events": { notifyPostChange() {} },
    "./post-sync": { isPostSyncRunning: () => false },
  });
  const api = {
    ApiError,
    async request(path, options) {
      if (options.signal?.aborted) throw new Error("Aborted");
      const userId = options.headers.Authorization.slice(7);
      if (!options.method) {
        const after = new URL(`https://example.com${path}`).searchParams.get(
          "after",
        );
        const items = [...server.values()]
          .filter(
            (blog) => blog.author.id === userId && (!after || blog.id > after),
          )
          .sort((a, b) => a.id.localeCompare(b.id));
        if (onSnapshot) await onSnapshot(path);
        return {
          items: items.slice(0, 2),
          nextCursor: items.length > 2 ? items[1].id : null,
        };
      }
      const fields =
        options.body instanceof NativeFormData
          ? Object.fromEntries(options.body.fields)
          : JSON.parse(options.body);
      if (typeof fields.input === "string")
        fields.input = JSON.parse(fields.input);
      if (fields.baseVersion !== undefined)
        fields.baseVersion = Number(fields.baseVersion);
      calls.push({ kind: "sync", ...fields });
      const receiptKey = `${userId}:${fields.operationId}`;
      if (receipts.has(receiptKey)) return receipts.get(receiptKey);
      if (rejectNext) {
        const code = rejectNext;
        rejectNext = 0;
        throw new ApiError(code);
      }
      const current = server.get(fields.entityId);
      if (current && current.author.id !== userId) throw new ApiError(403);
      if (
        fields.type !== "CREATE" &&
        current &&
        current.version !== fields.baseVersion
      )
        throw new ApiError(409);
      let result;
      if (fields.type === "CREATE") {
        if (current) throw new ApiError(409);
        const blog = makeBlog(
          fields.entityId,
          { ...fields.input, ...(fields.image ? { image: true } : {}) },
          userId,
        );
        server.set(blog.id, blog);
        result = { blog };
      } else if (fields.type === "UPDATE") {
        if (!current) throw new ApiError(404);
        const blog = {
          ...current,
          ...fields.input,
          version: current.version + 1,
          ...(fields.image
            ? { coverImageUrl: "https://example.com/updated.jpg" }
            : {}),
        };
        server.set(blog.id, blog);
        result = { blog };
      } else {
        server.delete(fields.entityId);
        result = { deleted: true, id: fields.entityId };
      }
      receipts.set(receiptKey, result);
      if (onCommitted) await onCommitted(fields);
      if (loseResponse) {
        loseResponse = false;
        throw new Error("Lost response after server commit");
      }
      return result;
    },
  };
  const sync = load(
    "lib/post-sync.ts",
    {
      "expo-crypto": { randomUUID },
      ...native,
      "./api": api,
      "./post-body": body,
      "./offline/database": database,
      "./offline/cache": cache,
      "./connectivity": connectivity,
      "./post-events": { notifyPostChange() {} },
    },
    globals,
  );
  const input = {
    title: "Offline story",
    content: "Content",
    categoryId: randomUUID(),
    status: "draft",
    tagIds: [],
  };
  const token = async () => owner.id;
  return {
    owner,
    input,
    covers,
    server,
    calls,
    receipts,
    local,
    cache,
    database,
    crud: crud.postCrud,
    UnconfirmedPostError: crud.UnconfirmedPostError,
    sync,
    set online(value) {
      online = value;
    },
    set loseResponse(value) {
      loseResponse = value;
    },
    set rejectNext(value) {
      rejectNext = value;
    },
    set onSnapshot(value) {
      onSnapshot = value;
    },
    set onCommitted(value) {
      onCommitted = value;
    },
    run: (signal = new AbortController().signal) =>
      sync.syncPosts(owner, token, signal),
    token,
    async queue() {
      return (await database.getAccountDatabase(owner.id)).getAllAsync(
        "SELECT * FROM sync_queue ORDER BY sequence",
      );
    },
  };
}

test("partial snapshots never purge cached posts and completed scans preserve saves made during the scan", async (t) => {
  const f = fixture(t);
  const originals = [];
  for (let i = 0; i < 5; i++)
    originals.push(
      await f.crud.create(f.owner, { ...f.input, title: `Post ${i}` }, f.token),
    );
  f.server.delete(originals[0].id);
  f.onSnapshot = async (path) => {
    if (path.includes("after=")) throw new ApiError(503);
  };
  await assert.rejects(() => f.run(), /503/);
  assert.ok(await f.local.getLocalPost(f.owner.id, originals[0].id));
  let inserted = false;
  const late = {
    ...originals[0],
    id: "00000000-0000-4000-8000-000000000001",
    title: "Saved during scan",
    version: 1,
  };
  f.onSnapshot = async () => {
    if (inserted) return;
    inserted = true;
    f.server.set(late.id, late);
    await f.cache.cacheRemotePost(f.owner, late);
  };
  await f.run();
  assert.equal(await f.local.getLocalPost(f.owner.id, originals[0].id), null);
  assert.ok(await f.local.getLocalPost(f.owner.id, late.id));
});

test("deleting while a creation is in flight retains a tombstone until server deletion is confirmed", async (t) => {
  const f = fixture(t);
  f.online = false;
  const blog = await f.crud.create(f.owner, f.input, f.token);
  f.online = true;
  let release, started;
  const committed = new Promise((resolve) => {
    started = resolve;
  });
  f.onCommitted = async (fields) => {
    if (fields.type !== "CREATE") return;
    started();
    await new Promise((resolve) => {
      release = resolve;
    });
  };
  const uploading = f.run();
  await committed;
  await f.crud.remove(f.owner, blog, f.token);
  assert.equal((await f.queue()).length, 2);
  assert.equal(await f.local.getLocalPost(f.owner.id, blog.id), null);
  release();
  await uploading;
  assert.equal(f.server.size, 0);
  assert.equal((await f.queue()).length, 0);
});

test("simultaneous sync triggers serialize workers and submit a queued creation once", async (t) => {
  const f = fixture(t);
  f.online = false;
  await f.crud.create(f.owner, f.input, f.token);
  f.online = true;
  let release, started;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  let first = true;
  f.onSnapshot = async () => {
    if (first) {
      first = false;
      started();
      await new Promise((resolve) => {
        release = resolve;
      });
    }
  };
  const a = f.run();
  await waiting;
  const b = f.run();
  release();
  await Promise.all([a, b]);
  assert.equal(f.server.size, 1);
  assert.equal(f.calls.filter((call) => call.kind === "sync").length, 1);
});

test("NetInfo selects offline storage only when connectivity or reachability is explicitly unavailable", async () => {
  let state;
  const { hasInternet } = load("lib/connectivity.ts", {
    "@react-native-community/netinfo": {
      __esModule: true,
      default: { fetch: async () => state },
    },
  });
  for (const [connection, reachable, expected] of [
    [true, true, true],
    [false, null, false],
    [true, false, false],
    [true, null, true],
    [null, null, true],
  ]) {
    state = { isConnected: connection, isInternetReachable: reachable };
    assert.equal(await hasInternet(), expected);
  }
});

test("online post CRUD uses the API and never queues a timed-out creation", async (t) => {
  const f = fixture(t);
  const blog = await f.crud.create(f.owner, f.input, f.token);
  assert.equal(blog.syncStatus, "synced");
  assert.equal(f.calls[0].kind, "online-create");
  assert.equal((await f.queue()).length, 0);
  const edited = await f.crud.update(
    f.owner,
    blog,
    { title: "Edited", content: "New" },
    f.token,
  );
  assert.equal(edited.version, 2);
  assert.equal(f.calls.at(-1).input.expectedVersion, 1);
  f.rejectNext = 500;
  await assert.rejects(
    () => f.crud.create(f.owner, f.input, f.token),
    f.UnconfirmedPostError,
  );
  assert.equal((await f.queue()).length, 0);
  await f.crud.remove(f.owner, edited, f.token);
  assert.equal(f.server.size, 0);
});

test("offline create/edit with a cover retries the same operation after a lost acknowledgement", async (t) => {
  const f = fixture(t);
  f.online = false;
  const blog = await f.crud.create(
    f.owner,
    { ...f.input, image: f.covers.image },
    f.token,
  );
  const edited = await f.crud.update(
    f.owner,
    blog,
    { title: "Edited offline", content: "Still offline" },
    f.token,
  );
  assert.equal(edited.syncStatus, "pending");
  assert.equal(f.server.size, 0);
  assert.equal(f.calls.length, 0);
  const operationId = (await f.queue())[0].operation_id;
  f.online = true;
  f.loseResponse = true;
  await f.run();
  assert.equal(f.server.size, 1);
  assert.equal((await f.queue()).length, 2);
  const db = await f.database.getAccountDatabase(f.owner.id);
  await f.database.writeTransaction(db, (tx) =>
    tx.runAsync("UPDATE sync_queue SET next_attempt_at=0"),
  );
  await f.run();
  assert.equal(f.server.size, 1);
  assert.equal((await f.queue()).length, 0);
  assert.equal(f.server.get(blog.id).title, "Edited offline");
  assert.equal(
    f.calls.filter((call) => call.kind === "sync" && call.type === "CREATE")
      .length,
    2,
  );
  assert.ok(
    f.calls
      .filter((call) => call.kind === "sync" && call.type === "CREATE")
      .every((call) => call.operationId === operationId),
  );
  const restored = await f.local.getLocalPost(f.owner.id, blog.id);
  assert.equal(restored.sync_status, "synced");
  assert.equal(restored.local_image, null);
  assert.equal(restored.cover_image_url, "https://example.com/cover.jpg");
});

test("remote edits cause conflicts, local changes survive, and discarding explicitly loads the server copy", async (t) => {
  const f = fixture(t);
  const blog = await f.crud.create(f.owner, f.input, f.token);
  f.online = false;
  const edited = await f.crud.update(
    f.owner,
    blog,
    { title: "My offline edit", content: "Mine" },
    f.token,
  );
  f.server.set(blog.id, {
    ...f.server.get(blog.id),
    title: "Other device",
    version: 2,
  });
  f.online = true;
  await f.run();
  const row = await f.local.getLocalPost(f.owner.id, blog.id);
  assert.equal(row.title, "My offline edit");
  assert.equal(row.sync_status, "conflict");
  assert.equal(f.server.get(blog.id).title, "Other device");
  const calls = f.calls.filter((call) => call.kind === "sync").length;
  await f.run();
  assert.equal(f.calls.filter((call) => call.kind === "sync").length, calls);
  await f.crud.discardLocal(f.owner, edited, f.token);
  assert.equal((await f.queue()).length, 0);
  assert.equal(
    (await f.local.getLocalPost(f.owner.id, blog.id)).title,
    "Other device",
  );
});

test("unsent deletion cancels creation; cached deletion uploads once and server deletions stay removed", async (t) => {
  const f = fixture(t);
  f.online = false;
  const unsent = await f.crud.create(f.owner, f.input, f.token);
  await f.crud.remove(f.owner, unsent, f.token);
  assert.equal((await f.queue()).length, 0);
  f.online = true;
  const blog = await f.crud.create(f.owner, f.input, f.token);
  f.online = false;
  await f.crud.remove(f.owner, blog, f.token);
  assert.equal(await f.local.getLocalPost(f.owner.id, blog.id), null);
  f.online = true;
  await f.run();
  assert.equal(f.server.has(blog.id), false);
  assert.equal((await f.queue()).length, 0);
  const removed = await f.crud.create(f.owner, f.input, f.token);
  f.server.delete(removed.id);
  await f.run();
  f.online = false;
  assert.equal(
    (await f.crud.list(f.owner, "draft", 1, f.token)).items.length,
    0,
  );
});

test("permanent failures stop retrying and corrected local posts replace rejected operations", async (t) => {
  const f = fixture(t);
  f.online = false;
  const blog = await f.crud.create(f.owner, f.input, f.token);
  f.online = true;
  f.rejectNext = 400;
  await f.run();
  const failed = await f.local.getLocalPost(f.owner.id, blog.id);
  assert.equal(failed.sync_status, "failed");
  const attempts = f.calls.length;
  await f.run();
  assert.equal(f.calls.length, attempts);
  f.online = false;
  const corrected = await f.crud.update(
    f.owner,
    { ...blog, syncStatus: "failed" },
    { title: "Corrected", content: "Corrected" },
    f.token,
  );
  assert.equal(corrected.syncStatus, "pending");
  assert.equal((await f.queue()).length, 1);
  assert.equal((await f.queue())[0].operation_type, "CREATE");
  f.online = true;
  await f.run();
  assert.equal(f.server.get(blog.id).title, "Corrected");
  assert.equal((await f.queue()).length, 0);
});

for (const status of ["draft", "published"]) {
  test(`offline ${status} waits without taxonomy, then uploads latest edits once a category is chosen`, async (t) => {
    const f = fixture(t);
    f.online = false;
    let blog = await f.crud.create(
      f.owner,
      { ...f.input, categoryId: "", status, image: f.covers.image },
      f.token,
    );
    const originalId = blog.id;
    assert.equal(blog.categoryId, null);
    assert.equal(blog.status, status);
    const localCover = blog.coverImageUrl;
    blog = await f.crud.update(
      f.owner,
      blog,
      { title: "Latest text", content: "Still offline" },
      f.token,
    );
    assert.equal((await f.queue()).length, 1);
    f.online = true;
    await f.run();
    await f.run();
    assert.equal(
      f.calls.length,
      0,
      "An incomplete post must never reach the backend",
    );
    assert.equal((await f.queue())[0].attempts, 0);
    // Other complete posts must not be blocked by the waiting post.
    f.online = false;
    const ready = await f.crud.create(f.owner, f.input, f.token);
    f.online = true;
    await f.run();
    assert.ok(f.server.has(ready.id));
    assert.equal(f.server.has(originalId), false);
    blog = await f.crud.update(
      f.owner,
      blog,
      {
        title: blog.title,
        content: blog.content,
        categoryId: f.input.categoryId,
        tagIds: [],
      },
      f.token,
    );
    assert.equal(blog.id, originalId);
    const queue = await f.queue();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].operation_type, "CREATE");
    assert.equal(JSON.parse(queue[0].payload).input.status, status);
    assert.equal(JSON.parse(queue[0].payload).input.image.uri, localCover);
    await f.run();
    await f.run();
    assert.equal(f.server.get(originalId).title, "Latest text");
    assert.equal(f.server.get(originalId).status, status);
    assert.equal(f.server.get(originalId).categoryId, f.input.categoryId);
    assert.equal(
      f.server.get(originalId).coverImageUrl,
      "https://example.com/cover.jpg",
    );
    assert.equal(
      f.calls.filter((call) => call.entityId === originalId).length,
      1,
    );
    assert.equal((await f.queue()).length, 0);
  });
}

test("uncategorized creation stays local even with a positive connectivity report and never requests a token", async (t) => {
  const f = fixture(t);
  let blog = await f.crud.create(
    f.owner,
    { ...f.input, categoryId: "", status: "published" },
    async () => {
      throw new Error("Incomplete posts must not need a token");
    },
  );
  assert.equal(f.calls.length, 0);
  assert.equal(blog.syncStatus, "pending");
  assert.equal(blog.categoryId, null);
  blog = await f.crud.update(
    f.owner,
    blog,
    { title: "Updated locally", content: "Body" },
    f.token,
  );
  await f.run();
  assert.equal(f.calls.length, 0);
  assert.equal((await f.queue()).length, 1);
  f.online = false;
  await f.crud.remove(f.owner, blog, f.token);
  assert.equal((await f.queue()).length, 0);
  assert.equal(await f.local.getLocalPost(f.owner.id, blog.id), null);
});

test("account databases are isolated, aborted workers do not send, and retry delays are bounded", async (t) => {
  const f = fixture(t);
  f.online = false;
  await f.crud.create(f.owner, f.input, f.token);
  const other = { ...f.owner, id: randomUUID() };
  assert.equal(
    (await f.crud.list(other, "draft", 1, async () => other.id)).items.length,
    0,
  );
  f.online = true;
  const controller = new AbortController();
  controller.abort();
  await f.run(controller.signal);
  assert.equal(f.calls.length, 0);
  assert.equal(f.sync.retryDelay(1), 2000);
  assert.equal(f.sync.retryDelay(100), 300000);
});
