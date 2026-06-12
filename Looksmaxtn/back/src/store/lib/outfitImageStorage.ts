import { randomUUID } from "crypto";
import { uploadToR2 } from "@/lib/r2";
import { validateBase64Upload } from "@/lib/uploadValidation";

/**
 * Generated outfit images arrive as base64; persist them to R2 and store only
 * the public URL so job documents (and the SSE fan-out) stay small. Falls back
 * to the raw payload if R2 is unavailable so a generation is never lost.
 */
export async function persistOutfitImage(jobId: string, view: string, image: string) {
  if (!image || /^https?:\/\//i.test(image)) return image;
  try {
    const { buffer, contentType, extension } = validateBase64Upload(image, {
      filename: `outfit-${view}.png`,
    });
    const key = `outfit-results/${jobId}-${view}-${randomUUID()}${extension}`;
    return await uploadToR2(key, buffer, contentType);
  } catch (error) {
    console.error(`[outfit-images] R2 upload failed for job ${jobId} (${view}):`, error);
    return image;
  }
}
