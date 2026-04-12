import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { createToken, getTokenCookieOptions } from "@/store/lib/auth";
import { hashEmailVerificationToken } from "@/store/lib/emailVerification";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const token = String(body?.token || "").trim();

    if (!email || !token) {
      return NextResponse.json({ error: "Email and token are required" }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "Invalid verification link" }, { status: 400 });
    }

    if (user.emailVerified !== false) {
      const sessionToken = await createToken({ userId: user._id.toString(), role: user.role });
      const res = NextResponse.json({
        message: "Email already verified.",
        verified: true,
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      });
      res.cookies.set(getTokenCookieOptions().name, sessionToken, getTokenCookieOptions());
      return res;
    }

    if (!user.emailVerificationTokenHash || !user.emailVerificationExpiresAt) {
      return NextResponse.json({ error: "Verification link is no longer valid" }, { status: 410 });
    }

    if (user.emailVerificationExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Verification link has expired" }, { status: 410 });
    }

    const tokenHash = hashEmailVerificationToken(token);
    if (tokenHash !== user.emailVerificationTokenHash) {
      return NextResponse.json({ error: "Invalid verification link" }, { status: 400 });
    }

    user.emailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;
    user.emailVerificationSentAt = null;
    await user.save();

    const sessionToken = await createToken({ userId: user._id.toString(), role: user.role });
    const cookieOpts = getTokenCookieOptions();
    const res = NextResponse.json({
      message: "Email verified successfully.",
      verified: true,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
    res.cookies.set(cookieOpts.name, sessionToken, cookieOpts);
    return res;
  } catch (error) {
    console.error("Verify email error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
