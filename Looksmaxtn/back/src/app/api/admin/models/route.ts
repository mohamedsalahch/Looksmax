import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import ModelAsset from "@/admin/models/ModelAsset";
import { getSession } from "@/admin/lib/auth";
import { saveModelImage } from "@/admin/lib/modelUploads";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const models = await ModelAsset.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ models });
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
    const auditActor = await getAuditActorFromSession(session);
    const formData = await req.formData();
    const name = String(formData.get("name") || "").trim();
    const frontImageIndex = Number(formData.get("frontImageIndex") ?? -1);
    const backImageIndex = Number(formData.get("backImageIndex") ?? -1);
    const imageFiles = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!name) {
      return NextResponse.json({ error: "Model name is required." }, { status: 400 });
    }

    if (imageFiles.length === 0) {
      return NextResponse.json({ error: "At least one model image is required." }, { status: 400 });
    }

    if (frontImageIndex < 0 || frontImageIndex >= imageFiles.length) {
      return NextResponse.json({ error: "Please choose the front model image." }, { status: 400 });
    }

    if (backImageIndex < 0 || backImageIndex >= imageFiles.length) {
      return NextResponse.json({ error: "Please choose the back model image." }, { status: 400 });
    }

    const imagePaths = await Promise.all(imageFiles.map((file) => saveModelImage(file)));
    const model = await ModelAsset.create({
      name,
      images: imagePaths,
      frontImage: imagePaths[frontImageIndex],
      backImage: imagePaths[backImageIndex],
      createdBy: auditActor,
      updatedBy: auditActor,
    });
    return NextResponse.json({ model }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
