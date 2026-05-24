import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Category from "@/store/models/Category";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";

type CategoryLean = {
  slug: string;
  name: string;
  parentSlug?: string | null;
  isActive?: boolean;
};

const ALLOWED_GENDERS = new Set(["men", "women", "children"]);

async function fileToBase64(file: File) {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

function rootOf(slug: string, bySlug: Map<string, CategoryLean>): string | null {
  let current: CategoryLean | undefined = bySlug.get(slug);
  const visited = new Set<string>();
  while (current && current.parentSlug) {
    if (visited.has(current.slug)) return null;
    visited.add(current.slug);
    const parent = bySlug.get(current.parentSlug);
    if (!parent) return current.parentSlug;
    current = parent;
  }
  return current ? current.slug : null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const baseUrl = process.env.PRODUCT_GENERATION_URL_BASE;
    if (!baseUrl) {
      return NextResponse.json(
        { error: "PRODUCT_GENERATION_URL_BASE is not configured." },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const gender = String(formData.get("gender") || "").trim().toLowerCase();
    if (!ALLOWED_GENDERS.has(gender)) {
      return NextResponse.json(
        { error: "gender must be one of: men, women, children." },
        { status: 400 }
      );
    }

    const imageFiles = formData
      .getAll("images")
      .filter((v): v is File => v instanceof File && v.size > 0);

    if (imageFiles.length === 0) {
      return NextResponse.json(
        { error: "Please upload at least one product image." },
        { status: 400 }
      );
    }
    if (imageFiles.length > 4) {
      return NextResponse.json(
        { error: "Maximum 4 images allowed for auto-fill." },
        { status: 400 }
      );
    }

    await dbConnect();
    const allCategories = (await Category.find({ isActive: true })
      .select("slug name parentSlug isActive")
      .lean()) as unknown as CategoryLean[];

    const bySlug = new Map<string, CategoryLean>();
    for (const cat of allCategories) bySlug.set(cat.slug, cat);

    const candidates = allCategories.filter((cat) => {
      if (cat.slug === gender) return false;
      return rootOf(cat.slug, bySlug) === gender;
    });

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: `No active categories found for gender '${gender}'.` },
        { status: 422 }
      );
    }

    const images = await Promise.all(imageFiles.map(fileToBase64));

    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    const describeResponse = await fetch(`${normalizedBaseUrl}/api/describe-product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images,
        gender,
        categories: candidates.map((c) => ({ slug: c.slug, name: c.name })),
      }),
    });

    if (!describeResponse.ok) {
      const detail = await describeResponse.text().catch(() => "");
      console.error("[auto-fill] describe-product failed:", describeResponse.status, detail);
      return NextResponse.json(
        { error: "Auto-fill service is currently unavailable." },
        { status: 502 }
      );
    }

    const result = (await describeResponse.json()) as { name?: string; category?: string };
    const name = String(result.name || "").trim();
    const category = String(result.category || "").trim();

    if (!name || !category) {
      return NextResponse.json(
        { error: "Auto-fill returned an empty result." },
        { status: 502 }
      );
    }

    return NextResponse.json({ name, category });
  } catch (error) {
    console.error("[auto-fill] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
