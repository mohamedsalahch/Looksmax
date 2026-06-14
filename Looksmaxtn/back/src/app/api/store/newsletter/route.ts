import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/store/lib/mongodb";
import Newsletter from "@/store/models/Newsletter";
import { verifyTurnstileToken } from "@/store/lib/turnstile";

const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email: string) {
  return email.length > 0 && email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email);
}

function verifyUnsubscribeToken(email: string, token: unknown) {
  const secret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET?.trim();
  const provided = String(token || "");
  if (!secret || !provided) return false;
  const expected = crypto.createHmac("sha256", secret).update(email).digest("hex");
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

// Subscribe
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const { email: rawEmail, turnstileToken } = await req.json();
    const email = normalizeEmail(rawEmail);

    const turnstile = await verifyTurnstileToken(req, turnstileToken, "newsletter");
    if (!turnstile.ok) {
      return NextResponse.json({ error: turnstile.error }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const existing = await Newsletter.findOne({ email });
    if (existing) {
      return NextResponse.json({ message: "If this email can be subscribed, it is now on the list." }, { status: 201 });
    }

    await Newsletter.create({ email });
    return NextResponse.json({ message: "If this email can be subscribed, it is now on the list." }, { status: 201 });
  } catch (error) {
    console.error("Newsletter subscribe error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Unsubscribe
export async function DELETE(req: NextRequest) {
  try {
    await dbConnect();
    const { email: rawEmail, token } = await req.json();
    const email = normalizeEmail(rawEmail);

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!verifyUnsubscribeToken(email, token)) {
      return NextResponse.json({ error: "A valid unsubscribe token is required" }, { status: 403 });
    }

    await Newsletter.findOneAndDelete({ email });
    return NextResponse.json({ message: "Successfully unsubscribed" });
  } catch (error) {
    console.error("Newsletter unsubscribe error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
