import path from "path";
import { unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { getUploadCategoryDir } from "@/admin/lib/uploadStorage";
import { uploadToR2, deleteFromR2, extractKeyFromPublicUrl } from "@/lib/r2";
import {
  HOMEPAGE_MEDIA_UPLOAD_MIME_TYPES,
  MAX_HOMEPAGE_MEDIA_UPLOAD_BYTES,
  readValidatedUploadFile,
} from "@/lib/uploadValidation";

const R2_PREFIX = "homepage";
const LEGACY_PREFIX = "/uploads/homepage";

function sanitizeBaseName(filename: string) {
  return (
    filename
      .replace(/\.[^/.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image"
  );
}

export async function saveHomePageFiles(files: File[]) {
  return Promise.all(
    files.map(async (file) => {
      const { buffer, contentType, extension } = await readValidatedUploadFile(file, {
        allowedMimeTypes: HOMEPAGE_MEDIA_UPLOAD_MIME_TYPES,
        maxBytes: MAX_HOMEPAGE_MEDIA_UPLOAD_BYTES,
      });
      const safeName = sanitizeBaseName(file.name);
      const filename = `${Date.now()}-${randomUUID()}-${safeName}${extension}`;
      const key = `${R2_PREFIX}/${filename}`;
      return await uploadToR2(key, buffer, contentType);
    })
  );
}

export async function deleteHomePageFile(imagePath: string) {
  if (!imagePath) return;

  if (imagePath.startsWith(`${LEGACY_PREFIX}/`)) {
    const filename = path.basename(imagePath);
    try {
      await unlink(path.join(getUploadCategoryDir("homepage"), filename));
    } catch {}
    return;
  }

  const key = extractKeyFromPublicUrl(imagePath);
  if (!key) return;

  try {
    await deleteFromR2(key);
  } catch (err) {
    console.error("[homepage] R2 delete failed:", err);
  }
}
