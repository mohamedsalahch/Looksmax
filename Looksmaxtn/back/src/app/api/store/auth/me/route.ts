import { NextResponse } from "next/server";
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
      console.log("[auth][store][me] no session");
      return NextResponse.json({ user: null }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(session.userId)
      .select("name email role address bodyProfile isBlocked googleId")
      .lean();
    if (!user || user.isBlocked) {
      console.log("[auth][store][me] invalid user", {
        userId: session.userId,
        blocked: Boolean(user?.isBlocked),
      });
      return NextResponse.json({ user: null }, { status: 401 });
    }

    console.log("[auth][store][me] session ok", {
      userId: session.userId,
      role: session.role,
    });

    return NextResponse.json(
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          googleId: user.googleId || null,
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
