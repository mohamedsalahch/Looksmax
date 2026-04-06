import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const ADMIN_UPLOAD_DIR = path.join(
  process.cwd(),
  "..",
  "admin",
  "public",
  "uploads",
  "products"
);

function getContentType(filename: string) {
  const extension = path.extname(filename).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (!filename || filename.includes("/") || filename.includes("\\")) {
      return new NextResponse("Not found", { status: 404 });
    }

    const filePath = path.join(ADMIN_UPLOAD_DIR, filename);
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": getContentType(filename),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
