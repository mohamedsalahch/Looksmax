import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { getUploadCategoryDir } from "@/store/lib/uploadStorage";
import { uploadToR2, deleteFromR2, extractKeyFromPublicUrl } from "@/lib/r2";
import { readValidatedUploadFile, validateUploadBuffer } from "@/lib/uploadValidation";

const R2_PREFIX = "body-profiles";

export async function saveBodyProfileImage(file: File) {
  const { buffer, contentType, extension } = await readValidatedUploadFile(file);
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const key = `${R2_PREFIX}/${filename}`;
  return await uploadToR2(key, buffer, contentType);
}

export async function saveBodyProfileImageBuffer(
  buffer: Buffer,
  filename: string
) {
  const upload = validateUploadBuffer(buffer, { filename });
  const key = `${R2_PREFIX}/${filename}`;
  return await uploadToR2(key, upload.buffer, upload.contentType);
}

export async function deleteBodyProfileImage(imagePath: string) {
  if (!imagePath) return;

  // Legacy local-disk path — handle for backwards compatibility with existing data.
  if (imagePath.startsWith("/uploads/body-profiles/")) {
    const filepath = path.join(getUploadCategoryDir("body-profiles"), path.basename(imagePath));
    try {
      await fs.unlink(filepath);
    } catch {
      // Ignore if already missing
    }
    return;
  }

  const key = extractKeyFromPublicUrl(imagePath);
  if (!key) return;

  try {
    await deleteFromR2(key);
  } catch (err) {
    console.error("[body-profile] R2 delete failed:", err);
  }
}
