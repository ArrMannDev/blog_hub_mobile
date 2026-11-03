import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { ApiError, request } from "./api";
import { postBody } from "./post-body";
import { getAccountDatabase, writeTransaction } from "./offline/database";
import { cacheRemotePost } from "./offline/cache";
import { hasInternet } from "./connectivity";
import { notifyPostChange } from "./post-events";
import type { AuthUser } from "@/types/auth";
import type { Blog } from "@/types/blog";
import type { LocalPost, SyncOperation, SyncPayload } from "@/types/offline";

const workers = new Map<string, Promise<void>>();
export const isPostSyncRunning = (userId: string) => workers.has(userId);
export class LocalPostSyncError extends Error {}
export class PostSyncUnavailableError extends Error {
  constructor() {
    super(
      "Automatic uploads are temporarily unavailable. Your changes are saved on this phone.",
    );
  }
}
export const retryDelay = (attempts: number) =>
  Math.min(300_000, 1000 * 2 ** Math.min(attempts, 9));

async function pull(
  user: AuthUser,
  token: () => Promise<string>,
  signal: AbortSignal,
) {
  const db = await getAccountDatabase(user.id);
  const scanId = randomUUID();
  const baseline = await db.getAllAsync<LocalPost>(
    "SELECT * FROM posts WHERE sync_status='synced'",
  );
  const snapshots = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key,value FROM offline_cache WHERE key LIKE 'post:%'",
  );
  const seen = new Set<string>();
  let after: string | null = null;
  do {
    const page: { items: Blog[]; nextCursor: string | null } = await request<{
      items: Blog[];
      nextCursor: string | null;
    }>(`/me/blog-sync${after ? `?after=${encodeURIComponent(after)}` : ""}`, {
      headers: { Authorization: `Bearer ${await token()}` },
      signal,
    });
    if (
      !Array.isArray(page.items) ||
      (page.nextCursor !== null && typeof page.nextCursor !== "string")
    )
      throw new Error("Invalid post synchronization response.");
    for (const blog of page.items) {
      if (
        blog.author?.id !== user.id ||
        !Number.isInteger(blog.version) ||
        (blog.version ?? 0) < 1
      )
        throw new PostSyncUnavailableError();
      if (seen.has(blog.id))
        throw new Error("Post synchronization pagination repeated a post.");
      if (signal.aborted) return;
      seen.add(blog.id);
      await cacheRemotePost(user, blog, scanId);
    }
    if (page.nextCursor && page.nextCursor === after)
      throw new Error("Post synchronization cursor did not advance.");
    after = page.nextCursor;
  } while (after && !signal.aborted);
  if (signal.aborted) return;
  await writeTransaction(db, async (tx) => {
    for (const row of baseline) {
      if (seen.has(row.id)) continue;
      // Do not erase a local save made while the server snapshot was downloading.
      const removed = await tx.runAsync(
        "DELETE FROM posts WHERE id=? AND sync_status='synced' AND local_revision=? AND server_version IS ?",
        row.id,
        row.local_revision,
        row.server_version,
      );
      if (removed.changes)
        await tx.runAsync(
          "DELETE FROM offline_cache WHERE key=?",
          `post:${row.id}`,
        );
    }
    for (const cached of snapshots) {
      const blog = JSON.parse(cached.value) as Blog;
      if (seen.has(blog.id)) continue;
      const local = await tx.getFirstAsync<LocalPost>(
        "SELECT * FROM posts WHERE id=?",
        blog.id,
      );
      if (!local)
        await tx.runAsync(
          "DELETE FROM offline_cache WHERE key=? AND value=?",
          cached.key,
          cached.value,
        );
    }
  });
}

