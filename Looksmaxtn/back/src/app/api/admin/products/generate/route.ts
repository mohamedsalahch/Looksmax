import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import ModelAsset from "@/admin/models/ModelAsset";
import ProductGenerationJob from "@/admin/models/ProductGenerationJob";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { readModelImageAsBase64 } from "@/admin/lib/modelUploads";

async function fileToBase64(file: File) {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

function normalizeType(type: string, fashionSubtype: string) {
  if (type === "perfume") return "perfume";
  return fashionSubtype === "shoes" ? "shoes" : "clothes";
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
      return NextResponse.json({ error: "PRODUCT_GENERATION_URL_BASE is not configured." }, { status: 500 });
    }

    const webhookBaseUrl = getWebhookBaseUrl(req);
    const webhookUrl = `${webhookBaseUrl}/api/admin/products/generate/webhook`;

    await dbConnect();

    const formData = await req.formData();
    const modelId = String(formData.get("modelId") || "");
    const type = String(formData.get("type") || "fashion");
    const fashionSubtype = String(formData.get("fashionSubtype") || "clothes");
    const mode = String(formData.get("mode") || "manual");
    const generationTarget = String(formData.get("generationTarget") || "");
    const garmentZone = String(formData.get("garmentZone") || "top");
    const companionTopType = String(formData.get("companionTopType") || "");
    const companionBottomType = String(formData.get("companionBottomType") || "");
    const topColorName = String(formData.get("topColorName") || "");
    const topColorHex = String(formData.get("topColorHex") || "");
    const bottomColorName = String(formData.get("bottomColorName") || "");
    const bottomColorHex = String(formData.get("bottomColorHex") || "");
    const footwearType = String(formData.get("footwearType") || "");
    const shoesColorName = String(formData.get("shoesColorName") || "");
    const shoesColorHex = String(formData.get("shoesColorHex") || "");
    const additionalInstructions = String(formData.get("additionalInstructions") || "");
    const companionPrompt = String(formData.get("companionPrompt") || "");
    const normalizedType = normalizeType(type, fashionSubtype);
    const isAuto = mode === "auto" && normalizedType === "clothes";
    const model =
      normalizedType === "clothes" ? await ModelAsset.findById(modelId).lean() : null;

    if (normalizedType === "clothes" && !model) {
      return NextResponse.json({ error: "Model not found." }, { status: 404 });
    }

    const front = formData.get("front");
    const back = formData.get("back");
    const left = formData.get("left");
    const right = formData.get("right");

    const requiredFiles =
      normalizedType === "shoes"
        ? { front, back, left, right }
        : { front, back };
    for (const [label, file] of Object.entries(requiredFiles)) {
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: `${label} image is required.` }, { status: 400 });
      }
    }

    // 1. Create the async job
    const job = await ProductGenerationJob.create({
      status: "processing",
      productType: type,
      fashionSubtype,
      garmentZone,
      createdBy: new mongoose.Types.ObjectId(session.userId),
    });

    const payload =
      isAuto
        ? {
            job_id: job._id,
            webhook_url: webhookUrl,
            model_pictures: {
              front: await readModelImageAsBase64(model?.frontImage || model?.images?.[0] || ""),
              back: await readModelImageAsBase64(
                model?.backImage || model?.images?.[1] || model?.images?.[0] || ""
              ),
            },
            product_pictures: {
              front: await fileToBase64(front as File),
              back: await fileToBase64(back as File),
            },
          }
        : normalizedType === "shoes"
        ? {
            job_id: job._id,
            webhook_url: webhookUrl,
            product_pictures: {
              front: await fileToBase64(front as File),
              back: await fileToBase64(back as File),
              left: await fileToBase64(left as File),
              right: await fileToBase64(right as File),
            },
          }
        : {
            job_id: job._id,
            webhook_url: webhookUrl,
            model_pictures: {
              front: await readModelImageAsBase64(model?.frontImage || model?.images?.[0] || ""),
              back: await readModelImageAsBase64(
                model?.backImage || model?.images?.[1] || model?.images?.[0] || ""
              ),
            },
            product_pictures: {
              front: await fileToBase64(front as File),
              back: await fileToBase64(back as File),
            },
            garment_zone: garmentZone,
            secondary_colors: {
              target: generationTarget,
              top_type: companionTopType,
              bottom_type: companionBottomType,
              footwear_type: footwearType,
              top:
                topColorName && topColorHex
                  ? { name: topColorName, hex: topColorHex }
                  : undefined,
              bottom:
                bottomColorName && bottomColorHex
                  ? { name: bottomColorName, hex: bottomColorHex }
                  : undefined,
              shoes:
                shoesColorName && shoesColorHex
                  ? { name: shoesColorName, hex: shoesColorHex }
                  : undefined,
              additional_instructions: additionalInstructions,
              companion_prompt: companionPrompt || undefined,
            },
          };

    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    const endpoint = isAuto
      ? `${normalizedBaseUrl}/api/generate-clothes-auto`
      : normalizedType === "shoes"
      ? `${normalizedBaseUrl}/api/generate-shoes`
      : `${normalizedBaseUrl}/api/generate`;

    // 2. Trigger Python (Async)
    const triggerResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!triggerResponse.ok) {
      await ProductGenerationJob.findByIdAndUpdate(job._id, {
        status: "failed",
        error: "Failed to reach generation service.",
      });
      return NextResponse.json({ error: "Generation service unreachable.", job_id: job._id }, { status: 502 });
    }

    // 3. Return the job immediately
    return NextResponse.json({ job_id: job._id, status: "processing" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get("job_id");
    if (!jobId) {
      return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
    }

    await dbConnect();
    const job = await ProductGenerationJob.findById(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      job_id: job._id,
      status: job.status,
      images: job.images,
      error: job.error,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
