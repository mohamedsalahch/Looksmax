import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { createToken, getTokenCookieOptions, hashPassword } from "@/store/lib/auth";
import { verifyGoogleIdToken } from "@/store/lib/googleAuth";

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

async function buildUserResponse(user: {
  _id: { toString(): string };
  name: string;
  email: string;
  role: string;
  address?: unknown;
  bodyProfile?: {
    heightCm?: string;
    weightKg?: string;
    topSize?: string;
    bottomSize?: string;
    shoeSize?: string;
    profileImage?: string;
    profileImageEnhanced?: string;
    profileImageUploadCount?: number;
    outfitGenerationCount?: number;
    gender?: string;
    imageEnhancing?: boolean;
  } | null;
}) {
  return {
    id: String(user._id.toString()),
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
          profileImageEnhanced: user.bodyProfile.profileImageEnhanced || "",
          profileImageUploadCount: Number(user.bodyProfile.profileImageUploadCount || 0),
          outfitGenerationCount: Number(user.bodyProfile.outfitGenerationCount || 0),
          gender: normalizeGender(user.bodyProfile.gender),
          imageEnhancing: Boolean(user.bodyProfile.imageEnhancing),
        }
      : user.bodyProfile,
  };
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => null);
    const credential = String(body?.credential || body?.idToken || "").trim();

    if (!credential) {
      return NextResponse.json({ error: "Google credential is required" }, { status: 400 });
    }

    const verification = await verifyGoogleIdToken(credential);
    if ("error" in verification) {
      return NextResponse.json({ error: verification.error }, { status: 401 });
    }

    const payload = verification.payload;
    const googleId = String(payload.sub || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const name = String(payload.name || "").trim() || email.split("@")[0] || "LOOKSMAX User";
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";

    if (!googleId || !email || !emailVerified) {
      return NextResponse.json(
        { error: "Google account email could not be verified." },
        { status: 403 }
      );
    }

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user?.isBlocked) {
      return NextResponse.json(
        { error: "This account has been blocked. Please contact support." },
        { status: 403 }
      );
    }

    if (!user) {
      user = await User.create({
        name,
        email,
        password: await hashPassword(`google-${randomUUID()}`),
        emailVerified: true,
        googleId,
      });
    } else {
      user.googleId = user.googleId || googleId;
      user.emailVerified = true;
      if (!user.name?.trim()) {
        user.name = name;
      }
      await user.save();
    }

    const token = await createToken({ userId: user._id.toString(), role: user.role });
    const cookieOpts = getTokenCookieOptions();

    console.log("[auth][store][google] success", {
      userId: String(user._id),
      role: user.role,
      secureCookie: cookieOpts.secure,
      sameSite: cookieOpts.sameSite,
    });

    const res = NextResponse.json({
      token,
      user: await buildUserResponse(user),
    });

    res.cookies.set(cookieOpts.name, token, cookieOpts);
    return res;
  } catch (error) {
    console.error("Google login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
