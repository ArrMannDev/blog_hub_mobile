import type { Category } from "./blog";

export type TaxonomyKind = "categories" | "tags";

export interface TaxonomyEntry extends Category {
  createdById: string;
  categoryId?: string;
}
