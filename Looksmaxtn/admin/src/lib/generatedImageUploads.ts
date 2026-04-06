import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "generated-images");
const PUBLIC_PREFIX = "/uploads/generated-images";

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

async function writeBuffer(buffer: Buffer, filenameBase: string, extension: string) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${Date.now()}-${randomUUID()}-${filenameBase}${extension}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  await writeFile(fullPath, buffer);
  return `${PUBLIC_PREFIX}/${filename}`;
}

export async function saveGeneratedSourceImage(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  return writeBuffer(
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
  return writeBuffer(buffer, `generated-${index}`, ext);
}

export async function deleteGeneratedImage(imagePath: string) {
  if (!imagePath.startsWith(`${PUBLIC_PREFIX}/`)) return;

  const filename = path.basename(imagePath);
  const fullPath = path.join(UPLOAD_DIR, filename);

  try {
    await unlink(fullPath);
  } catch {
    // Ignore missing files on cleanup.
  }
}
