import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import ModelAsset from "@/admin/models/ModelAsset";
import { getSession } from "@/admin/lib/auth";
import { deleteModelImage } from "@/admin/lib/modelUploads";
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
    const model = await ModelAsset.findById(id).lean();
    if (!model) {
      return NextResponse.json({ error: "Model not found." }, { status: 404 });
    }

    return NextResponse.json({ model });
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
    const model = await ModelAsset.findByIdAndDelete(id).lean();
    if (!model) {
      return NextResponse.json({ error: "Model not found." }, { status: 404 });
    }

    await Promise.all((model.images || []).map((imagePath) => deleteModelImage(imagePath)));
    return NextResponse.json({ success: true });
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
    const model = await ModelAsset.findById(id);

    if (!model) {
      return NextResponse.json({ error: "Model not found." }, { status: 404 });
    }

    const body = await req.json();
    const name = String(body.name || "").trim();
    const gender = String(body.gender || "").trim();
    const frontImage = String(body.frontImage || "").trim();
    const backImage = String(body.backImage || "").trim();

    if (!name) {
      return NextResponse.json({ error: "Model name is required." }, { status: 400 });
    }

    if (!["male", "female", "child"].includes(gender)) {
      return NextResponse.json({ error: "Please select the model gender." }, { status: 400 });
    }

    if (!frontImage || !model.images.includes(frontImage)) {
      return NextResponse.json({ error: "Please choose a valid front image." }, { status: 400 });
    }

    if (!backImage || !model.images.includes(backImage)) {
      return NextResponse.json({ error: "Please choose a valid back image." }, { status: 400 });
    }

    model.name = name;
    model.gender = gender as "male" | "female" | "child";
    model.frontImage = frontImage;
    model.backImage = backImage;
    model.updatedBy = await getAuditActorFromSession(session);
    await model.save();

    return NextResponse.json({ model });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
