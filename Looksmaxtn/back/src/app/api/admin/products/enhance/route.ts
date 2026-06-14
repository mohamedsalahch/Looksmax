import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import ProductMediaEnhancementJob from "@/admin/models/ProductMediaEnhancementJob";
import {
  saveProductMediaSourceImage,
} from "@/admin/lib/productMediaUploads";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { getGeneratorAuthHeaders } from "@/lib/generatorAuth";

const ALL_VIEWS = ["front", "back", "left", "right"] as const;
type EnhancementView = typeof ALL_VIEWS[number];

async function fileToBase64(file: File) {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

function buildGeneratorEndpoint(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return normalizedBaseUrl.endsWith("/api")
    ? `${normalizedBaseUrl}/${path}`
    : `${normalizedBaseUrl}/api/${path}`;
}

function getWebhookBaseUrl(req: NextRequest) {
  const configured = process.env.OUTFIT_WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return req.nextUrl.origin.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  try {
    await logRequestStart("admin.products.enhance.post", req);

    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const baseUrl = process.env.ADMIN_IMAGE_GENERATION_URL_BASE;
    if (!baseUrl) {
      return NextResponse.json({ error: "ADMIN_IMAGE_GENERATION_URL_BASE is not configured." }, { status: 500 });
    }

    await dbConnect();

    const formData = await req.formData();
    const mode = String(formData.get("mode") || "garment");
    const filesByView = Object.fromEntries(
      ALL_VIEWS.map((view) => [view, formData.get(view)])
    ) as Record<EnhancementView, FormDataEntryValue | null>;
    const uploadedViews = ALL_VIEWS.filter(
      (view) => filesByView[view] instanceof File && (filesByView[view] as File).size > 0
    );

    const webhookBaseUrl = getWebhookBaseUrl(req);
    const webhookUrl = `${webhookBaseUrl}/api/admin/products/enhance/webhook`;

    if (mode === "accessory") {
      if (uploadedViews.length === 0) {
        return NextResponse.json({ error: "At least one image is required." }, { status: 400 });
      }

      const sourceImages: Record<EnhancementView, string> = {
        front: "",
        back: "",
        left: "",
        right: "",
      };
      const productPictures: Record<EnhancementView, string> = {
        front: "",
        back: "",
        left: "",
        right: "",
      };

      await Promise.all(
        uploadedViews.map(async (view) => {
          const file = filesByView[view] as File;
          sourceImages[view] = await saveProductMediaSourceImage(file, view);
          productPictures[view] = await fileToBase64(file);
        })
      );

      const job = await ProductMediaEnhancementJob.create({
        status: "processing",
        sourceImages,
        images: { front: "", back: "", left: "", right: "" },
        createdBy: new mongoose.Types.ObjectId(session.userId),
      });

      let generationResponse: Response;
      try {
        generationResponse = await fetch(buildGeneratorEndpoint(baseUrl, "enhance-accessory"), {
          method: "POST",
          headers: getGeneratorAuthHeaders(),
          body: JSON.stringify({
            job_id: job._id.toString(),
            webhook_url: webhookUrl,
            product_pictures: productPictures,
          }),
        });
      } catch (fetchErr: unknown) {
        const cause = fetchErr instanceof Error ? (fetchErr.cause ?? fetchErr) : fetchErr;
        console.error("[enhance] fetch to generator failed:", cause);
        logRequestError("admin.products.enhance.post", req, fetchErr);
        job.status = "failed";
        job.errorMessage = "Generation service unreachable.";
        await job.save();
        return NextResponse.json(
          { error: `Generation service unreachable. Make sure the generator API is running.` },
          { status: 503 }
        );
      }

      if (!generationResponse.ok) {
        job.status = "failed";
        job.errorMessage = "Failed to reach generation service.";
        await job.save();
        return NextResponse.json({ error: "Generation service unreachable.", job_id: job._id }, { status: 502 });
      }

      return NextResponse.json({
        job_id: job._id,
        status: "processing",
        sourceImages: job.sourceImages,
        images: job.images,
      });
    }

    const frontFile = filesByView.front;
    const backFile = filesByView.back;

    if (!(frontFile instanceof File) || frontFile.size === 0) {
      return NextResponse.json({ error: "Front image is required." }, { status: 400 });
    }

    if (!(backFile instanceof File) || backFile.size === 0) {
      return NextResponse.json({ error: "Back image is required." }, { status: 400 });
    }

    const [frontBase64, backBase64] = await Promise.all([
      fileToBase64(frontFile),
      fileToBase64(backFile),
    ]);

    const sourceImages = {
      front: await saveProductMediaSourceImage(frontFile, "front"),
      back: await saveProductMediaSourceImage(backFile, "back"),
    };

    const job = await ProductMediaEnhancementJob.create({
      status: "processing",
      sourceImages,
      images: { front: "", back: "" },
      createdBy: new mongoose.Types.ObjectId(session.userId),
    });

    let generationResponse: Response;
    try {
      generationResponse = await fetch(buildGeneratorEndpoint(baseUrl, "enhance-garment"), {
        method: "POST",
        headers: getGeneratorAuthHeaders(),
        body: JSON.stringify({
          job_id: job._id.toString(),
          webhook_url: webhookUrl,
          product_pictures: { front: frontBase64, back: backBase64 },
        }),
      });
    } catch (fetchErr: unknown) {
      const cause = fetchErr instanceof Error ? (fetchErr.cause ?? fetchErr) : fetchErr;
      console.error("[enhance] fetch to generator failed:", cause);
      logRequestError("admin.products.enhance.post", req, fetchErr);
      job.status = "failed";
      job.errorMessage = "Generation service unreachable.";
      await job.save();
      return NextResponse.json(
        { error: `Generation service unreachable. Make sure the generator API is running.` },
        { status: 503 }
      );
    }

    if (!generationResponse.ok) {
      job.status = "failed";
      job.errorMessage = "Failed to reach generation service.";
      await job.save();
      return NextResponse.json({ error: "Generation service unreachable.", job_id: job._id }, { status: 502 });
    }

    return NextResponse.json({
      job_id: job._id,
      status: "processing",
      sourceImages: job.sourceImages,
      images: job.images,
    });
  } catch (error) {
    logRequestError("admin.products.enhance.post", req, error);
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
    const job = await ProductMediaEnhancementJob.findById(jobId).lean();
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      job_id: job._id,
      status: job.status,
      sourceImages: job.sourceImages,
      images: job.images,
      error: job.errorMessage || "",
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
