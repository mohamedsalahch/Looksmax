import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Contact from "@/store/models/Contact";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";
import { verifyTurnstileToken } from "@/store/lib/turnstile";

const LIMITS = {
  name: 80,
  email: 254,
  subject: 120,
  message: 2000,
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

// Submit contact message
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const name = clean(body.name, LIMITS.name);
    const email = clean(body.email, LIMITS.email).toLowerCase();
    const subject = clean(body.subject, LIMITS.subject);
    const message = clean(body.message, LIMITS.message);

    const turnstile = await verifyTurnstileToken(req, body.turnstileToken, "contact");
    if (!turnstile.ok) {
      return NextResponse.json({ error: turnstile.error }, { status: 400 });
    }

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const contactMessage = await Contact.create({ name, email, subject, message });
    broadcastAdminEvent({
      type: "message:upsert",
      message: {
        _id: String(contactMessage._id),
        name: contactMessage.name,
        email: contactMessage.email,
        subject: contactMessage.subject,
        message: contactMessage.message,
        isRead: Boolean(contactMessage.isRead),
        createdAt: contactMessage.createdAt.toISOString(),
      },
    });
    return NextResponse.json({ message: "Message sent successfully!" }, { status: 201 });
  } catch (error) {
    console.error("Contact submit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
