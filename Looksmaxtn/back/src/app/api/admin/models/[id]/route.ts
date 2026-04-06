import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import ModelAsset from "@/admin/models/ModelAsset";
import { getSession } from "@/admin/lib/auth";
import { deleteModelImage } from "@/admin/lib/modelUploads";

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
