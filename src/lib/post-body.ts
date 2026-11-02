import type { BlogEdits, CoverUpload } from "@/types/blog";
import { File } from "expo-file-system";

export function validateCover(image: CoverUpload) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(image.mimeType))
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (
    !Number.isFinite(image.size) ||
    image.size <= 0 ||
    image.size > 5 * 1024 * 1024
  )
    throw new Error("Choose an image no larger than 5 MB.");
  if (!image.uri) throw new Error("Couldn't read this image. Choose it again.");
}

export function postBody(input: BlogEdits): {
  headers: Record<string, string>;
  body: BodyInit;
} {
  const fields = {
    title: input.title,
    content: input.content,
    ...(input.status ? { status: input.status } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.tagIds !== undefined ? { tagIds: input.tagIds } : {}),
    ...(input.coverImageUrl !== undefined && !input.image
      ? { coverImageUrl: input.coverImageUrl }
      : {}),
  };
  if (!input.image) {
    return {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    };
  }
  validateCover(input.image);
  const body = new FormData();
  for (const [key, value] of Object.entries(fields))
    body.append(
      key,
      Array.isArray(value) ? JSON.stringify(value) : String(value),
    );
  const image = input.image;
  body.append("image", image.file ?? new File(image.uri));
  return { headers: {}, body };
}
