import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getUploadCategoryDir } from "@/lib/uploadStorage";

const ALLOWED_CATEGORIES = new Set([
  "products",
  "homepage",
  "models",
  "generated-images",
  "body-profiles",
]);

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

function placeholderSvg(category: string, filename: string) {
  const label = `${category}/${filename}`.replace(/[<>&"]/g, "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#f4f1ea"/>
  <rect x="80" y="80" width="1040" height="1040" rx="36" fill="#e7dfd2" stroke="#b8a98f" stroke-width="8"/>
  <text x="600" y="540" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" fill="#5f5241">Image unavailable</text>
  <text x="600" y="600" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#7b6d59">${label}</text>
</svg>`;
}

function getRemoteUploadsBaseUrl() {
  return process.env.REMOTE_UPLOADS_BASE_URL?.trim().replace(/\/$/, "") || "";
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ category: string; filename: string }> }
) {
  const { category, filename } = await params;

  if (
    !ALLOWED_CATEGORIES.has(category) ||
    !filename ||
    filename.includes("/") ||
    filename.includes("\\")
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const filePath = path.join(getUploadCategoryDir(category), filename);
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": getContentType(filename),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    const remoteUploadsBaseUrl = getRemoteUploadsBaseUrl();

    if (remoteUploadsBaseUrl) {
      try {
        const remoteResponse = await fetch(
          `${remoteUploadsBaseUrl}/uploads/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`,
          { cache: "no-store" }
        );

        if (remoteResponse.ok) {
          return new NextResponse(remoteResponse.body, {
            status: remoteResponse.status,
            headers: {
              "Content-Type": remoteResponse.headers.get("content-type") || getContentType(filename),
              "Cache-Control": remoteResponse.headers.get("cache-control") || "public, max-age=60",
            },
          });
        }
      } catch {
        // Fall through to local placeholder if remote fallback is unavailable.
      }
    }

    return new NextResponse(placeholderSvg(category, filename), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store",
      },
    });
  }
}
