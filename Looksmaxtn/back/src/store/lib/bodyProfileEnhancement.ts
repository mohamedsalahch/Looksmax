import { readFile, writeFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getUploadCategoryDir } from "@/store/lib/uploadStorage";

const STUDIO_PORTRAIT_PROMPT = `Transform this image into a professional studio portrait.

Keep the subject's identity, facial features, skin tone, and proportions EXACTLY the same — no alterations, no beautification, no face reshaping.

Enhance image quality to high-end studio level:
- clean, sharp focus
- natural skin texture (no plastic smoothing)
- balanced lighting

Replace the background with a neutral studio backdrop (soft gray, beige, or white), evenly lit.

Apply soft studio lighting:
- key light from front/side
- subtle shadows for depth
- realistic highlights on face

Improve details:
- correct exposure and contrast
- natural color grading
- remove noise and blur
- preserve hair texture and fine details

Keep pose, expression, and framing unchanged.

Final result should look like a professional DSLR studio headshot, realistic and unedited.`;

function getPreferredIpv4Host() {
  if (process.env.OUTFIT_WEBHOOK_BASE_URL) {
    return process.env.OUTFIT_WEBHOOK_BASE_URL.replace(/\/$/, "");
  }
  if (process.env.BACKEND_BASE_URL) {
    return process.env.BACKEND_BASE_URL.replace(/\/$/, "");
  }
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return `http://${address.address}:3004`;
      }
    }
  }
  return "";
}

export async function queueBodyProfileEnhancement(userId: string, imagePath: string) {
  const baseUrl = (process.env.PRODUCT_GENERATION_URL_BASE || "").replace(/\/?$/, "/");
  if (!baseUrl) {
    console.warn("[profile-photo] PRODUCT_GENERATION_URL_BASE not configured, skipping enhancement");
    await markEnhancingDone(userId);
    return;
  }

  try {
    const uploadDir = getUploadCategoryDir("body-profiles");
    const fullPath = path.join(uploadDir, path.basename(imagePath));
    const fileBuffer = await readFile(fullPath);
    const base64 = fileBuffer.toString("base64");

    const jobId = `enhance-${userId}`;
    const preferredWebhookBase = getPreferredIpv4Host();
    const webhookBase = preferredWebhookBase || `http://127.0.0.1:3004`;
    const webhookUrl = `${webhookBase}/api/store/users/me/body-profile/enhance-webhook?userId=${userId}&imagePath=${encodeURIComponent(imagePath)}`;

    const response = await fetch(`${baseUrl}api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        webhook_url: webhookUrl,
        prompt: STUDIO_PORTRAIT_PROMPT,
        images: [base64],
      }),
    });

    if (!response.ok) {
      console.error("[profile-photo] Proxy request failed:", response.status);
      await markEnhancingDone(userId);
    }
  } catch (error) {
    console.error("[profile-photo] Enhancement error:", error);
    await markEnhancingDone(userId);
  }
}

export async function markEnhancingDone(userId: string) {
  try {
    await dbConnect();
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { "bodyProfile.imageEnhancing": false } }
    );
  } catch (err) {
    console.error("[profile-photo] Failed to mark done:", err);
  }
}

export async function saveEnhancedBodyProfileImage(
  userId: string,
  imagePath: string,
  imageBase64: string
) {
  const uploadDir = getUploadCategoryDir("body-profiles");
  const originalBasename = path.basename(imagePath);
  const ext = path.extname(originalBasename);
  const nameWithoutExt = path.basename(originalBasename, ext);
  const enhancedFilename = `${nameWithoutExt}-enhanced${ext}`;
  const enhancedFullPath = path.join(uploadDir, enhancedFilename);
  const enhancedImagePath = `/uploads/body-profiles/${enhancedFilename}`;

  const enhancedBuffer = Buffer.from(imageBase64, "base64");
  await writeFile(enhancedFullPath, enhancedBuffer);

  await dbConnect();
  const currentUser = await User.collection.findOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { projection: { "bodyProfile.profileImage": 1 } }
  );
  const currentProfileImage = currentUser?.bodyProfile?.profileImage || "";
  if (currentProfileImage !== imagePath) {
    try {
      await unlink(enhancedFullPath);
    } catch {}
    return null;
  }

  await User.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    {
      $set: {
        "bodyProfile.profileImageEnhanced": enhancedImagePath,
        "bodyProfile.imageEnhancing": false,
        "bodyProfile.profileImageRequiresGeneration": false,
      },
    }
  );

  return enhancedImagePath;
}
