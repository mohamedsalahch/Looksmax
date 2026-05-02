import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { createToken, getSession, getTokenCookieOptions } from "@/store/lib/auth";

function normalizeGender(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "male" || normalized === "man" || normalized === "men") {
    return "men";
  }
  if (normalized === "female" || normalized === "woman" || normalized === "women") {
    return "women";
  }
  return "";
}

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const user = await User.collection.findOne(
      { _id: new mongoose.Types.ObjectId(session.userId) },
      { projection: { name: 1, email: 1, role: 1, address: 1, bodyProfile: 1, isBlocked: 1, googleId: 1, sessionVersion: 1 } }
    );

    if (!user || user.isBlocked) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await createToken({
      userId: session.userId,
      role: session.role,
      sessionVersion: Number(user.sessionVersion ?? 0),
    });
    const cookieOpts = getTokenCookieOptions();
    const res = NextResponse.json({
      token,
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          role: user.role,
          googleId: user.googleId || null,
          storeName: user.storeName || "",
          storeType: user.storeType || null,
          storeApprovalStatus: user.storeApprovalStatus || null,
          address: user.address,
          bodyProfile: user.bodyProfile
          ? {
              heightCm: user.bodyProfile.heightCm || "",
              weightKg: user.bodyProfile.weightKg || "",
              topSize: user.bodyProfile.topSize || "",
              bottomSize: user.bodyProfile.bottomSize || "",
              shoeSize: user.bodyProfile.shoeSize || "",
              profileImage: user.bodyProfile.profileImage || "",
              profileImageEnhanced: user.bodyProfile.profileImageEnhanced || "",
              profileImageUploadCount: Number(user.bodyProfile.profileImageUploadCount || 0),
              outfitGenerationCount: Number(user.bodyProfile.outfitGenerationCount || 0),
              gender: normalizeGender(user.bodyProfile.gender),
              imageEnhancing: Boolean(user.bodyProfile.imageEnhancing),
              profileImageRequiresGeneration: Boolean(
                user.bodyProfile.profileImageRequiresGeneration
              ),
            }
          : user.bodyProfile,
      },
    });

    res.cookies.set(cookieOpts.name, token, cookieOpts);
    return res;
  } catch (error) {
    console.error("Store refresh error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
