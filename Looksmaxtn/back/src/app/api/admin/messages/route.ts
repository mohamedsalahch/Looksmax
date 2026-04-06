import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Contact from "@/admin/models/Contact";
import { getSession } from "@/admin/lib/auth";

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
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
