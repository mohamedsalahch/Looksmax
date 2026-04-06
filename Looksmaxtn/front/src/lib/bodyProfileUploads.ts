import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const uploadDir = path.join(process.cwd(), "public", "uploads", "body-profiles");

export async function saveBodyProfileImage(file: File) {
  await fs.mkdir(uploadDir, { recursive: true });
  const extension = file.name.split(".").pop() || "jpg";
  const filename = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const filepath = path.join(uploadDir, filename);
  const arrayBuffer = await file.arrayBuffer();
  await fs.writeFile(filepath, Buffer.from(arrayBuffer));
  return `/uploads/body-profiles/${filename}`;
}

export async function deleteBodyProfileImage(imagePath: string) {
  if (!imagePath.startsWith("/uploads/body-profiles/")) return;
  const filepath = path.join(process.cwd(), "public", imagePath.replace(/^\//, ""));

  try {
    await fs.unlink(filepath);
  } catch {
    // Ignore if already missing
  }
}
