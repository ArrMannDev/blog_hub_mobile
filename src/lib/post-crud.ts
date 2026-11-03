import { Platform } from "react-native";
import { ApiError } from "./api";
import { myBlogsApi } from "./my-blogs-api";
import { hasInternet } from "./connectivity";
import {
  cacheRemotePost,
  localPostView,
  readCache,
  writeCache,
} from "./offline/cache";
import {
  createLocalPost,
  deleteLocalPost,
  getLocalPost,
  updateLocalPost,
} from "./offline/posts";
import { getAccountDatabase, writeTransaction } from "./offline/database";
import { notifyPostChange } from "./post-events";
import { isPostSyncRunning } from "./post-sync";
import type { AuthUser } from "@/types/auth";
import type {
  Blog,
  BlogEdits,
  BlogPage,
  BlogStatus,
  BlogSummary,
  NewBlogInput,
} from "@/types/blog";
import type { LocalPost } from "@/types/offline";

type Owner = Pick<AuthUser, "id" | "displayName">;
type Token = () => Promise<string>;
export class UnconfirmedPostError extends Error {}

function requireNative() {
  if (Platform.OS === "web")
    throw new Error("Offline post storage is available on iOS and Android.");
}
async function remember(user: Owner, blog: Blog): Promise<Blog> {
  if (Platform.OS === "web") return blog;
  // A failed local cache must not turn a confirmed server save into a retryable creation.
  try {
    await cacheRemotePost(user, blog);
    const row = await getLocalPost(user.id, blog.id);
    return {
      ...blog,
      syncStatus: "synced",
      localRevision: row?.local_revision,
    };
  } catch {
    return blog;
  }
}
async function local(user: Owner, id: string) {
  requireNative();
  const row = await getLocalPost(user.id, id);
  if (!row)
    throw new Error(
      "This post isn't saved on this phone. Open it while connected first.",
    );
  return row;
}

