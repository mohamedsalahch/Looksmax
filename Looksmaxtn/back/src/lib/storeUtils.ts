import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getUploadsBaseDir } from "@/admin/lib/uploadStorage";

const PUBLIC_PREFIX = "/uploads/stores";

export function slugifyStoreName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "store";
}

function sanitizeBaseName(filename: string) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "logo";
}

function extensionFromType(type: string, fallbackName: string) {
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  return path.extname(fallbackName) || ".jpg";
}

export async function saveStoreLogo(file: File) {
  const uploadDir = path.join(getUploadsBaseDir(), "stores");
  await mkdir(uploadDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  const safeName = sanitizeBaseName(file.name);
  const ext = extensionFromType(file.type, file.name);
  const filename = `${Date.now()}-${randomUUID()}-${safeName}${ext}`;
  await writeFile(path.join(uploadDir, filename), Buffer.from(bytes));

  return `${PUBLIC_PREFIX}/${filename}`;
}

export async function buildUniqueStoreSlug(
  baseName: string,
  exists: (slug: string) => Promise<boolean>
) {
  const baseSlug = slugifyStoreName(baseName);
  let slug = baseSlug;
  let suffix = 2;

  while (await exists(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}
