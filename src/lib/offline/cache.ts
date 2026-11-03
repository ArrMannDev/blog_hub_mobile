import type { AuthUser } from "@/types/auth";
import type { Blog, BlogSummary, Category, Tag } from "@/types/blog";
import type { LocalPost } from "@/types/offline";
import { getAccountDatabase, writeTransaction } from "./database";

export async function readCache<T>(
  userId: string,
  key: string,
): Promise<T | null> {
  const db = await getAccountDatabase(userId);
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM offline_cache WHERE key = ?",
    key,
  );
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function writeCache(
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const db = await getAccountDatabase(userId);
  await writeTransaction(db, async (tx) => {
    await tx.runAsync(
      "INSERT INTO offline_cache(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      JSON.stringify(value),
    );
  });
}

export async function cacheRemotePost(
  user: Pick<AuthUser, "id">,
  blog: Blog,
  scanId?: string,
): Promise<void> {
  if (blog.author.id !== user.id) {
    throw new Error("This post belongs to another account.");
  }
  const db = await getAccountDatabase(user.id);
  await writeTransaction(db, async (tx) => {
    const existing = await tx.getFirstAsync<LocalPost>(
      "SELECT * FROM posts WHERE id=?",
      blog.id,
    );
    const cached = await tx.getFirstAsync<{ value: string }>(
      "SELECT value FROM offline_cache WHERE key=?",
      `post:${blog.id}`,
    );
    const previous = cached ? (JSON.parse(cached.value) as Blog) : null;
    if (previous?.version && blog.version && previous.version > blog.version) {
      return;
    }
    await tx.runAsync(
      "INSERT INTO offline_cache(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      `post:${blog.id}`,
      JSON.stringify(blog),
    );
    if (existing && existing.sync_status !== "synced") {
      if (scanId)
        await tx.runAsync(
          "UPDATE posts SET scan_id=? WHERE id=?",
          scanId,
          blog.id,
        );
      return;
    }
    await tx.runAsync(
      `INSERT INTO posts (id,author_id,title,content,category_id,tag_ids,cover_image_url,status,server_version,local_revision,sync_status,is_deleted,created_at,updated_at,cached_at,scan_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,'synced',0,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, category_id=excluded.category_id,tag_ids=excluded.tag_ids,cover_image_url=excluded.cover_image_url,local_image=NULL,status=excluded.status,server_version=excluded.server_version,local_revision=excluded.local_revision,is_deleted=0,created_at=excluded.created_at,updated_at=excluded.updated_at,cached_at=excluded.cached_at,scan_id=excluded.scan_id`,
      blog.id,
      user.id,
      blog.title,
      blog.content,
      blog.categoryId,
      JSON.stringify(blog.tags.map((tag) => tag.id)),
      blog.coverImageUrl,
      blog.status,
      blog.version ?? null,
      (existing?.local_revision ?? 0) +
        (previous?.version === blog.version &&
        previous?.updatedAt === blog.updatedAt
          ? 0
          : 1),
      blog.createdAt,
      blog.updatedAt,
      Date.now(),
      scanId ?? existing?.scan_id ?? null,
    );
  });
}

export async function localPostView(
  user: Pick<AuthUser, "id" | "displayName">,
  row: LocalPost,
): Promise<Blog> {
  const snapshot = await readCache<Blog | BlogSummary>(
    user.id,
    `post:${row.id}`,
  );
  const categories = (await readCache<Category[]>(user.id, "categories")) ?? [];
  const tags = row.category_id
    ? ((await readCache<Tag[]>(user.id, `tags:${row.category_id}`)) ?? [])
    : [];
  const ids = JSON.parse(row.tag_ids) as string[];
  const category =
    categories.find((item) => item.id === row.category_id) ??
    (snapshot?.category?.id === row.category_id ? snapshot.category : null);
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    slug: snapshot?.slug ?? row.id,
    author: { id: user.id, displayName: user.displayName },
    categoryId: row.category_id,
    category,
    categoryName: category?.name ?? "Uncategorized",
    tags: ids
      .map(
        (id) =>
          tags.find((tag) => tag.id === id) ??
          snapshot?.tags.find((tag) => tag.id === id),
      )
      .filter((tag): tag is Tag => !!tag),
    coverImageUrl: row.local_image
      ? (JSON.parse(row.local_image) as { uri: string }).uri
      : row.cover_image_url,
    status: row.status,
    publicationBlocked: snapshot?.publicationBlocked ?? false,
    publishedAt: snapshot?.publishedAt ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.server_version ?? undefined,
    localRevision: row.local_revision,
    syncStatus: row.sync_status,
  };
}
