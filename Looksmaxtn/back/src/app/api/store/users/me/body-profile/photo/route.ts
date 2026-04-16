import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import {
  deleteBodyProfileImage,
  saveBodyProfileImage,
} from "@/store/lib/bodyProfileUploads";
import {
  queueBodyProfileEnhancement,
} from "@/store/lib/bodyProfileEnhancement";

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
    const previousEnhanced = existingUser?.bodyProfile?.profileImageEnhanced || "";
    const uploadCount = Number(existingUser?.bodyProfile?.profileImageUploadCount || 0);
    const outfitGenerationCount = Number(existingUser?.bodyProfile?.outfitGenerationCount || 0);
    const requiresManualGeneration = Boolean(existingUser?.bodyProfile?.profileImageRequiresGeneration);
    const uploadLimit = 100;

    if (uploadCount >= uploadLimit) {
      return NextResponse.json(
        { error: "Upload limit reached. Use the last saved photo." },
        { status: 403 }
      );
    }

    // Save raw upload
    const nextImage = await saveBodyProfileImage(imageFile);

    // Set imageEnhancing flag and clear stale enhanced image
    await usersCollection.updateOne(
      { _id: userObjectId },
      {
        $set: {
          "bodyProfile.profileImage": nextImage,
          "bodyProfile.profileImageEnhanced": "",
          "bodyProfile.imageEnhancing": !requiresManualGeneration,
          "bodyProfile.profileImageRequiresGeneration": requiresManualGeneration,
          "bodyProfile.profileImageUploadCount": uploadCount + 1,
          "bodyProfile.outfitGenerationCount": outfitGenerationCount,
        },
      }
    );

    // Delete old images
    if (previousImage && previousImage !== nextImage) {
      await deleteBodyProfileImage(previousImage);
    }
    if (previousEnhanced) {
      await deleteBodyProfileImage(previousEnhanced);
    }

    if (!requiresManualGeneration) {
      queueBodyProfileEnhancement(session.userId, nextImage).catch((err) => {
        console.error("[profile-photo] Enhancement failed:", err);
      });
    }

    return NextResponse.json({
      profileImage: nextImage,
      imageEnhancing: !requiresManualGeneration,
      profileImageUploadCount: uploadCount + 1,
      outfitGenerationCount,
      profileImageRequiresGeneration: requiresManualGeneration,
      uploadLimit,
    });
  } catch (error) {
    console.error("[profile-photo] Upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    if (user.bodyProfile?.profileImage) {
      await deleteBodyProfileImage(user.bodyProfile.profileImage);
    }
    if (user.bodyProfile?.profileImageEnhanced) {
      await deleteBodyProfileImage(user.bodyProfile.profileImageEnhanced);
    }

    updates["bodyProfile.profileImage"] = "";
    updates["bodyProfile.profileImageEnhanced"] = "";
    updates["bodyProfile.imageEnhancing"] = false;
    updates["bodyProfile.profileImageRequiresGeneration"] = false;

    await User.collection.updateOne({ _id: userObjectId }, { $set: updates });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[profile-photo] Delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
