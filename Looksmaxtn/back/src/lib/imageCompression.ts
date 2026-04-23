import sharp from "sharp";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 82;

function stripDataUrl(base64: string) {
  const trimmed = base64.trim();
  if (!trimmed.startsWith("data:")) return trimmed;
  return trimmed.split(",")[1] || "";
}

function formatToMimeType(format?: keyof sharp.FormatEnum | string | null) {
  switch (format) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    default:
      return "image/png";
  }
}

export async function compressImageBuffer(input: Buffer) {
  if (input.length === 0) return { buffer: input, mimeType: "image/png" };

  const source = sharp(input, { failOnError: false }).rotate();
  const metadata = await source.metadata();
  const resized = source.resize({
    width: MAX_DIMENSION,
    height: MAX_DIMENSION,
    fit: "inside",
    withoutEnlargement: true,
  });

  const hasAlpha = Boolean(metadata.hasAlpha);
  const output = hasAlpha
    ? await resized.webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer({ resolveWithObject: true })
    : await resized.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer({ resolveWithObject: true });

  const compressedBuffer = output.data;
  if (compressedBuffer.length >= input.length) {
    return {
      buffer: input,
      mimeType: formatToMimeType(metadata.format),
    };
  }

  return {
    buffer: compressedBuffer,
    mimeType: hasAlpha ? "image/webp" : "image/jpeg",
  };
}

export async function compressBase64Image(base64: string) {
  const cleanBase64 = stripDataUrl(base64);
  if (!cleanBase64) return "";

  const input = Buffer.from(cleanBase64, "base64");
  if (input.length === 0) return "";

  const compressed = await compressImageBuffer(input);
  return compressed.buffer.toString("base64");
}

export async function compressBase64ImageWithMime(base64: string) {
  const cleanBase64 = stripDataUrl(base64);
  if (!cleanBase64) {
    return { base64: "", mimeType: "image/png" };
  }

  const input = Buffer.from(cleanBase64, "base64");
  if (input.length === 0) {
    return { base64: "", mimeType: "image/png" };
  }

  const compressed = await compressImageBuffer(input);
  return {
    base64: compressed.buffer.toString("base64"),
    mimeType: compressed.mimeType,
  };
}
