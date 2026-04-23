import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getUploadCategoryDir } from "@/admin/lib/uploadStorage";
import { compressBase64Image } from "@/lib/imageCompression";

const UPLOAD_DIR = getUploadCategoryDir("models");
const PUBLIC_PREFIX = "/uploads/models";

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

export async function saveModelImage(file: File) {
  await mkdir(UPLOAD_DIR, { recursive: true });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const safeName = sanitizeBaseName(file.name);
  const ext = extensionFromType(file.type, file.name);
  const filename = `${Date.now()}-${randomUUID()}-${safeName}${ext}`;
  const fullPath = path.join(UPLOAD_DIR, filename);

  await writeFile(fullPath, buffer);

  return `${PUBLIC_PREFIX}/${filename}`;
}

export async function deleteModelImage(imagePath: string) {
  if (!imagePath.startsWith(`${PUBLIC_PREFIX}/`)) return;

  const filename = path.basename(imagePath);
  const fullPath = path.join(UPLOAD_DIR, filename);

  try {
    await unlink(fullPath);
  } catch {
    // Ignore missing files on cleanup.
  }
}

export async function readModelImageAsBase64(imagePath: string) {
  if (!imagePath.startsWith(`${PUBLIC_PREFIX}/`)) return "";
  const filename = path.basename(imagePath);
  const fullPath = path.join(UPLOAD_DIR, filename);
  const buffer = await readFile(fullPath);
  return compressBase64Image(buffer.toString("base64"));
}
