import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { getUploadCategoryDir } from "@/admin/lib/uploadStorage";
import { uploadToR2 } from "@/lib/r2";

const R2_PREFIX = "product-media-enhancements";
const LOCAL_PREFIX = "/uploads/product-media-enhancements";
const UPLOAD_DIR = getUploadCategoryDir("product-media-enhancements");

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
  const normalized = ext.toLowerCase();
  if (normalized === ".jpg" || normalized === ".jpeg") return "image/jpeg";
  if (normalized === ".webp") return "image/webp";
  if (normalized === ".gif") return "image/gif";
  return "image/png";
}

async function saveBuffer(buffer: Buffer, filenameBase: string, extension: string) {
  const filename = `${Date.now()}-${randomUUID()}-${filenameBase}${extension}`;
  const localPath = path.join(UPLOAD_DIR, filename);
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(localPath, buffer);
  return `${LOCAL_PREFIX}/${filename}`;
}

async function uploadBuffer(buffer: Buffer, filenameBase: string, extension: string) {
  const filename = `${Date.now()}-${randomUUID()}-${filenameBase}${extension}`;
  const key = `${R2_PREFIX}/${filename}`;
  return uploadToR2(key, buffer, contentTypeFromExtension(extension));
}

async function persistBuffer(buffer: Buffer, filenameBase: string, extension: string) {
  if (process.env.R2_BUCKET_NAME) {
    return uploadBuffer(buffer, filenameBase, extension);
  }

  return saveBuffer(buffer, filenameBase, extension);
}

export async function saveProductMediaSourceImage(file: File, view: "front" | "back") {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  return persistBuffer(buffer, `${view}-${sanitizeBaseName(file.name)}`, extensionFromType(file.type, file.name));
}

export async function saveProductMediaResultBase64(base64: string, view: "front" | "back") {
  const dataUrl = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  const [meta, payload] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/png";
  const extension = extensionFromType(mime, `${view}.png`);
  const buffer = Buffer.from(payload, "base64");
  return persistBuffer(buffer, `${view}-enhanced`, extension);
}
