import { request } from "./api";
import type {
  Comment,
  CommentPage,
  ReactionSummary,
  ReactionType,
} from "@/types/discussion";

export function commentContent(value: string): string {
  const content = value.trim();
  if (!content || [...content].length > 2000) {
    throw new Error("Write a comment between 1 and 2,000 characters.");
  }
  return content;
}

function commentPath(blogId: string, parentId?: string) {
  if (parentId) {
    return `/comments/${encodeURIComponent(parentId)}/replies`;
  }
  return `/blogs/${encodeURIComponent(blogId)}/comments`;
}

export const discussionApi = {
  commentCount: async (blogId: string, signal?: AbortSignal) => {
    return (
      await request<CommentPage>(`${commentPath(blogId)}?page=1&limit=1`, {
        signal,
      })
    ).total;
  },
  comments: (
    blogId: string,
    page: number,
    parentId?: string,
    signal?: AbortSignal,
  ) => {
    return request<CommentPage>(
      `${commentPath(blogId, parentId)}?page=${page}&limit=10`,
      { signal },
    );
  },
  save: (
    blogId: string,
    content: string,
    token: string,
    options: { parentId?: string; editId?: string } = {},
  ) => {
    return request<Comment>(
      options.editId
        ? `/comments/${encodeURIComponent(options.editId)}`
        : commentPath(blogId, options.parentId),
      {
        method: options.editId ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: commentContent(content) }),
      },
    );
  },
  remove: (id: string, token: string) => {
    return request<void>(`/comments/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  reactions: (
    kind: "blogs" | "comments",
    id: string,
    token?: string,
    signal?: AbortSignal,
  ) => {
    return request<ReactionSummary>(
      `/${kind}/${encodeURIComponent(id)}/reactions`,
      {
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        signal,
      },
    );
  },
  react: (
    kind: "blogs" | "comments",
    id: string,
    type: ReactionType,
    token: string,
  ) => {
    return request<ReactionSummary>(
      `/${kind}/${encodeURIComponent(id)}/reactions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type }),
      },
    );
  },
};
