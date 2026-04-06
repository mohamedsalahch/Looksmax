import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import GeneratedImageAsset from "@/admin/models/GeneratedImageAsset";
import { getSession } from "@/admin/lib/auth";
import { deleteGeneratedImage } from "@/admin/lib/generatedImageUploads";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const asset = await GeneratedImageAsset.findByIdAndDelete(id).lean();

    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await Promise.all([...(asset.images || []), ...(asset.sourceImages || [])].map(deleteGeneratedImage));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
