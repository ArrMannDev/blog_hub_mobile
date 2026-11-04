import { request } from "./api";
import type { TaxonomyEntry, TaxonomyKind } from "@/types/taxonomy";

export function taxonomyName(value: string) {
  const name = value.trim().replace(/\s+/gu, " ");
  if (!name || [...name].length > 100 || !/[\p{L}\p{N}]/u.test(name)) {
    throw new Error("Use 1–100 characters, including a letter or number.");
  }
  return name;
}

export function canEditTaxonomy(
  entry: TaxonomyEntry,
  user: { id: string; role: string; permissions?: string[] },
) {
  return (
    !!user.id &&
    (entry.createdById === user.id ||
      user.permissions?.includes("taxonomy.manage") === true)
  );
}

export function canDeleteTaxonomy(
  entry: TaxonomyEntry,
  user: { id: string; role: string; permissions?: string[] },
) {
  return (
    entry.createdById === user.id ||
    user.permissions?.includes("taxonomy.delete") === true
  );
}

export const taxonomyApi = {
  list: (kind: TaxonomyKind, categoryId: string, signal?: AbortSignal) => {
    return request<TaxonomyEntry[]>(
      `/${kind}${kind === "tags" && categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ""}`,
      { signal },
    );
  },
  save: (
    kind: TaxonomyKind,
    input: { id?: string; name: string; categoryId?: string },
    token: string,
  ) => {
    const name = taxonomyName(input.name);
    const creatingTag = kind === "tags" && !input.id;
    if (creatingTag && !input.categoryId) {
      throw new Error("Choose a category before creating a tag.");
    }

    const body = creatingTag ? { name, categoryId: input.categoryId } : { name };
    return request<TaxonomyEntry>(
      `/${kind}${input.id ? `/${encodeURIComponent(input.id)}` : ""}`,
      {
        method: input.id ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  },
  remove: (kind: TaxonomyKind, id: string, token: string) => {
    return request<void>(`/${kind}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};