export const postCrud = {
  async discardLocal(
    user: Owner,
    blog: Pick<BlogSummary, "id">,
    token: Token,
  ): Promise<void> {
    requireNative();
    if (isPostSyncRunning(user.id))
      throw new Error(
        "Please wait for the current upload to finish, then try again.",
      );
    if (!(await hasInternet()))
      throw new Error(
        "Connect to load the server copy before discarding local changes.",
      );
    let remote: Blog | null = null;
    try {
      remote = await myBlogsApi.detail(blog.id, await token());
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
    const db = await getAccountDatabase(user.id);
    await writeTransaction(db, async (tx) => {
      await tx.runAsync("DELETE FROM sync_queue WHERE entity_id=?", blog.id);
      await tx.runAsync(
        "DELETE FROM posts WHERE id=? AND author_id=?",
        blog.id,
        user.id,
      );
      await tx.runAsync(
        "DELETE FROM offline_cache WHERE key=?",
        `post:${blog.id}`,
      );
    });
    if (remote) await cacheRemotePost(user, remote);
    notifyPostChange(user.id);
  },
  async create(user: Owner, input: NewBlogInput, token: Token): Promise<Blog> {
    if (!input.categoryId && Platform.OS === "web")
      throw new Error("Choose a category before uploading your post.");
    if (input.categoryId && (await hasInternet())) {
      const accessToken = await token();
      let blog: Blog;
      try {
        blog = await myBlogsApi.create(input, accessToken);
        if (!blog?.id) throw new Error("Missing server confirmation");
      } catch (error) {
        if (!(error instanceof ApiError) || error.status >= 500)
          throw new UnconfirmedPostError(
            "We couldn't confirm whether your post was saved. Check your Profile before creating another one.",
          );
        throw error;
      }
      const result = await remember(user, blog);
      notifyPostChange(user.id);
      return result;
    }
    requireNative();
    const id = await createLocalPost(user.id, input);
    const result = await localPostView(user, await local(user, id));
    notifyPostChange(user.id);
    return result;
  },

  async detail(
    user: Owner,
    id: string,
    token: Token,
    signal?: AbortSignal,
  ): Promise<Blog> {
    const cached =
      Platform.OS === "web" ? null : await getLocalPost(user.id, id);
    if (cached && cached.sync_status !== "synced")
      return localPostView(user, cached);
    if (await hasInternet())
      return remember(user, await myBlogsApi.detail(id, await token(), signal));
    return localPostView(user, await local(user, id));
  },

  async update(
    user: Owner,
    blog: Blog,
    edits: BlogEdits,
    token: Token,
  ): Promise<Blog> {
    if (blog.author.id !== user.id)
      throw new Error("This post belongs to another account.");
    const cached =
      Platform.OS === "web" ? null : await getLocalPost(user.id, blog.id);
    if ((!cached || cached.sync_status === "synced") && (await hasInternet())) {
      const version = blog.version ?? cached?.server_version;
      const result = await remember(
        user,
        await myBlogsApi.update(
          blog.id,
          { ...edits, ...(version ? { expectedVersion: version } : {}) },
          await token(),
        ),
      );
      notifyPostChange(user.id);
      return result;
    }
    const row = await local(user, blog.id);
    await updateLocalPost(
      user.id,
      blog.id,
      edits,
      blog.localRevision ?? row.local_revision,
    );
    const result = await localPostView(user, await local(user, blog.id));
    notifyPostChange(user.id);
    return result;
  },

  async remove(user: Owner, blog: BlogSummary, token: Token): Promise<void> {
    const cached =
      Platform.OS === "web" ? null : await getLocalPost(user.id, blog.id);
    if ((!cached || cached.sync_status === "synced") && (await hasInternet())) {
      try {
        const accessToken = await token();
        const version = blog.version ?? cached?.server_version;
        if (version) await myBlogsApi.remove(blog.id, accessToken, version);
        else await myBlogsApi.remove(blog.id, accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
      }
      if (Platform.OS !== "web") {
        const db = await getAccountDatabase(user.id);
        await writeTransaction(db, async (tx) => {
          await tx.runAsync(
            "DELETE FROM posts WHERE id=? AND sync_status=?",
            blog.id,
            "synced",
          );
          await tx.runAsync(
            "DELETE FROM offline_cache WHERE key=?",
            `post:${blog.id}`,
          );
        }).catch(() => {});
      }
    } else {
      const row = await local(user, blog.id);
      await deleteLocalPost(
        user.id,
        blog.id,
        blog.localRevision ?? row.local_revision,
      );
    }
    notifyPostChange(user.id);
  },

  async setStatus(
    user: Owner,
    blog: BlogSummary,
    status: BlogStatus,
    token: Token,
  ): Promise<Blog> {
    const cached =
      Platform.OS === "web" ? null : await getLocalPost(user.id, blog.id);
    if ((!cached || cached.sync_status === "synced") && (await hasInternet())) {
      const accessToken = await token();
      const version = blog.version ?? cached?.server_version;
      const response = version
        ? await myBlogsApi.setStatus(blog.id, status, accessToken, version)
        : await myBlogsApi.setStatus(blog.id, status, accessToken);
      const result = await remember(user, response);
      notifyPostChange(user.id);
      return result;
    }
    const detail = await postCrud.detail(user, blog.id, token);
    return postCrud.update(
      user,
      detail,
      { title: detail.title, content: detail.content, status },
      token,
    );
  },

  async list(
    user: Owner,
    status: BlogStatus,
    page: number,
    token: Token,
    signal?: AbortSignal,
  ): Promise<BlogPage> {
    if (Platform.OS === "web")
      return myBlogsApi.list(status, page, await token(), signal);
    const db = await getAccountDatabase(user.id);
    if (await hasInternet()) {
      const result = await myBlogsApi.list(status, page, await token(), signal);
      if (signal?.aborted) return result;
      for (const item of result.items) {
        const previous = await readCache<Blog>(user.id, `post:${item.id}`);
        await writeCache(user.id, `post:${item.id}`, {
          ...previous,
          ...item,
        }).catch(() => {});
      }
      const pending = await db.getAllAsync<LocalPost>(
        "SELECT * FROM posts WHERE sync_status!='synced'",
      );
      const hidden = new Set(pending.map((row) => row.id));
      const added =
        page === 1
          ? await Promise.all(
              pending
                .filter((row) => !row.is_deleted && row.status === status)
                .map(async (row) => {
                  const { content, ...summary } = await localPostView(
                    user,
                    row,
                  );
                  return { ...summary, excerpt: content.slice(0, 200) };
                }),
            )
          : [];
      return {
        ...result,
        items: [
          ...added,
          ...result.items.filter((item) => !hidden.has(item.id)),
        ],
      };
    }
    const snapshots = await db.getAllAsync<{ value: string }>(
      "SELECT value FROM offline_cache WHERE key LIKE 'post:%'",
    );
    const posts = new Map<string, BlogSummary>(
      snapshots.map((row) => {
        const blog = JSON.parse(row.value) as Blog & { excerpt?: string };
        return [
          blog.id,
          {
            ...blog,
            excerpt: blog.excerpt ?? blog.content?.slice(0, 200) ?? "",
          },
        ];
      }),
    );
    const rows = await db.getAllAsync<LocalPost>(
      "SELECT * FROM posts WHERE author_id=?",
      user.id,
    );
    for (const row of rows) {
      if (row.is_deleted) {
        posts.delete(row.id);
        continue;
      }
      const { content, ...summary } = await localPostView(user, row);
      posts.set(row.id, { ...summary, excerpt: content.slice(0, 200) });
    }
    const items = [...posts.values()]
      .filter((post) => post.status === status)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
    return {
      items: items.slice((page - 1) * 10, page * 10),
      page,
      limit: 10,
      total: items.length,
      totalPages: Math.ceil(items.length / 10),
    };
  },
};
