import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const MAX_REMOTE_MEDIA_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function toOrigin(value?: string | null) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getAllowedOrigins() {
  return new Set(
    [
      "https://looksmaxtn.com",
      "https://www.looksmaxtn.com",
      "https://store.looksmaxtn.com",
      "https://cdn.looksmaxtn.com",
      process.env.REMOTE_UPLOADS_BASE_URL,
      process.env.NEXT_PUBLIC_FRONT_URL,
      process.env.NEXT_PUBLIC_BACKEND_URL,
      process.env.R2_PUBLIC_BASE_URL,
    ]
      .map(toOrigin)
      .filter(Boolean)
  );
}

function normalizeContentType(value?: string | null) {
  return String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function sniffImageMime(buffer: Buffer) {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 6) {
    const signature = buffer.subarray(0, 6).toString("ascii");
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "";
}

function isSvg(buffer: Buffer, contentType: string, pathname: string) {
  if (contentType === "image/svg+xml" || pathname.toLowerCase().endsWith(".svg")) return true;
  const sample = buffer.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  return sample.startsWith("<svg") || (sample.startsWith("<?xml") && sample.includes("<svg"));
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")?.trim();

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url parameter." }, { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported url protocol." }, { status: 400 });
  }
  if (!getAllowedOrigins().has(target.origin)) {
    return NextResponse.json({ error: "Remote media host is not allowed." }, { status: 403 });
  }

  try {
    const response = await fetch(target.toString(), {
      cache: "no-store",
      redirect: "manual",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Remote fetch failed with status ${response.status}.` },
        { status: 502 }
      );
    }

    const contentType = normalizeContentType(response.headers.get("content-type"));
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_REMOTE_MEDIA_BYTES) {
      return NextResponse.json({ error: "Remote media is too large." }, { status: 413 });
    }
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Remote media type is not allowed." }, { status: 415 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_REMOTE_MEDIA_BYTES) {
      return NextResponse.json({ error: "Remote media is too large." }, { status: 413 });
    }
    if (isSvg(buffer, contentType, target.pathname) || sniffImageMime(buffer) !== contentType) {
      return NextResponse.json({ error: "Remote media content is invalid." }, { status: 415 });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(buffer.length),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to fetch remote media." }, { status: 502 });
  }
}
