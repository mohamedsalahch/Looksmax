import { NextResponse } from "next/server";
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
    const user = await User.findById(session.userId)
      .select("name email role address bodyProfile isBlocked googleId sessionVersion")
      .lean();

    if (!user || user.isBlocked) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await createToken({
      userId: session.userId,
      role: session.role,
      sessionVersion: user.sessionVersion ?? 0,
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
