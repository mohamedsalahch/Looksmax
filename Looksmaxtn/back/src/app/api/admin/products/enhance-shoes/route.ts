import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import ProductMediaEnhancementJob from "@/admin/models/ProductMediaEnhancementJob";
import User from "@/admin/models/User";
import { saveProductMediaSourceImage } from "@/admin/lib/productMediaUploads";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";

async function fileToBase64(file: File) {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

function getWebhookBaseUrl(req: NextRequest) {
  const configured = process.env.OUTFIT_WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return req.nextUrl.origin.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  try {
    await logRequestStart("admin.products.enhance-shoes.post", req);

    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const baseUrl = process.env.ADMIN_IMAGE_GENERATION_URL_BASE;
    if (!baseUrl) {
      return NextResponse.json({ error: "ADMIN_IMAGE_GENERATION_URL_BASE is not configured." }, { status: 500 });
    }

    await dbConnect();

    if (session.role === "store_owner") {
      const requestingUser = await User.findById(new mongoose.Types.ObjectId(session.userId))
        .select("storeOwnerStats")
        .lean();
      const triesAllowed = requestingUser?.storeOwnerStats?.triesAllowed ?? 50;
      const triesUsed = requestingUser?.storeOwnerStats?.triesUsed ?? 0;
      if (triesUsed >= triesAllowed) {
        return NextResponse.json({ error: "Enhancement try limit reached. Contact admin for more tries." }, { status: 403 });
      }
      await User.updateOne(
        { _id: new mongoose.Types.ObjectId(session.userId) },
        { $inc: { "storeOwnerStats.triesUsed": 1 } }
      );
    }

    const formData = await req.formData();
    const frontFile = formData.get("front");
    const backFile = formData.get("back");
    const leftFile = formData.get("left");
    const rightFile = formData.get("right");

    if (!(frontFile instanceof File) || frontFile.size === 0) {
      return NextResponse.json({ error: "Front image is required." }, { status: 400 });
    }
    if (!(backFile instanceof File) || backFile.size === 0) {
      return NextResponse.json({ error: "Back image is required." }, { status: 400 });
    }
    if (!(leftFile instanceof File) || leftFile.size === 0) {
      return NextResponse.json({ error: "Left image is required." }, { status: 400 });
    }
    if (!(rightFile instanceof File) || rightFile.size === 0) {
      return NextResponse.json({ error: "Right image is required." }, { status: 400 });
    }

    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    const generateShoesUrl = normalizedBaseUrl.endsWith("/api")
      ? `${normalizedBaseUrl}/generate-shoes`
      : `${normalizedBaseUrl}/api/generate-shoes`;

    const [frontBase64, backBase64, leftBase64, rightBase64] = await Promise.all([
      fileToBase64(frontFile),
      fileToBase64(backFile),
      fileToBase64(leftFile),
      fileToBase64(rightFile),
    ]);

    const [frontSource, backSource, leftSource, rightSource] = await Promise.all([
      saveProductMediaSourceImage(frontFile, "front"),
      saveProductMediaSourceImage(backFile, "back"),
      saveProductMediaSourceImage(leftFile, "left"),
      saveProductMediaSourceImage(rightFile, "right"),
    ]);

    const job = await ProductMediaEnhancementJob.create({
      status: "processing",
      sourceImages: { front: frontSource, back: backSource, left: leftSource, right: rightSource },
      images: { front: "", back: "", left: "", right: "" },
      createdBy: new mongoose.Types.ObjectId(session.userId),
    });

    const webhookBaseUrl = getWebhookBaseUrl(req);
    const webhookUrl = `${webhookBaseUrl}/api/admin/products/enhance-shoes/webhook`;

    let generationResponse: Response;
    try {
      generationResponse = await fetch(generateShoesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job._id.toString(),
          webhook_url: webhookUrl,
          product_pictures: {
            front: frontBase64,
            back: backBase64,
            left: leftBase64,
            right: rightBase64,
          },
        }),
      });
    } catch (fetchErr: unknown) {
      const cause = fetchErr instanceof Error ? (fetchErr.cause ?? fetchErr) : fetchErr;
      console.error("[enhance-shoes] fetch to generator failed:", cause);
      logRequestError("admin.products.enhance-shoes.post", req, fetchErr);
      return NextResponse.json(
        { error: `Generation service unreachable at ${normalizedBaseUrl}. Make sure the generator API is running.` },
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
    logRequestError("admin.products.enhance-shoes.post", req, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
