import type { Blog, BlogPage, Category, Tag } from "@/types/blog";
import { fetch } from "expo/fetch";
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

const errorMessages: Partial<Record<number, string>> = {
  403: "This action isn't available for your account right now.",
  413: "Choose a cover image no larger than 5 MB.",
  415: "Choose a JPEG, PNG, or WebP cover image.",
  429: "Too many attempts. Please wait a minute and try again.",
  503: "This service is temporarily unavailable. Please try again later.",
};

async function readErrorMessage(
  response: Awaited<ReturnType<typeof fetch>>,
): Promise<string | undefined> {
  if (![400, 401, 409].includes(response.status)) {
    return errorMessages[response.status];
  }

  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || !("message" in body)) {
    return undefined;
  }

  const { message } = body;
  if (typeof message === "string") {
    return message.slice(0, 500);
  }
  if (Array.isArray(message)) {
    return message
      .filter((item): item is string => typeof item === "string")
      .join("\n")
      .slice(0, 500);
  }
  return undefined;
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 25_000,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) {
    abort();
  }
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
      credentials: "omit",
      redirect: "error",
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(response.status, await readErrorMessage(response));
    }
    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
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
  blogs: (query: string, signal?: AbortSignal) => {
    return request<BlogPage>(`/blogs?${query}`, { signal });
  },
  blog: (slug: string, signal?: AbortSignal) => {
    return request<Blog>(`/blogs/${encodeURIComponent(slug)}`, { signal });
  },
  categories: (signal?: AbortSignal) => {
    return request<Category[]>("/categories", { signal });
  },
  tags: (categoryId: string, signal?: AbortSignal) => {
    return request<Tag[]>(
      `/tags?categoryId=${encodeURIComponent(categoryId)}`,
      {
        signal,
      },
    );
  },
};
