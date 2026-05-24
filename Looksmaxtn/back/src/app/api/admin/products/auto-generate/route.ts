import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import Category from "@/store/models/Category";
import ModelAsset from "@/admin/models/ModelAsset";
import ProductGenerationJob from "@/admin/models/ProductGenerationJob";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { readModelImageAsBase64 } from "@/admin/lib/modelUploads";
import { consumeStoreCredit } from "@/admin/lib/storeCredits";

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

function getWebhookBaseUrl(req: NextRequest) {
  const configured = process.env.OUTFIT_WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return req.nextUrl.origin.replace(/\/$/, "");
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
    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

    const formData = await req.formData();
    const gender = String(formData.get("gender") || "").trim().toLowerCase();
    const modelId = String(formData.get("modelId") || "").trim();
    const front = formData.get("front");
    const back = formData.get("back");

    if (!ALLOWED_GENDERS.has(gender)) {
      return NextResponse.json(
        { error: "gender must be one of: men, women, children." },
        { status: 400 }
      );
    }
    if (!modelId) {
      return NextResponse.json({ error: "Please select a model." }, { status: 400 });
    }
    if (!(front instanceof File) || front.size === 0) {
      return NextResponse.json({ error: "front product image is required." }, { status: 400 });
    }
    if (!(back instanceof File) || back.size === 0) {
      return NextResponse.json({ error: "back product image is required." }, { status: 400 });
    }

    await dbConnect();

    const model = await ModelAsset.findById(modelId).lean();
    if (!model) {
      return NextResponse.json({ error: "Model not found." }, { status: 404 });
    }

    if (session.role === "store_owner") {
      try {
        await consumeStoreCredit({
          storeOwnerId: new mongoose.Types.ObjectId(session.userId),
          reason: "Auto model picture generation",
        });
      } catch {
        return NextResponse.json(
          { error: "Generation try limit reached. Contact admin for more tries." },
          { status: 403 }
        );
      }
    }

    const allCategories = (await Category.find({ isActive: true })
      .select("slug name parentSlug isActive")
      .lean()) as unknown as CategoryLean[];

    const bySlug = new Map<string, CategoryLean>();
    for (const cat of allCategories) bySlug.set(cat.slug, cat);
    const candidates = allCategories.filter(
      (cat) => cat.slug !== gender && rootOf(cat.slug, bySlug) === gender
    );
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: `No active categories found for gender '${gender}'.` },
        { status: 422 }
      );
    }

    const productFrontB64 = await fileToBase64(front);
    const productBackB64 = await fileToBase64(back);

    const describeResponse = await fetch(`${normalizedBaseUrl}/api/describe-product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [productFrontB64, productBackB64],
        gender,
        categories: candidates.map((c) => ({ slug: c.slug, name: c.name })),
      }),
    });

    if (!describeResponse.ok) {
      const detail = await describeResponse.text().catch(() => "");
      console.error("[auto-generate] describe-product failed:", describeResponse.status, detail);
      return NextResponse.json(
        { error: "Auto-fill service is currently unavailable." },
        { status: 502 }
      );
    }
    const describeResult = (await describeResponse.json()) as {
      name?: string;
      category?: string;
    };
    const suggestedName = String(describeResult.name || "").trim();
    const suggestedCategory = String(describeResult.category || "").trim();
    if (!suggestedName || !suggestedCategory) {
      return NextResponse.json(
        { error: "Auto-fill returned an empty result." },
        { status: 502 }
      );
    }

    const modelFrontImage = (model as { frontImage?: string; images?: string[] }).frontImage
      || (model as { images?: string[] }).images?.[0]
      || "";
    const modelBackImage = (model as { backImage?: string; images?: string[] }).backImage
      || (model as { images?: string[] }).images?.[1]
      || (model as { images?: string[] }).images?.[0]
      || "";

    const job = await ProductGenerationJob.create({
      status: "processing",
      productType: "fashion",
      fashionSubtype: "clothes",
      garmentZone: "top",
      createdBy: new mongoose.Types.ObjectId(session.userId),
    });

    const webhookBaseUrl = getWebhookBaseUrl(req);
    const webhookUrl = `${webhookBaseUrl}/api/admin/products/generate/webhook`;

    const payload = {
      job_id: job._id,
      webhook_url: webhookUrl,
      model_pictures: {
        front: await readModelImageAsBase64(modelFrontImage),
        back: await readModelImageAsBase64(modelBackImage),
      },
      product_pictures: {
        front: productFrontB64,
        back: productBackB64,
      },
    };

    const triggerResponse = await fetch(`${normalizedBaseUrl}/api/generate-clothes-auto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!triggerResponse.ok) {
      await ProductGenerationJob.findByIdAndUpdate(job._id, {
        status: "failed",
        error: "Failed to reach generation service.",
      });
      return NextResponse.json(
        { error: "Generation service unreachable.", job_id: job._id },
        { status: 502 }
      );
    }

    return NextResponse.json({
      name: suggestedName,
      category: suggestedCategory,
      job_id: job._id,
      status: "processing",
    });
  } catch (error) {
    console.error("[auto-generate] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
