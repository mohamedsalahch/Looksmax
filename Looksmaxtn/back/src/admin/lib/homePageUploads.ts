import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getUploadCategoryDir } from "@/admin/lib/uploadStorage";

const UPLOAD_DIR = getUploadCategoryDir("homepage");
const PUBLIC_PREFIX = "/uploads/homepage";

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

export async function saveHomePageFiles(files: File[]) {
  await mkdir(UPLOAD_DIR, { recursive: true });

  return Promise.all(
    files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const safeName = sanitizeBaseName(file.name);
      const ext = extensionFromType(file.type, file.name);
      const filename = `${Date.now()}-${randomUUID()}-${safeName}${ext}`;
      const fullPath = path.join(UPLOAD_DIR, filename);
      await writeFile(fullPath, buffer);
      return `${PUBLIC_PREFIX}/${filename}`;
    })
  );
}

export async function deleteHomePageFile(imagePath: string) {
  if (!imagePath.startsWith(`${PUBLIC_PREFIX}/`)) return;
  const filename = path.basename(imagePath);
  try {
    await unlink(path.join(UPLOAD_DIR, filename));
  } catch {}
}
