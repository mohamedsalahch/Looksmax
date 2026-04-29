import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { hashPassword } from "@/store/lib/auth";
import { createEmailVerificationToken } from "@/store/lib/emailVerification";
import { sendVerificationEmail } from "@/store/lib/mailer";
import { getEmailBaseUrl } from "@/store/lib/emailLinks";
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
    const body = await req.json();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const gender = normalizeGender(body?.gender);

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (!gender) {
      return NextResponse.json({ error: "Gender is required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const turnstile = await verifyTurnstileToken(req, body?.turnstileToken, "store_signup");
    if (!turnstile.ok) {
      return NextResponse.json({ error: turnstile.error }, { status: 400 });
    }

    await dbConnect();

    const existing = await User.findOne({ email });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const hashed = await hashPassword(password);
    const user = await User.create({
      name,
      email,
      password: hashed,
      emailVerified: false,
      bodyProfile: {
        heightCm: "",
        weightKg: "",
        topSize: "",
        bottomSize: "",
        shoeSize: "",
        profileImage: "",
        profileImageEnhanced: "",
        profileImageUploadCount: 0,
        outfitGenerationCount: 0,
        gender,
        imageEnhancing: false,
        profileImageRequiresGeneration: false,
      },
    });

    const verification = createEmailVerificationToken();
    const verificationUrl = new URL("/verify-email", getEmailBaseUrl());
    verificationUrl.searchParams.set("email", email);
    verificationUrl.searchParams.set("token", verification.token);

    user.emailVerified = false;
    user.emailVerificationTokenHash = verification.tokenHash;
    user.emailVerificationExpiresAt = verification.expiresAt;
    user.emailVerificationSentAt = new Date();
    await user.save();

    try {
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        verificationUrl: verificationUrl.toString(),
      });
    } catch (error) {
      await User.findByIdAndDelete(user._id);
      console.error("Verification email error:", error);
      return NextResponse.json(
        { error: "We could not send the verification email. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Account created. Check your email to verify your account.",
        verificationRequired: true,
        email: user.email,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
