import path from "path";
import { unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { getUploadCategoryDir } from "@/admin/lib/uploadStorage";
import { uploadToR2, deleteFromR2, extractKeyFromPublicUrl } from "@/lib/r2";

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

function extensionFromType(type: string, fallbackName: string) {
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  return path.extname(fallbackName) || ".png";
}

function contentTypeFromExtension(ext: string) {
  const e = ext.toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  return "image/png";
}

async function uploadBuffer(buffer: Buffer, filenameBase: string, extension: string) {
  const filename = `${Date.now()}-${randomUUID()}-${filenameBase}${extension}`;
  const key = `${R2_PREFIX}/${filename}`;
  return await uploadToR2(key, buffer, contentTypeFromExtension(extension));
}

export async function saveGeneratedSourceImage(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  return uploadBuffer(
    buffer,
    sanitizeBaseName(file.name),
    extensionFromType(file.type, file.name)
  );
}

export async function saveGeneratedResultBase64(base64: string, index: number) {
  const dataUrl = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  const [meta, payload] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/png";
  const ext = extensionFromType(mime, `generated-${index}.png`);
  const buffer = Buffer.from(payload, "base64");
  return uploadBuffer(buffer, `generated-${index}`, ext);
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
