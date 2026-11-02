import type { BlogEdits } from "@/types/blog";

export function validateBlogEdits({ title, content }: BlogEdits) {
  return {
    title:
      !title.trim() || [...title.trim()].length > 200
        ? "Enter a title between 1 and 200 characters."
        : undefined,
    content:
      !content.trim() || [...content].length > 100_000
        ? "Enter content between 1 and 100,000 characters."
        : undefined,
  };
}
