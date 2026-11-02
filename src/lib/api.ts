import { fetch } from "expo/fetch";
import type { Blog, BlogPage, Category, Tag } from "@/types/blog";
import { API_ORIGIN } from "./reading";

export class ApiError extends Error {
  constructor(
    public status: number,
    message?: string,
  ) {
    super(
      message ??
        (status === 404
          ? "This article is no longer available."
          : "We couldn't load this right now. Please try again."),
    );
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 25_000,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
      credentials: "omit",
      redirect: "error",
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      let message: string | undefined;
      if ([400, 401, 409].includes(response.status)) {
        const body: unknown = await response.json().catch(() => null);
        if (body && typeof body === "object" && "message" in body) {
          const value = body.message;
          if (typeof value === "string") message = value.slice(0, 500);
          else if (Array.isArray(value))
            message = value
              .filter((item): item is string => typeof item === "string")
              .join("\n")
              .slice(0, 500);
        }
      }
      if (response.status === 429)
        message = "Too many attempts. Please wait a minute and try again.";
      if (response.status === 403)
        message = "This action isn't available for your account right now.";
      if (response.status === 503)
        message =
          "This service is temporarily unavailable. Please try again later.";
      if (response.status === 413)
        message = "Choose a cover image no larger than 5 MB.";
      if (response.status === 415)
        message = "Choose a JPEG, PNG, or WebP cover image.";
      throw new ApiError(response.status, message);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(
      controller.signal.aborted
        ? "The request took too long. Please try again."
        : "Couldn't reach BlogHub. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export const api = {
  blogs: (query: string, signal?: AbortSignal) =>
    request<BlogPage>(`/blogs?${query}`, { signal }),
  blog: (slug: string, signal?: AbortSignal) =>
    request<Blog>(`/blogs/${encodeURIComponent(slug)}`, { signal }),
  categories: (signal?: AbortSignal) =>
    request<Category[]>("/categories", { signal }),
  tags: (categoryId: string, signal?: AbortSignal) =>
    request<Tag[]>(`/tags?categoryId=${encodeURIComponent(categoryId)}`, {
      signal,
    }),
};
