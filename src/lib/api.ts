import type { Blog, BlogPage, Category, Tag } from "@/types/blog";
import { API_ORIGIN } from "./reading";

export class ApiError extends Error {
  constructor(public status: number) {
    super(
      status === 404
        ? "This article is no longer available."
        : "We couldn't load this right now. Please try again.",
    );
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 25_000);
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new ApiError(response.status);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export const api = {
  blogs: (query: string, signal?: AbortSignal) =>
    get<BlogPage>(`/blogs?${query}`, signal),
  blog: (slug: string, signal?: AbortSignal) =>
    get<Blog>(`/blogs/${encodeURIComponent(slug)}`, signal),
  categories: (signal?: AbortSignal) => get<Category[]>("/categories", signal),
  tags: (categoryId: string, signal?: AbortSignal) =>
    get<Tag[]>(`/tags?categoryId=${encodeURIComponent(categoryId)}`, signal),
};
