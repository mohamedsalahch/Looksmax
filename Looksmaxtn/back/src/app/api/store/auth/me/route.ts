import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";

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

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    await dbConnect();
    const user = await User.collection.findOne(
      { _id: new mongoose.Types.ObjectId(session.userId) },
      { projection: { name: 1, email: 1, role: 1, address: 1, bodyProfile: 1 } }
    );
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json(
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          address: user.address,
          bodyProfile: user.bodyProfile
            ? {
                heightCm: user.bodyProfile.heightCm || "",
                weightKg: user.bodyProfile.weightKg || "",
                topSize: user.bodyProfile.topSize || "",
                bottomSize: user.bodyProfile.bottomSize || "",
                shoeSize: user.bodyProfile.shoeSize || "",
                profileImage: user.bodyProfile.profileImage || "",
                gender: normalizeGender(user.bodyProfile.gender),
              }
            : user.bodyProfile,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error: unknown) {
    console.error("Get session error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
