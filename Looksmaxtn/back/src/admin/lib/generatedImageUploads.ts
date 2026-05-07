import path from "path";
import { unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { getUploadCategoryDir } from "@/admin/lib/uploadStorage";
import { uploadToR2, deleteFromR2, extractKeyFromPublicUrl } from "@/lib/r2";
import { readValidatedUploadFile, validateBase64Upload } from "@/lib/uploadValidation";

const R2_PREFIX = "generated-images";
const LEGACY_PREFIX = "/uploads/generated-images";

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

async function uploadBuffer(buffer: Buffer, filenameBase: string, extension: string, contentType: string) {
  const filename = `${Date.now()}-${randomUUID()}-${filenameBase}${extension}`;
  const key = `${R2_PREFIX}/${filename}`;
  return await uploadToR2(key, buffer, contentType);
}

export async function saveGeneratedSourceImage(file: File) {
  const { buffer, contentType, extension } = await readValidatedUploadFile(file);
  return uploadBuffer(buffer, sanitizeBaseName(file.name), extension, contentType);
}

export async function saveGeneratedResultBase64(base64: string, index: number) {
  const { buffer, contentType, extension } = validateBase64Upload(base64, {
    filename: `generated-${index}.png`,
  });
  return uploadBuffer(buffer, `generated-${index}`, extension, contentType);
}

export async function deleteGeneratedImage(imagePath: string) {
  if (!imagePath) return;

  if (imagePath.startsWith(`${LEGACY_PREFIX}/`)) {
    const filename = path.basename(imagePath);
    const fullPath = path.join(getUploadCategoryDir("generated-images"), filename);
    try {
      await unlink(fullPath);
    } catch {
      // Ignore
    }
    return;
  }

  const key = extractKeyFromPublicUrl(imagePath);
  if (!key) return;

  try {
    await deleteFromR2(key);
  } catch (err) {
    console.error("[generated-images] R2 delete failed:", err);
  }
}
