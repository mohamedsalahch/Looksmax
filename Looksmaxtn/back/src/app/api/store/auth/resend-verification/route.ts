import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { createEmailVerificationToken } from "@/store/lib/emailVerification";
import { sendVerificationEmail } from "@/store/lib/mailer";
import { getEmailBaseUrl } from "@/store/lib/emailLinks";

const RESEND_COOLDOWN_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user || user.emailVerified !== false) {
      return NextResponse.json(
        { message: "If an unverified account exists for this email, a new link will be sent." },
        { status: 200 }
      );
    }

    const lastSentAt = user.emailVerificationSentAt ? new Date(user.emailVerificationSentAt).getTime() : 0;
    const now = Date.now();
    if (lastSentAt && now - lastSentAt < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000);
      return NextResponse.json(
        {
          error: `Please wait ${retryAfterSeconds} seconds before requesting another verification email.`,
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
          },
        }
      );
    }

    const verification = createEmailVerificationToken();
    const verificationUrl = new URL("/verify-email", getEmailBaseUrl());
    verificationUrl.searchParams.set("email", user.email);
    verificationUrl.searchParams.set("token", verification.token);

    user.emailVerificationTokenHash = verification.tokenHash;
    user.emailVerificationExpiresAt = verification.expiresAt;
    user.emailVerificationSentAt = new Date();
    await user.save();

    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      verificationUrl: verificationUrl.toString(),
    });

    return NextResponse.json({
      message: "Verification email sent.",
      resendAvailableAfterSeconds: 60,
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
