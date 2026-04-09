import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Category from "@/admin/models/Category";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const { id } = await params;
    const body = await req.json();
    const auditActor = await getAuditActorFromSession(session);

    if (body.slug) {
      body.slug = body.slug.toLowerCase().replace(/\s+/g, "-");
    }

    const existingCategory = await Category.findById(id).lean();
    if (!existingCategory) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.parentSlug && body.parentSlug === (body.slug || existingCategory.slug)) {
      return NextResponse.json({ error: "A category cannot be its own parent." }, { status: 400 });
    }

    const category = await Category.findByIdAndUpdate(
      id,
      { ...body, updatedBy: auditActor },
      { new: true }
    ).lean();
    if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ category });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const { id } = await params;
    await Category.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
