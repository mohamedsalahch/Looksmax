import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Contact from "@/store/models/Contact";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";

// Submit contact message
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
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
