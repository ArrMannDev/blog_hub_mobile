import type {
  Blog,
  BlogEdits,
  BlogPage,
  BlogStatus,
  NewBlogInput,
} from "@/types/blog";
import { request } from "./api";

export const myBlogsApi = {
  create: (input: NewBlogInput, token: string) =>
    request<Blog>("/blogs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        content: input.content,
        categoryId: input.categoryId,
        ...(input.tagIds?.length ? { tagIds: input.tagIds } : {}),
        status: input.status,
      }),
    }),
  list: (
    status: BlogStatus,
    page: number,
    token: string,
    signal?: AbortSignal,
  ) =>
    request<BlogPage>(`/me/blogs?status=${status}&page=${page}&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }),
  detail: (id: string, token: string, signal?: AbortSignal) =>
    request<Blog>(`/me/blogs/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }),
  update: (id: string, edits: BlogEdits, token: string) =>
    request<Blog>(`/blogs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // Publication status changes only when the user explicitly chooses it.
      body: JSON.stringify({
        title: edits.title,
        content: edits.content,
        ...(edits.status ? { status: edits.status } : {}),
      }),
    }),
};
