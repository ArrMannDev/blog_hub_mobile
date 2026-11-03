import { Platform } from "react-native";
import { api } from "./api";
import { hasInternet } from "./connectivity";
import { readCache, writeCache } from "./offline/cache";
import type { Category, Tag } from "@/types/blog";

async function load<T>(
  userId: string | undefined,
  key: string,
  request: () => Promise<T>,
  emptyWhenMissing?: T,
): Promise<T> {
  if (!userId || Platform.OS === "web") return request();
  if (await hasInternet()) {
    const result = await request();
    await writeCache(userId, key, result).catch(() => {});
    return result;
  }
  const cached = await readCache<T>(userId, key);
  if (cached === null && emptyWhenMissing !== undefined)
    return emptyWhenMissing;
  if (cached === null)
    throw new Error("Connect once to save categories and tags on this phone.");
  return cached;
}
export const postTaxonomy = {
  categories: (userId: string | undefined, signal?: AbortSignal) =>
    load<Category[]>(userId, "categories", () => api.categories(signal)),
  tags: (userId: string | undefined, id: string, signal?: AbortSignal) =>
    load<Tag[]>(userId, `tags:${id}`, () => api.tags(id, signal), []),
};
