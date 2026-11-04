export const actionLabels = {
  updated: "Edited post",
  published: "Published post",
  unpublished: "Moved to draft",
  deleted: "Deleted post",
  trashed: "Moved to Trash",
  restored: "Restored to drafts",
  permanently_deleted: "Permanently deleted post",
};

export const historyFields: Record<string, string> = {
  title: "Title",
  content: "Content",
  category: "Category",
  tags: "Tags",
  coverImageUrl: "Cover image",
  status: "Status",
  publicationBlocked: "Publishing restricted",
  publishedAt: "Publication date",
};

export function historyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.length ? value.map(historyValue).join(", ") : "None";
  }
  if (typeof value === "object") {
    if ("name" in value && typeof value.name === "string") return value.name;
    return JSON.stringify(value);
  }
  return String(value);
}
