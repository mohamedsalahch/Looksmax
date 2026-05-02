import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { comparePassword, createToken, getTokenCookieOptions } from "@/store/lib/auth";
import { verifyTurnstileToken } from "@/store/lib/turnstile";

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

export async function POST(req: NextRequest) {
  try {
    let body: { email?: string; password?: string; turnstileToken?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const turnstile = await verifyTurnstileToken(req, body.turnstileToken, "store_login");
    if (!turnstile.ok) {
      return NextResponse.json({ error: turnstile.error }, { status: 400 });
    }

    await dbConnect();

    const user = await User.findOne({ email }).select("name email role address bodyProfile password isBlocked emailVerified googleId");
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (user.isBlocked) {
      return NextResponse.json(
        { error: "This account has been blocked. Please contact support." },
        { status: 403 }
      );
    }

    if (user.emailVerified === false) {
      return NextResponse.json(
        { error: "Please verify your email before signing in." },
        { status: 403 }
      );
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    await User.collection.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    const updatedUser = await User.collection.findOne({ _id: user._id }, { projection: { sessionVersion: 1 } });
    const sessionVersion = Number(updatedUser?.sessionVersion ?? 0);

    const token = await createToken({ userId: user._id.toString(), role: user.role, sessionVersion });
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
  } catch (error: unknown) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
