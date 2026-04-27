import path from "path";
import { unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { getUploadCategoryDir } from "@/admin/lib/uploadStorage";
import { uploadToR2, deleteFromR2, extractKeyFromPublicUrl } from "@/lib/r2";

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

function extensionFromType(type: string, fallbackName: string) {
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  return path.extname(fallbackName) || ".jpg";
}

function contentTypeFromExtension(ext: string) {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  return "image/jpeg";
}

export async function saveHomePageFiles(files: File[]) {
  return Promise.all(
    files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const safeName = sanitizeBaseName(file.name);
      const ext = extensionFromType(file.type, file.name);
      const filename = `${Date.now()}-${randomUUID()}-${safeName}${ext}`;
      const key = `${R2_PREFIX}/${filename}`;
      return await uploadToR2(key, buffer, contentTypeFromExtension(ext));
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
