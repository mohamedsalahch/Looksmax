import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import { queueBodyProfileEnhancement } from "@/store/lib/bodyProfileEnhancement";

export async function POST(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const userObjectId = new mongoose.Types.ObjectId(session.userId);
    const existingUser = await User.collection.findOne(
      { _id: userObjectId },
      { projection: { bodyProfile: 1 } }
    );

    const profileImage = existingUser?.bodyProfile?.profileImage || "";
    if (!profileImage) {
      return NextResponse.json({ error: "No profile image available to generate" }, { status: 400 });
    }

    if (existingUser?.bodyProfile?.imageEnhancing) {
      return NextResponse.json({ error: "Photo is already being generated" }, { status: 409 });
    }

    await User.collection.updateOne(
      { _id: userObjectId },
      {
        $set: {
          "bodyProfile.imageEnhancing": true,
        },
      }
    );

    queueBodyProfileEnhancement(session.userId, profileImage).catch((err) => {
      console.error("[profile-photo] Manual enhancement failed:", err);
    });

    return NextResponse.json({
      ok: true,
      imageEnhancing: true,
    });
  } catch (error) {
    console.error("[profile-photo] Manual generate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
