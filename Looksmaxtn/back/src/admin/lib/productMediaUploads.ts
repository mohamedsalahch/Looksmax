import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { getUploadCategoryDir } from "@/admin/lib/uploadStorage";
import { uploadToR2 } from "@/lib/r2";
import { readValidatedUploadFile, validateBase64Upload } from "@/lib/uploadValidation";

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

async function saveBuffer(buffer: Buffer, filenameBase: string, extension: string) {
  const filename = `${Date.now()}-${randomUUID()}-${filenameBase}${extension}`;
  const localPath = path.join(UPLOAD_DIR, filename);
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(localPath, buffer);
  return `${LOCAL_PREFIX}/${filename}`;
}

async function uploadBuffer(buffer: Buffer, filenameBase: string, extension: string, contentType: string) {
  const filename = `${Date.now()}-${randomUUID()}-${filenameBase}${extension}`;
  const key = `${R2_PREFIX}/${filename}`;
  return uploadToR2(key, buffer, contentType);
}

async function persistBuffer(buffer: Buffer, filenameBase: string, extension: string, contentType: string) {
  if (process.env.R2_BUCKET) {
    return uploadBuffer(buffer, filenameBase, extension, contentType);
  }

  return saveBuffer(buffer, filenameBase, extension);
}

export async function saveProductMediaSourceImage(file: File, view: "front" | "back" | "left" | "right") {
  const { buffer, contentType, extension } = await readValidatedUploadFile(file);
  return persistBuffer(buffer, `${view}-${sanitizeBaseName(file.name)}`, extension, contentType);
}

export async function saveProductMediaResultBase64(base64: string, view: "front" | "back" | "left" | "right") {
  const { buffer, contentType, extension } = validateBase64Upload(base64, {
    filename: `${view}.png`,
  });
  return persistBuffer(buffer, `${view}-enhanced`, extension, contentType);
}
