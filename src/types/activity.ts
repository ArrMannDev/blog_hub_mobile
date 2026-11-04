import type { Blog } from "./blog";

export interface PrivatePage<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  unreadCount?: number;
}

export interface PostNotification {
  id: string;
  userId: string;
  type: "post_unpublished" | "post_deleted" | "post_restored";
  blogId: string;
  blogTitle: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface PostAction {
  id: string;
  blogId: string;
  blogTitle: string;
  actorId: string;
  postAuthorId: string;
  action:
    | "updated"
    | "published"
    | "unpublished"
    | "deleted"
    | "trashed"
    | "restored"
    | "permanently_deleted";
  createdAt: string;
}

export interface PostActionDetail extends PostAction {
  changes: Record<string, { old: unknown; new: unknown }>;
  snapshot: (Omit<Blog, "author"> & { authorId: string }) | null;
}
