import path from "path";
import os from "os";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import {
  deleteBodyProfileImage,
  saveBodyProfileImageBuffer,
} from "@/store/lib/bodyProfileUploads";
import { loadImageAsBase64 } from "@/lib/imageSource";

const STUDIO_PORTRAIT_PROMPT = `Transform this image into a professional studio portrait.

Keep the subject's identity, facial features, skin tone, and proportions EXACTLY the same — no alterations, no beautification, no face reshaping.

CRITICAL — PRESERVE FULL-BODY FRAMING:
- The input image contains a standing, full-body person.
- Keep the exact same framing and camera distance.
- The entire body (head to feet) must remain visible in the final image.
- Do NOT zoom in, crop, or convert to a half-body or headshot.

Enhance image quality to high-end studio level:
- clean, sharp focus
- natural skin texture (no plastic smoothing)
- balanced lighting

BACKGROUND:
- Minimalist studio backdrop
- Warm off-white seamless background (#F2EFEA)
- Floor blends seamlessly into backdrop
- No visible horizon line, no texture

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

Final result should look like a professional DSLR studio photo, realistic and unedited, with full-body composition preserved.`;

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
    await clearFailedBodyProfileImage(userId, "Photo enhancement is unavailable. Please upload another photo later.");
    return;
  }

  try {
    const base64 = await loadImageAsBase64(imagePath);

    // Step 1: Validate the photo with LLM before enhancing
    try {
      const validateResponse = await fetch(`${baseUrl}api/validate-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });

      if (validateResponse.ok) {
        const validateData = await validateResponse.json();
        if (!validateData.valid) {
          const reason = validateData.reason || "This photo is not suitable for outfit generation. Please upload a clear, full-body standing photo.";
          console.warn(`[profile-photo] Validation failed for user ${userId}: ${reason}`);
          await dbConnect();
          const currentUser = await User.collection.findOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            { projection: { bodyProfile: 1 } }
          );
          await clearFailedBodyProfileImage(userId, reason);
          if (currentUser?.bodyProfile?.profileImage) {
            await deleteBodyProfileImage(currentUser.bodyProfile.profileImage);
          }
          if (currentUser?.bodyProfile?.profileImageEnhanced) {
            await deleteBodyProfileImage(currentUser.bodyProfile.profileImageEnhanced);
          }
          return;
        }
      }
    } catch (validationError) {
      console.error("[profile-photo] Validation request failed, continuing with enhancement:", validationError);
    }

    // Step 2: Enhance the photo
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
      await clearFailedBodyProfileImage(userId, "Photo enhancement failed. Please upload another photo.");
      await deleteBodyProfileImage(imagePath);
    }
  } catch (error) {
    console.error("[profile-photo] Enhancement error:", error);
    await clearFailedBodyProfileImage(userId, "Photo enhancement failed. Please upload another photo.");
    await deleteBodyProfileImage(imagePath);
  }
}

export async function clearFailedBodyProfileImage(userId: string, reason: string) {
  try {
    await dbConnect();
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      {
        $set: {
          "bodyProfile.profileImage": "",
          "bodyProfile.profileImageEnhanced": "",
          "bodyProfile.imageEnhancing": false,
          "bodyProfile.profileImageRequiresGeneration": false,
          "bodyProfile.profileImageValidationError": reason,
        },
      }
    );
  } catch (err) {
    console.error("[profile-photo] Failed to clear failed image:", err);
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
  // Derive a key based on the source file's basename so the enhanced image is paired with the original.
  const sourceBasename = imagePath.startsWith("/uploads/body-profiles/")
    ? path.basename(imagePath)
    : path.basename(new URL(imagePath).pathname);
  const ext = path.extname(sourceBasename) || ".jpg";
  const nameWithoutExt = path.basename(sourceBasename, ext);
  const enhancedFilename = `${nameWithoutExt}-enhanced${ext}`;

  const enhancedBuffer = Buffer.from(imageBase64, "base64");

  await dbConnect();
  const currentUser = await User.collection.findOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { projection: { "bodyProfile.profileImage": 1 } }
  );
  const currentProfileImage = currentUser?.bodyProfile?.profileImage || "";
  if (currentProfileImage !== imagePath) {
    return null;
  }

  const enhancedImageUrl = await saveBodyProfileImageBuffer(enhancedBuffer, enhancedFilename);

  await User.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    {
      $set: {
        "bodyProfile.profileImageEnhanced": enhancedImageUrl,
        "bodyProfile.imageEnhancing": false,
        "bodyProfile.profileImageRequiresGeneration": false,
      },
    }
  );

  return enhancedImageUrl;
}
