const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const TARGET_BACKGROUND = "#F3E9D8";

function getFileStem(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "") || "image";
}

async function loadImage(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawImageToCanvas(image: HTMLImageElement) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const ratio = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const nextWidth = Math.max(1, Math.round(width * ratio));
  const nextHeight = Math.max(1, Math.round(height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = nextWidth;
  canvas.height = nextHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }

  ctx.fillStyle = TARGET_BACKGROUND;
  ctx.fillRect(0, 0, nextWidth, nextHeight);
  ctx.drawImage(image, 0, 0, nextWidth, nextHeight);
  return canvas;
}

export async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  try {
    const image = await loadImage(file);
    const canvas = drawImageToCanvas(image);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (nextBlob) => resolve(nextBlob),
        "image/jpeg",
        JPEG_QUALITY
      );
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], `${getFileStem(file.name)}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
