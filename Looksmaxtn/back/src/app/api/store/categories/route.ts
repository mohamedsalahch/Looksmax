import { NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Category from "@/store/models/Category";

type CategoryNode = {
  _id: unknown;
  name: string;
  slug: string;
  order: number;
  isActive: boolean;
  parentSlug?: string | null;
  children: CategoryNode[];
};

function buildCategoryTree(
  categories: Array<{
    _id: unknown;
    name: string;
    slug: string;
    order: number;
    isActive: boolean;
    parentSlug?: string | null;
  }>
) : CategoryNode[] {
  const buildBranch = (parentSlug: string | null = null): CategoryNode[] =>
    categories
      .filter((category) => (category.parentSlug || null) === parentSlug)
      .sort((a, b) => a.order - b.order)
      .map((category) => ({
        ...category,
        children: buildBranch(category.slug),
      }));

  return buildBranch(null);
}

// Public — get active categories sorted by order
export async function GET() {
  try {
    await dbConnect();
    const categories = await Category.find({ isActive: true })
      .sort({ parentSlug: 1, order: 1, name: 1 })
      .lean();
    return NextResponse.json({ categories, tree: buildCategoryTree(categories) });
  } catch (error) {
    console.error("Get categories error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
