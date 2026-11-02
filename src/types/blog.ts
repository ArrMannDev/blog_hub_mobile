export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Tag extends Category {
  categoryId: string;
}

export type BlogStatus = "draft" | "published";

export interface BlogEdits {
  status?: BlogStatus;
  title: string;
  content: string;
}

export interface NewBlogInput extends BlogEdits {
  tagIds?: string[];
  categoryId: string;
  status: BlogStatus;
}

export interface BlogSummary {
  id: string;
  title: string;
  slug: string;
  author: { id: string; displayName: string };
  categoryId: string | null;
  category: Category | null;
  categoryName: string;
  tags: Tag[];
  coverImageUrl: string | null;
  publishedAt: string | null;
  status: BlogStatus;
  publicationBlocked: boolean;
  createdAt: string;
  updatedAt: string;
  excerpt: string;
}

export interface Blog extends Omit<BlogSummary, "excerpt"> {
  content: string;
}

export interface BlogPage {
  items: BlogSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface BlogFilters {
  q?: string;
  category?: string;
  tag?: string;
  author?: string;
}
