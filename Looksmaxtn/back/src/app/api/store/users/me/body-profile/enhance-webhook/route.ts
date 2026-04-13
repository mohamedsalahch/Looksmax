import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getUploadCategoryDir } from "@/store/lib/uploadStorage";

export async function POST(req: NextRequest) {
  try {
    const configuredSecret = process.env.OUTFIT_WEBHOOK_SECRET || "";
    const requestSecret =
      req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret") || "";

    if (configuredSecret && requestSecret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const image = typeof body.image === "string" ? body.image : "";

    if (!image) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    const userId = req.nextUrl.searchParams.get("userId") || "";
    const imagePath = req.nextUrl.searchParams.get("imagePath") || "";

    if (!userId || !imagePath) {
      return NextResponse.json({ error: "Missing userId or imagePath" }, { status: 400 });
    }

    // Save enhanced image as a new file alongside the original
    const uploadDir = getUploadCategoryDir("body-profiles");
    const originalBasename = path.basename(imagePath);
    const ext = path.extname(originalBasename);
    const nameWithoutExt = path.basename(originalBasename, ext);
    const enhancedFilename = `${nameWithoutExt}-enhanced${ext}`;
    const enhancedFullPath = path.join(uploadDir, enhancedFilename);
    const enhancedImagePath = `/uploads/body-profiles/${enhancedFilename}`;

    const enhancedBuffer = Buffer.from(image, "base64");
    await writeFile(enhancedFullPath, enhancedBuffer);

    console.log(`[enhance-webhook] Saved enhanced photo for user ${userId} (${(enhancedBuffer.length / 1024).toFixed(1)} KB) → ${enhancedImagePath}`);

    // Update DB: set enhanced path and mark done — only if the imagePath still matches
    // the current profileImage (prevents stale webhook from overwriting a newer upload)
    await dbConnect();
    const currentUser = await User.collection.findOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { projection: { "bodyProfile.profileImage": 1 } }
    );
    const currentProfileImage = currentUser?.bodyProfile?.profileImage || "";

    if (currentProfileImage !== imagePath) {
      console.warn(`[enhance-webhook] Stale webhook ignored for user ${userId}: imagePath=${imagePath} but current profileImage=${currentProfileImage}`);
      // Still delete the enhanced file since it's orphaned
      try { await unlink(enhancedFullPath); } catch {}
      return NextResponse.json({ ok: true, stale: true });
    }

    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      {
        $set: {
          "bodyProfile.profileImageEnhanced": enhancedImagePath,
          "bodyProfile.imageEnhancing": false,
        },
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[enhance-webhook] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
