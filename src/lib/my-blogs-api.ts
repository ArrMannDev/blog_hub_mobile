import type {
  Blog,
  BlogEdits,
  BlogPage,
  BlogStatus,
  NewBlogInput,
} from "@/types/blog";
import { request } from "./api";
import { postBody } from "./post-body";

export const myBlogsApi = {
  setStatus: (
    id: string,
    status: BlogStatus,
    token: string,
    expectedVersion?: number,
  ) =>
    request<Blog>(`/blogs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status,
        ...(expectedVersion ? { expectedVersion } : {}),
      }),
    }),
  remove: (id: string, token: string, version?: number) =>
    request<void>(
      `/blogs/${encodeURIComponent(id)}${version ? `?version=${version}` : ""}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    ),
  create: (input: NewBlogInput, token: string) => {
    const payload = postBody(input);
    return request<Blog>(
      "/blogs",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...payload.headers,
        },
        body: payload.body,
      },
      input.image ? 90_000 : 25_000,
    );
  },
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
  update: (id: string, edits: BlogEdits, token: string) => {
    const payload = postBody(edits);
    return request<Blog>(
      `/blogs/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          ...payload.headers,
        },
        // Publication status changes only when the user explicitly chooses it.
        body: payload.body,
      },
      edits.image ? 90_000 : 25_000,
    );
  },
};
