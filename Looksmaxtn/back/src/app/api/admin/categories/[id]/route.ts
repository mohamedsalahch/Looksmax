import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Category from "@/admin/models/Category";
import Product from "@/store/models/Product";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";

type LeanCategory = {
  _id: unknown;
  slug: string;
  parentSlug?: string | null;
};

function getDescendantSlugs(categories: LeanCategory[], rootSlug: string) {
  const childrenByParent = new Map<string, string[]>();
  for (const category of categories) {
    const parentSlug = category.parentSlug || null;
    if (!parentSlug) continue;
    const children = childrenByParent.get(parentSlug) || [];
    children.push(category.slug);
    childrenByParent.set(parentSlug, children);
  }

  const descendantSlugs: string[] = [];
  const stack = [...(childrenByParent.get(rootSlug) || [])];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const slug = stack.pop();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    descendantSlugs.push(slug);
    stack.push(...(childrenByParent.get(slug) || []));
  }

  return descendantSlugs;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const { id } = await params;
    const body = await req.json();
    const auditActor = await getAuditActorFromSession(session);
    const existingCategory = await Category.findById(id).lean();
    if (!existingCategory) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const oldSlug = existingCategory.slug;
    const nextSlug = body.slug
      ? String(body.slug).toLowerCase().replace(/\s+/g, "-")
      : oldSlug;

    if (nextSlug !== oldSlug) {
      const slugConflict = await Category.findOne({ slug: nextSlug, _id: { $ne: id } }).lean();
      if (slugConflict) {
        return NextResponse.json({ error: "A category with this slug already exists" }, { status: 400 });
      }
    }

    if (body.parentSlug && body.parentSlug === nextSlug) {
      return NextResponse.json({ error: "A category cannot be its own parent." }, { status: 400 });
    }

    const shouldCascadeVisibility =
      !existingCategory.parentSlug &&
      typeof body.isActive === "boolean" &&
      body.isActive !== existingCategory.isActive;
    const descendantSlugs = shouldCascadeVisibility
      ? getDescendantSlugs(await Category.find().select("slug parentSlug").lean(), oldSlug)
      : [];

    if (nextSlug !== oldSlug) {
      await Category.updateMany(
        { parentSlug: oldSlug },
        { $set: { parentSlug: nextSlug, updatedBy: auditActor } }
      );

      const affectedProducts = await Product.find({ categories: oldSlug })
        .select("_id categories")
        .lean();

      for (const product of affectedProducts) {
        const nextCategories = (product.categories || []).map((slug) => (slug === oldSlug ? nextSlug : slug));
        await Product.updateOne(
          { _id: product._id },
          { $set: { categories: nextCategories } }
        );
      }
    }

    if (shouldCascadeVisibility && descendantSlugs.length > 0) {
      await Category.updateMany(
        { slug: { $in: descendantSlugs } },
        { $set: { isActive: body.isActive, updatedBy: auditActor } }
      );
    }

    const category = await Category.findByIdAndUpdate(
      id,
      { ...body, slug: nextSlug, updatedBy: auditActor },
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
