import path from "path";

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_HOMEPAGE_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024;

export const IMAGE_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const HOMEPAGE_MEDIA_UPLOAD_MIME_TYPES = [
  ...IMAGE_UPLOAD_MIME_TYPES,
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
] as const;

type UploadValidationOptions = {
  allowedMimeTypes?: readonly string[];
  maxBytes?: number;
  filename?: string;
  declaredType?: string;
};

export type ValidatedUpload = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

function normalizeMime(value?: string | null) {
  return String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function isSvg(filename: string | undefined, declaredType: string, buffer: Buffer) {
  const ext = path.extname(filename || "").toLowerCase();
  if (ext === ".svg" || declaredType === "image/svg+xml") return true;

  const sample = buffer.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  return sample.startsWith("<svg") || (sample.startsWith("<?xml") && sample.includes("<svg"));
}

function sniffMime(buffer: Buffer) {
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
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return "video/mp4";
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return "video/webm";
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return "application/ogg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return "audio/wav";
  }
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3") {
    return "audio/mpeg";
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }
  return "";
}

function isCompatibleMime(declaredType: string, sniffedType: string) {
  if (!declaredType) return true;
  if (declaredType === sniffedType) return true;
  if ((declaredType === "video/quicktime" || declaredType === "audio/mp4") && sniffedType === "video/mp4") {
    return true;
  }
  if ((declaredType === "video/ogg" || declaredType === "audio/ogg") && sniffedType === "application/ogg") {
    return true;
  }
  return false;
}

function extensionForMime(contentType: string, fallbackName?: string) {
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  if (contentType === "video/mp4") return ".mp4";
  if (contentType === "video/webm") return ".webm";
  if (contentType === "video/ogg") return ".ogg";
  if (contentType === "video/quicktime") return ".mov";
  if (contentType === "audio/mpeg") return ".mp3";
  if (contentType === "audio/mp4") return ".m4a";
  if (contentType === "audio/wav") return ".wav";
  if (contentType === "audio/ogg") return ".oga";
  return path.extname(fallbackName || "") || ".bin";
}

export function validateUploadBuffer(
  buffer: Buffer,
  {
    allowedMimeTypes = IMAGE_UPLOAD_MIME_TYPES,
    maxBytes = MAX_IMAGE_UPLOAD_BYTES,
    filename,
    declaredType,
  }: UploadValidationOptions = {}
): ValidatedUpload {
  const normalizedDeclaredType = normalizeMime(declaredType);
  if (buffer.length === 0) {
    throw new Error("Uploaded file is empty");
  }
  if (buffer.length > maxBytes) {
    throw new Error(`Uploaded file exceeds the ${Math.floor(maxBytes / 1024 / 1024)}MB limit`);
  }
  if (isSvg(filename, normalizedDeclaredType, buffer)) {
    throw new Error("SVG uploads are not allowed");
  }

  const sniffedType = sniffMime(buffer);
  if (!sniffedType) {
    throw new Error("Unsupported or invalid upload file type");
  }

  const contentType = normalizedDeclaredType || sniffedType;
  if (!allowedMimeTypes.includes(contentType)) {
    throw new Error("Uploaded file type is not allowed");
  }
  if (!isCompatibleMime(normalizedDeclaredType, sniffedType)) {
    throw new Error("Uploaded file content does not match its MIME type");
  }

  return {
    buffer,
    contentType,
    extension: extensionForMime(contentType, filename),
  };
}

export async function readValidatedUploadFile(
  file: File,
  options: Omit<UploadValidationOptions, "filename" | "declaredType"> = {}
) {
  const bytes = await file.arrayBuffer();
  return validateUploadBuffer(Buffer.from(bytes), {
    ...options,
    filename: file.name,
    declaredType: file.type,
  });
}

export function validateBase64Upload(
  base64: string,
  options: UploadValidationOptions = {}
) {
  const dataUrl = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  const [meta, payload] = dataUrl.split(",");
  const declaredType = /data:(.*?);base64/i.exec(meta)?.[1] || options.declaredType;
  if (!payload) {
    throw new Error("Invalid base64 upload payload");
  }

  return validateUploadBuffer(Buffer.from(payload, "base64"), {
    ...options,
    declaredType,
  });
}
