import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import GeneratedImagePrompt from "@/admin/models/GeneratedImagePrompt";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const prompts = await GeneratedImagePrompt.find().sort({ updatedAt: -1, title: 1 }).lean();
    return NextResponse.json({ prompts });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await req.json();
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();

    if (!title) {
      return NextResponse.json({ error: "Prompt title is required." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ error: "Prompt description is required." }, { status: 400 });
    }

    const auditActor = await getAuditActorFromSession(session);
    const prompt = await GeneratedImagePrompt.create({
      title,
      description,
      createdBy: auditActor,
      updatedBy: auditActor,
    });

    return NextResponse.json({ prompt }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
