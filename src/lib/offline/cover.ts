import { validateCover } from "@/lib/post-body";
import type { CoverUpload } from "@/types/blog";
import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

export async function persistCover(
  userId: string,
  image: CoverUpload,
): Promise<CoverUpload> {
  const accountId = userId.toLowerCase();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      accountId,
    )
  ) {
    throw new Error("A valid user ID is required.");
  }

  validateCover(image);

  if (!/^(file|content):\/\//.test(image.uri)) {
    throw new Error("Choose an image stored on your device.");
  }

  const source = new File(image.uri);

  if (!source.exists) {
    throw new Error("This image is missing. Choose it again.");
  }

  // Check the actual file size, not only the picker's metadata.
  validateCover({ ...image, size: source.size });

  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  const directory = new Directory(Paths.document, "offline-covers", accountId);

  directory.create({
    intermediates: true,
    idempotent: true,
  });

  const name = `${randomUUID()}.${extensions[image.mimeType]}`;
  const destination = new File(directory, name);

  try {
    await source.copy(destination);

    if (!destination.exists) {
      throw new Error("Couldn't save this image on your device.");
    }

    const saved: CoverUpload = {
      uri: destination.uri,
      name,
      mimeType: image.mimeType,
      size: destination.size,
    };

    validateCover(saved);
    return saved;
  } catch (error) {
    try {
      if (destination.exists) destination.delete();
    } catch {
      // Preserve the original error if partial-file cleanup fails.
    }

    throw error;
  }
}
