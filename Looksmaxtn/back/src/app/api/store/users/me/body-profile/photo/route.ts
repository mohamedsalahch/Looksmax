import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import {
  deleteBodyProfileImage,
  saveBodyProfileImage,
} from "@/store/lib/bodyProfileUploads";
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

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const imageFile = formData.get("profileImage");
    if (!(imageFile instanceof File) || imageFile.size === 0) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    await dbConnect();
    const usersCollection = User.collection;
    const userObjectId = new mongoose.Types.ObjectId(session.userId);

    const existingUser = await usersCollection.findOne(
      { _id: userObjectId },
      { projection: { bodyProfile: 1 } }
    );
    const previousImage = existingUser?.bodyProfile?.profileImage || "";

    // Save raw upload
    const nextImage = await saveBodyProfileImage(imageFile);

    // Set imageEnhancing flag
    await usersCollection.updateOne(
      { _id: userObjectId },
      {
        $set: {
          "bodyProfile.profileImage": nextImage,
          "bodyProfile.imageEnhancing": true,
        },
      }
    );

    // Delete old image
    if (previousImage && previousImage !== nextImage) {
      await deleteBodyProfileImage(previousImage);
    }

    // Fire async enhancement
    const userId = session.userId;
    enhanceProfilePhotoAsync(userId, nextImage).catch((err) => {
      console.error("[profile-photo] Enhancement failed:", err);
    });

    return NextResponse.json({ profileImage: nextImage, imageEnhancing: true });
  } catch (error) {
    console.error("[profile-photo] Upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function enhanceProfilePhotoAsync(userId: string, imagePath: string) {
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

    console.log(`[profile-photo] Queueing enhancement for ${imagePath} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

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

async function markEnhancingDone(userId: string) {
  try {
    await dbConnect();
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { "bodyProfile.imageEnhancing": false } }
    );
    console.log(`[profile-photo] Marked enhancing done for ${userId}`);
  } catch (err) {
    console.error("[profile-photo] Failed to mark done:", err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const target = searchParams.get("target"); // "original" or "enhanced"
    if (!target || !["original", "enhanced"].includes(target)) {
      return NextResponse.json({ error: "Invalid target" }, { status: 400 });
    }

    await dbConnect();
    const userObjectId = new mongoose.Types.ObjectId(session.userId);
    const user = await User.collection.findOne(
      { _id: userObjectId },
      { projection: { bodyProfile: 1 } }
    );
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (target === "original") {
      // Delete original file + enhanced file, clear both fields
      if (user.bodyProfile?.profileImage) {
        await deleteBodyProfileImage(user.bodyProfile.profileImage);
      }
      if (user.bodyProfile?.profileImageEnhanced) {
        await deleteBodyProfileImage(user.bodyProfile.profileImageEnhanced);
      }
      updates["bodyProfile.profileImage"] = "";
      updates["bodyProfile.profileImageEnhanced"] = "";
      updates["bodyProfile.imageEnhancing"] = false;
    } else {
      // Delete only enhanced file
      if (user.bodyProfile?.profileImageEnhanced) {
        await deleteBodyProfileImage(user.bodyProfile.profileImageEnhanced);
      }
      updates["bodyProfile.profileImageEnhanced"] = "";
    }

    await User.collection.updateOne({ _id: userObjectId }, { $set: updates });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[profile-photo] Delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
