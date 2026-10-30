export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Tag extends Category {
  categoryId: string;
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
