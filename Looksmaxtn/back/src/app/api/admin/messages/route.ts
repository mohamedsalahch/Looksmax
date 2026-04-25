import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Contact from "@/admin/models/Contact";
import { getSession } from "@/admin/lib/auth";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";

function getMessageEventPayload(message: {
  _id: { toString(): string } | string;
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  isRead?: boolean;
  createdAt?: Date | string;
}) {
  return {
    _id: String(message._id),
    name: String(message.name || ""),
    email: String(message.email || ""),
    subject: String(message.subject || ""),
    message: String(message.message || ""),
    isRead: Boolean(message.isRead),
    createdAt:
      message.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : String(message.createdAt || new Date().toISOString()),
  };
}

// Admin — list all messages
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const messages = await Contact.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ messages });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Admin — mark as read / delete
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const { id, isRead } = await req.json();
    const msg = await Contact.findByIdAndUpdate(id, { isRead }, { new: true }).lean();
    if (msg) {
      broadcastAdminEvent({ type: "message:upsert", message: getMessageEventPayload(msg) });
    }
    return NextResponse.json({ message: msg });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const { id } = await req.json();
    await Contact.findByIdAndDelete(id);
    broadcastAdminEvent({ type: "message:delete", messageId: String(id || "") });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