async function synchronize(
  user: AuthUser,
  token: () => Promise<string>,
  signal: AbortSignal,
) {
  if (!(await hasInternet()) || signal.aborted) return;
  let uploaded = false;
  const db = await getAccountDatabase(user.id);
  // A complete snapshot also proves that the deployed backend supports safe retries.
  try {
    await pull(user, token, signal);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      throw new PostSyncUnavailableError();
    throw error;
  }
  for (let count = 0; count < 30 && !signal.aborted; count++) {
    let operation: SyncOperation | null = null;
    let skipped = false;
    await writeTransaction(db, async (tx) => {
      operation = await tx.getFirstAsync<SyncOperation>(
        `SELECT q.* FROM sync_queue q WHERE q.status='pending' AND q.next_attempt_at<=?
        AND (q.operation_type='DELETE' OR EXISTS (SELECT 1 FROM posts p WHERE p.id=q.entity_id AND p.category_id IS NOT NULL AND p.category_id!=''))
        AND NOT EXISTS (SELECT 1 FROM sync_queue earlier WHERE earlier.entity_id=q.entity_id AND earlier.sequence<q.sequence)
        ORDER BY q.sequence LIMIT 1`,
        Date.now(),
      );
      if (!operation) return;
      const payload = JSON.parse(operation.payload) as SyncPayload;
      const row = await tx.getFirstAsync<LocalPost>(
        "SELECT * FROM posts WHERE id=? AND author_id=?",
        operation.entity_id,
        user.id,
      );
      if (!row) throw new Error("A pending operation has no local post.");
      if (
        operation.operation_type !== "CREATE" &&
        payload.baseVersion == null
      ) {
        if (row.server_version === null) {
          await tx.runAsync(
            "UPDATE sync_queue SET status='conflict',last_error=? WHERE operation_id=?",
            "This post has no verified server version. Review it before syncing.",
            operation.operation_id,
          );
          await tx.runAsync(
            "UPDATE posts SET sync_status='conflict' WHERE id=?",
            row.id,
          );
          operation = null;
          skipped = true;
          return;
        }
        payload.baseVersion = row.server_version;
      }
      operation.payload = JSON.stringify(payload);
      await tx.runAsync(
        "UPDATE sync_queue SET attempts=attempts+1,payload=? WHERE operation_id=?",
        operation.payload,
        operation.operation_id,
      );
    });
    // TypeScript cannot track assignments performed by a transaction callback.
    const job = operation as SyncOperation | null;
    if (!job) {
      if (skipped) continue;
      break;
    }
    const payload = JSON.parse(job.payload) as SyncPayload;
    try {
      const metadata = {
        operationId: job.operation_id,
        entityId: job.entity_id,
        type: job.operation_type,
        ...(payload.baseVersion != null
          ? { baseVersion: payload.baseVersion }
          : {}),
      };
      const content =
        payload.input && !payload.input.image ? postBody(payload.input) : null;
      let body: BodyInit;
      let headers: Record<string, string>;
      if (payload.input?.image) {
        // The sync endpoint takes the editable fields as one JSON input field.
        const syncForm = new FormData();
        for (const [key, value] of Object.entries(metadata))
          syncForm.append(key, String(value));
        const { image, expectedVersion: _expected, ...fields } = payload.input;
        void image;
        void _expected;
        delete fields.coverImageUrl;
        syncForm.append("input", JSON.stringify(fields));
        const file = new File(payload.input.image.uri);
        if (!file.exists)
          throw new LocalPostSyncError(
            "The local cover is missing. Choose it again.",
          );
        syncForm.append("image", file);
        body = syncForm;
        headers = {};
      } else {
        body = JSON.stringify({
          ...metadata,
          ...(content
            ? { input: JSON.parse(content.body as string) as unknown }
            : {}),
        });
        headers = { "Content-Type": "application/json" };
      }
      const result = await request<{
        blog?: Blog;
        deleted?: boolean;
        id?: string;
      }>(
        "/me/blog-sync",
        {
          method: "POST",
          headers: { ...headers, Authorization: `Bearer ${await token()}` },
          body,
          signal,
        },
        payload.input?.image ? 90_000 : 25_000,
      );
      if (
        job.operation_type === "DELETE"
          ? result.deleted !== true || result.id !== job.entity_id
          : !result.blog ||
            result.blog.id !== job.entity_id ||
            result.blog.author.id !== user.id ||
            !Number.isInteger(result.blog.version)
      )
        throw new Error("Missing post synchronization confirmation.");
      await writeTransaction(db, async (tx) => {
        await tx.runAsync(
          "DELETE FROM sync_queue WHERE operation_id=?",
          job.operation_id,
        );
        if (result.deleted) {
          await tx.runAsync("DELETE FROM posts WHERE id=?", job.entity_id);
          await tx.runAsync(
            "DELETE FROM offline_cache WHERE key=?",
            `post:${job.entity_id}`,
          );
          return;
        }
        const blog = result.blog!;
        await tx.runAsync(
          "INSERT INTO offline_cache(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          `post:${blog.id}`,
          JSON.stringify(blog),
        );
        const remaining = await tx.getAllAsync<SyncOperation>(
          "SELECT * FROM sync_queue WHERE entity_id=? ORDER BY sequence",
          job.entity_id,
        );
        // Only our own confirmed write may advance the base of following unattempted edits.
        for (const next of remaining)
          if (next.attempts === 0) {
            const nextPayload = JSON.parse(next.payload) as SyncPayload;
            if (
              nextPayload.baseVersion == null ||
              nextPayload.baseVersion === payload.baseVersion
            ) {
              nextPayload.baseVersion = blog.version;
              await tx.runAsync(
                "UPDATE sync_queue SET payload=? WHERE operation_id=?",
                JSON.stringify(nextPayload),
                next.operation_id,
              );
            }
          }
        await tx.runAsync(
          "UPDATE posts SET server_version=? WHERE id=?",
          blog.version!,
          blog.id,
        );
        if (!remaining.length)
          await tx.runAsync(
            "UPDATE posts SET sync_status='synced',local_image=NULL,cover_image_url=?,cached_at=? WHERE id=?",
            blog.coverImageUrl,
            Date.now(),
            blog.id,
          );
      });
      uploaded = true;
    } catch (error) {
      const conflict =
        error instanceof ApiError && [409, 404].includes(error.status);
      const permanent =
        error instanceof LocalPostSyncError ||
        (error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500 &&
          ![408, 429].includes(error.status));
      const status = conflict ? "conflict" : permanent ? "failed" : "pending";
      const message =
        error instanceof Error ? error.message : "Could not upload this post.";
      await writeTransaction(db, async (tx) => {
        await tx.runAsync(
          "UPDATE sync_queue SET status=?,last_error=?,next_attempt_at=? WHERE operation_id=?",
          status,
          message,
          Date.now() + retryDelay(job.attempts + 1),
          job.operation_id,
        );
        await tx.runAsync(
          "UPDATE posts SET sync_status=? WHERE id=?",
          status === "pending" ? "pending" : status,
          job.entity_id,
        );
      });
      if (signal.aborted || !(await hasInternet())) break;
    }
  }
  if (!signal.aborted) await pull(user, token, signal);
  if (uploaded) notifyPostChange(user.id, true);
}

export function syncPosts(
  user: AuthUser,
  token: () => Promise<string>,
  signal: AbortSignal,
): Promise<void> {
  const existing = workers.get(user.id);
  if (existing)
    return existing
      .catch(() => {})
      .then(() =>
        signal.aborted ? undefined : syncPosts(user, token, signal),
      );
  const result = synchronize(user, token, signal).finally(() => {
    workers.delete(user.id);
  });
  workers.set(user.id, result);
  return result;
}

export async function retryFailedPosts(userId: string) {
  const db = await getAccountDatabase(userId);
  await writeTransaction(db, async (tx) => {
    await tx.runAsync(
      "UPDATE sync_queue SET status='pending',next_attempt_at=0 WHERE status='failed'",
    );
    await tx.runAsync(
      "UPDATE posts SET sync_status='pending' WHERE sync_status='failed'",
    );
  });
}
