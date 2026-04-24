import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import { logRequestError } from "@/lib/requestLogging";

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

    const formData = await req.formData();
    const heightCm = String(formData.get("heightCm") || "").trim();
    const weightKg = String(formData.get("weightKg") || "").trim();
    const topSize = String(formData.get("topSize") || "").trim();
    const bottomSize = String(formData.get("bottomSize") || "").trim();
    const shoeSize = String(formData.get("shoeSize") || "").trim();
    const gender = normalizeGender(formData.get("gender"));

    if (!heightCm || !weightKg || !topSize || !bottomSize || !shoeSize || !gender) {
      return NextResponse.json(
        { error: "All outfit studio profile fields are required." },
        { status: 400 }
      );
    }

    const profileImageEnhanced = String(existingUser.bodyProfile?.profileImageEnhanced || "").trim();
    if (!profileImageEnhanced) {
      return NextResponse.json(
        { error: "An enhanced profile picture is required to save your Studio Profile." },
        { status: 400 }
      );
    }

    const nextBodyProfile = {
      heightCm,
      weightKg,
      topSize,
      bottomSize,
      shoeSize,
      profileImage: String(formData.get("existingProfileImage") || ""),
      profileImageEnhanced,
      profileImageUploadCount: Number(existingUser.bodyProfile?.profileImageUploadCount || 0),
      outfitGenerationCount: Number(existingUser.bodyProfile?.outfitGenerationCount || 0),
      gender,
      imageEnhancing: Boolean(existingUser.bodyProfile?.imageEnhancing),
      profileImageRequiresGeneration: Boolean(
        existingUser.bodyProfile?.profileImageRequiresGeneration
      ),
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
    logRequestError("store.users.me.body-profile.put", req, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
