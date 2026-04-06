import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import {
  deleteBodyProfileImage,
  saveBodyProfileImage,
} from "@/store/lib/bodyProfileUploads";

function normalizeGender(value: FormDataEntryValue | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "male" || normalized === "man" || normalized === "men") {
    return "men";
  }
  if (normalized === "female" || normalized === "woman" || normalized === "women") {
    return "women";
  }
  return "";
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const usersCollection = User.collection;
    const userObjectId = new mongoose.Types.ObjectId(session.userId);
    const existingUser = await usersCollection.findOne(
      { _id: userObjectId },
      { projection: { name: 1, email: 1, role: 1, address: 1, bodyProfile: 1 } }
    );
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const previousImage = existingUser.bodyProfile?.profileImage || "";

    const formData = await req.formData();
    const imageFile = formData.get("profileImage");
    const currentImage = String(formData.get("existingProfileImage") || "");
    const nextImage =
      imageFile instanceof File && imageFile.size > 0
        ? await saveBodyProfileImage(imageFile)
        : currentImage;

    const nextBodyProfile = {
      heightCm: String(formData.get("heightCm") || ""),
      weightKg: String(formData.get("weightKg") || ""),
      usualSize: String(formData.get("usualSize") || ""),
      profileImage: nextImage,
      gender: normalizeGender(formData.get("gender")),
    };
    const updateResult = await usersCollection.findOneAndUpdate(
      { _id: userObjectId },
      {
        $set: {
          bodyProfile: nextBodyProfile,
        },
      },
      {
        returnDocument: "after",
      }
    );

    const updatedUser = updateResult;

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (
      nextImage &&
      previousImage &&
      previousImage !== nextImage
    ) {
      await deleteBodyProfileImage(previousImage);
    }

    return NextResponse.json({
      user: {
        id: String(updatedUser._id),
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        address: updatedUser.address,
        bodyProfile: updatedUser.bodyProfile,
      },
    });
  } catch (error) {
    console.error("Update body profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
