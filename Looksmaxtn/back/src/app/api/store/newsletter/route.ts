import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Newsletter from "@/store/models/Newsletter";

// Subscribe
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const existing = await Newsletter.findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: "This email is already subscribed" }, { status: 400 });
    }

    await Newsletter.create({ email: email.toLowerCase() });
    return NextResponse.json({ message: "Successfully subscribed!" }, { status: 201 });
  } catch (error) {
    console.error("Newsletter subscribe error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Unsubscribe
export async function DELETE(req: NextRequest) {
  try {
    await dbConnect();
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const result = await Newsletter.findOneAndDelete({ email: email.toLowerCase() });
    if (!result) {
      return NextResponse.json({ error: "This email is not subscribed" }, { status: 404 });
    }

    return NextResponse.json({ message: "Successfully unsubscribed" });
  } catch (error) {
    console.error("Newsletter unsubscribe error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
