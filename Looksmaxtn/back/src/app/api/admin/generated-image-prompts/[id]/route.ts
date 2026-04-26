import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import GeneratedImagePrompt from "@/admin/models/GeneratedImagePrompt";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const prompt = await GeneratedImagePrompt.findById(id).lean();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found." }, { status: 404 });
    }

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const prompt = await GeneratedImagePrompt.findById(id);

    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found." }, { status: 404 });
    }

    const body = await req.json();
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();

    if (!title) {
      return NextResponse.json({ error: "Prompt title is required." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ error: "Prompt description is required." }, { status: 400 });
    }

    prompt.title = title;
    prompt.description = description;
    prompt.updatedBy = await getAuditActorFromSession(session);
    await prompt.save();

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const prompt = await GeneratedImagePrompt.findByIdAndDelete(id).lean();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
