import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Category from "@/admin/models/Category";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";

// Admin — get all categories (including inactive)
export async function GET() {
  try {
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const categories = await Category.find().sort({ parentSlug: 1, order: 1, name: 1 }).lean();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Admin — create category
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const { name, slug, order, isActive, parentSlug } = await req.json();
    const auditActor = await getAuditActorFromSession(session);

    if (!name || !slug)
      return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });

    const normalizedSlug = slug.toLowerCase().replace(/\s+/g, "-");
    if (parentSlug && parentSlug === normalizedSlug) {
      return NextResponse.json({ error: "A category cannot be its own parent." }, { status: 400 });
    }

    const existing = await Category.findOne({ slug: normalizedSlug });
    if (existing)
      return NextResponse.json({ error: "A category with this slug already exists" }, { status: 400 });

    const category = await Category.create({
      name,
      slug: normalizedSlug,
      order: order ?? 0,
      isActive: isActive ?? true,
      parentSlug: parentSlug || null,
      createdBy: auditActor,
      updatedBy: auditActor,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
