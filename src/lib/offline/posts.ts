import { validateBlogEdits } from "@/lib/blog-validation";
import type {
  BlogEdits,
  BlogStatus,
  CoverUpload,
  NewBlogInput,
} from "@/types/blog";
import type { LocalPost } from "@/types/offline";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { persistCover } from "./cover";
import { getAccountDatabase, writeTransaction } from "./database";

function removeUncommittedCover(image?: CoverUpload): void {
  if (!image) return;

  try {
    const file = new File(image.uri);
    if (file.exists) file.delete();
  } catch {
    // Keep the original database error if cleanup fails.
  }
}

export async function createLocalPost(
  userId: string,
  input: NewBlogInput,
): Promise<string> {
  const errors = validateBlogEdits(input);

  if (errors.title || errors.content) {
    throw new Error(errors.title ?? errors.content);
  }

  const db = await getAccountDatabase(userId);
  const postId = randomUUID();
  const operationId = randomUUID();

  // shortcut: interrupted saves can leave orphan covers; collect them after sync reconciliation.
  const image = input.image
    ? await persistCover(userId, input.image)
    : undefined;

  try {
    const now = new Date().toISOString();

    const post: NewBlogInput = {
      title: input.title.trim(),
      content: input.content,
      categoryId: input.categoryId,
      tagIds: input.tagIds ?? [],
      coverImageUrl: image ? null : (input.coverImageUrl ?? null),
      status: input.status,
      ...(image ? { image } : {}),
    };

    await writeTransaction(db, async (transaction) => {
      await transaction.runAsync(
        `INSERT INTO posts (
          id,
          author_id,
          title,
          content,
          category_id,
          tag_ids,
          cover_image_url,
          local_image,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        postId,
        userId.toLowerCase(),
        post.title,
        post.content,
        post.categoryId || null,
        JSON.stringify(post.tagIds),
        post.coverImageUrl ?? null,
        image ? JSON.stringify(image) : null,
        post.status,
        now,
        now,
      );

      await transaction.runAsync(
        `INSERT INTO sync_queue (
          operation_id,
          entity_id,
          operation_type,
          payload,
          created_at
        ) VALUES (?, ?, 'CREATE', ?, ?);`,
        operationId,
        postId,
        JSON.stringify({
          revision: 1,
          input: post,
        }),
        now,
      );
    });

    return postId;
  } catch (error) {
    removeUncommittedCover(image);
    throw error;
  }
}

export async function listLocalPosts(
  userId: string,
  status: BlogStatus,
  page = 1,
): Promise<LocalPost[]> {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("Page must be a positive integer.");
  }

  const db = await getAccountDatabase(userId);
  const limit = 10;

  return db.getAllAsync<LocalPost>(
    `SELECT * FROM posts
     WHERE author_id = ?
       AND status = ?
       AND is_deleted = 0
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?;`,
    userId.toLowerCase(),
    status,
    limit,
    (page - 1) * limit,
  );
}

export async function getLocalPost(
  userId: string,
  postId: string,
): Promise<LocalPost | null> {
  const db = await getAccountDatabase(userId);

  return db.getFirstAsync<LocalPost>(
    `SELECT * FROM posts
     WHERE id = ?
       AND author_id = ?
       AND is_deleted = 0;`,
    postId,
    userId.toLowerCase(),
  );
}

export async function updateLocalPost(
  userId: string,
  postId: string,
  edits: BlogEdits,
  expectedRevision: number,
): Promise<void> {
  const errors = validateBlogEdits(edits);

  if (errors.title || errors.content) {
    throw new Error(errors.title ?? errors.content);
  }

  if (edits.categoryId !== undefined && !edits.categoryId) {
    throw new Error("Choose a category for your post.");
  }

  const db = await getAccountDatabase(userId);
  const image = edits.image
    ? await persistCover(userId, edits.image)
    : undefined;

  try {
    await writeTransaction(db, async (transaction) => {
      const current = await transaction.getFirstAsync<LocalPost>(
        `SELECT * FROM posts
       WHERE id = ?
         AND author_id = ?
         AND is_deleted = 0;`,
        postId,
        userId.toLowerCase(),
      );

      if (!current) {
        throw new Error("Post not found.");
      }

      if (current.local_revision !== expectedRevision) {
        throw new Error("This post has changed. Reopen it before editing.");
      }

      if (current.sync_status === "conflict") {
        throw new Error("Resolve this post's sync conflict before editing.");
      }

      const revision = current.local_revision + 1;
      const now = new Date().toISOString();

      const input: BlogEdits = {
        title: edits.title.trim(),
        content: edits.content,
        ...(edits.status !== undefined ? { status: edits.status } : {}),
        ...(edits.categoryId !== undefined
          ? { categoryId: edits.categoryId }
          : {}),
        ...(edits.tagIds !== undefined ? { tagIds: edits.tagIds } : {}),
        ...(image
          ? { image }
          : edits.coverImageUrl !== undefined
            ? { coverImageUrl: edits.coverImageUrl }
            : {}),
      };

      const localImage = image
        ? JSON.stringify(image)
        : input.coverImageUrl !== undefined
          ? null
          : current.local_image;
      let queueInput = input;
      let operationType: "CREATE" | "UPDATE" = "UPDATE";
      const deferredCreate = await transaction.getFirstAsync<{
        payload: string;
      }>(
        `SELECT payload FROM sync_queue WHERE entity_id=? AND operation_type='CREATE'
         AND attempts=0 AND NOT EXISTS (
           SELECT 1 FROM sync_queue WHERE entity_id=? AND attempts>0
         )`,
        postId,
        postId,
      );
      const waitingForCategory =
        deferredCreate &&
        !(
          JSON.parse(deferredCreate.payload) as {
            input: { categoryId?: string };
          }
        ).input.categoryId;
      if (current.sync_status === "failed" || waitingForCategory) {
        // Rebuild rejected or incomplete unsent creations; never change an uncertain payload.
        await transaction.runAsync(
          "DELETE FROM sync_queue WHERE entity_id=?",
          postId,
        );
        operationType = current.server_version === null ? "CREATE" : "UPDATE";
        queueInput = {
          title: input.title,
          content: input.content,
          status: input.status ?? current.status,
          ...((input.categoryId ?? current.category_id)
            ? { categoryId: input.categoryId ?? current.category_id! }
            : {}),
          tagIds: input.tagIds ?? (JSON.parse(current.tag_ids) as string[]),
          ...(localImage
            ? { image: JSON.parse(localImage) as CoverUpload }
            : {
                coverImageUrl:
                  input.coverImageUrl !== undefined
                    ? input.coverImageUrl
                    : current.cover_image_url,
              }),
        };
      }

      await transaction.runAsync(
        `UPDATE posts SET
        title = ?,
        content = ?,
        category_id = ?,
        tag_ids = ?,
        cover_image_url = ?,
        local_image = ?,
        status = ?,
        local_revision = ?,
        sync_status = 'pending',
        updated_at = ?
       WHERE id = ? AND author_id = ?;`,
        input.title,
        input.content,
        input.categoryId ?? current.category_id,
        input.tagIds !== undefined
          ? JSON.stringify(input.tagIds)
          : current.tag_ids,
        input.coverImageUrl !== undefined
          ? input.coverImageUrl
          : current.cover_image_url,
        // Earlier queue entries may still need the previous cover file.
        localImage,
        input.status ?? current.status,
        revision,
        now,
        postId,
        userId.toLowerCase(),
      );

      await transaction.runAsync(
        `INSERT INTO sync_queue (
        operation_id,
        entity_id,
        operation_type,
        payload,
        created_at
        ) VALUES (?, ?, ?, ?, ?);`,
        randomUUID(),
        postId,
        operationType,
        JSON.stringify({
          revision,
          baseVersion: current.server_version,
          input: queueInput,
        }),
        now,
      );
    });
  } catch (error) {
    removeUncommittedCover(image);
    throw error;
  }
}

export async function deleteLocalPost(
  userId: string,
  postId: string,
  expectedRevision: number,
): Promise<void> {
  const db = await getAccountDatabase(userId);
  const authorId = userId.toLowerCase();

  await writeTransaction(db, async (transaction) => {
    const current = await transaction.getFirstAsync<LocalPost>(
      `SELECT * FROM posts
       WHERE id = ? AND author_id = ?;`,
      postId,
      authorId,
    );

    if (!current) {
      throw new Error("Post not found.");
    }

    // Repeated deletion must not add another queue entry.
    if (current.is_deleted === 1) return;

    if (current.local_revision !== expectedRevision) {
      throw new Error("This post has changed. Reopen it before deleting.");
    }

    if (current.sync_status === "conflict") {
      throw new Error("Resolve this post's sync conflict before deleting.");
    }

    const unsentCreate = await transaction.getFirstAsync<{
      operation_id: string;
    }>(
      `SELECT operation_id FROM sync_queue
       WHERE entity_id = ?
         AND operation_type = 'CREATE'
         AND attempts = 0
         AND status = 'pending'
         AND NOT EXISTS (
           SELECT 1 FROM sync_queue
           WHERE entity_id = ? AND attempts > 0
         )
       LIMIT 1;`,
      postId,
      postId,
    );

    if (current.server_version === null && unsentCreate) {
      await transaction.runAsync(
        "DELETE FROM sync_queue WHERE entity_id = ?;",
        postId,
      );

      await transaction.runAsync(
        "DELETE FROM posts WHERE id = ? AND author_id = ?;",
        postId,
        authorId,
      );

      return;
    }

    const revision = current.local_revision + 1;
    const now = new Date().toISOString();

    await transaction.runAsync(
      `UPDATE posts SET
        is_deleted = 1,
        local_revision = ?,
        sync_status = 'pending',
        updated_at = ?
       WHERE id = ? AND author_id = ?;`,
      revision,
      now,
      postId,
      authorId,
    );

    await transaction.runAsync(
      `INSERT INTO sync_queue (
        operation_id,
        entity_id,
        operation_type,
        payload,
        created_at
      ) VALUES (?, ?, 'DELETE', ?, ?);`,
      randomUUID(),
      postId,
      JSON.stringify({
        revision,
        baseVersion: current.server_version,
      }),
      now,
    );
  });
}
