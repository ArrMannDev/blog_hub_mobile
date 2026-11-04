export type ReactionType = "like" | "dislike";

export interface ReactionSummary {
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
}

export interface Comment {
  id: string;
  blogId: string;
  parentId: string | null;
  author: { id: string; displayName: string };
  content: string;
  replyCount: number;
  likeCount: number;
  dislikeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommentPage {
  items: Comment[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
