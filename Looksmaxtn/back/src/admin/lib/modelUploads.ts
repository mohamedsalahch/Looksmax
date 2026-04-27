import path from "path";
import { unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { getUploadCategoryDir } from "@/admin/lib/uploadStorage";
import { uploadToR2, deleteFromR2, extractKeyFromPublicUrl } from "@/lib/r2";
import { loadImageAsBase64 } from "@/lib/imageSource";

const R2_PREFIX = "models";
const LEGACY_PREFIX = "/uploads/models";

function sanitizeBaseName(filename: string) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

function extensionFromType(type: string, fallbackName: string) {
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  return path.extname(fallbackName) || ".jpg";
}

function contentTypeFromExtension(ext: string) {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function saveModelImage(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const safeName = sanitizeBaseName(file.name);
  const ext = extensionFromType(file.type, file.name);
  const filename = `${Date.now()}-${randomUUID()}-${safeName}${ext}`;
  const key = `${R2_PREFIX}/${filename}`;
  return await uploadToR2(key, buffer, contentTypeFromExtension(ext));
}

export async function deleteModelImage(imagePath: string) {
  if (!imagePath) return;

  if (imagePath.startsWith(`${LEGACY_PREFIX}/`)) {
    const filename = path.basename(imagePath);
    const fullPath = path.join(getUploadCategoryDir("models"), filename);
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
    console.error("[models] R2 delete failed:", err);
  }
}

export async function readModelImageAsBase64(imagePath: string) {
  if (!imagePath) return "";
  try {
    return await loadImageAsBase64(imagePath);
  } catch (err) {
    console.error("[models] Failed to read image:", imagePath, err);
    return "";
  }
}
