import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import ProductGenerationJob from "@/admin/models/ProductGenerationJob";
import { saveProductGenerationResultBase64 } from "@/admin/lib/productGenerationUploads";
import { requireWebhookSecret } from "@/lib/webhookAuth";
import { publishJobEvent } from "@/admin/lib/jobEvents";

export async function POST(req: NextRequest) {
  try {
    const unauthorized = requireWebhookSecret(req);
    if (unauthorized) return unauthorized;

    const body = (await req.json()) as Record<string, unknown>;
    const jobId = body.job_id || body.jobId;

    if (!jobId) {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }

    await dbConnect();

    if (body.error) {
      console.error(`[product-webhook] Generation service error for job ${jobId}: ${body.error}`);
      const failed = await ProductGenerationJob.findOneAndUpdate(
        { _id: jobId, status: { $ne: "failed" } },
        { $set: { status: "failed", error: "Generation failed." } },
        { new: true }
      );
      if (!failed) {
        return NextResponse.json({ ok: true });
      }
      if (failed.createdBy) {
        publishJobEvent(failed.createdBy.toString(), {
          type: "job:update",
          kind: "generate",
          jobId: String(failed._id),
          status: "failed",
          error: failed.error,
        });
      }
      return NextResponse.json({ ok: true });
    }

    const imageBase64 =
      typeof body.image === "string"
        ? body.image
        : typeof body.base64 === "string"
          ? body.base64
          : "";
    const view = typeof body.view === "string" ? body.view : "";

    if (!imageBase64 || !view) {
      return NextResponse.json({ ok: true });
    }
    if (!["front", "back", "left", "right"].includes(view)) {
      return NextResponse.json({ error: "Invalid view" }, { status: 400 });
    }

    const savedPath = await saveProductGenerationResultBase64(
      imageBase64,
      view as "front" | "back" | "left" | "right"
    );

    const updated = await ProductGenerationJob.findByIdAndUpdate(
      jobId,
      { $set: { [`images.${view}`]: savedPath } },
      { new: true }
    );
    if (!updated) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const isClothes = updated.fashionSubtype === "clothes";
    const isShoes = updated.fashionSubtype === "shoes";
    const imgs = updated.images as Record<string, string>;
    const isComplete =
      (isClothes && imgs.front && imgs.back) ||
      (isShoes && imgs.front && imgs.back && imgs.left && imgs.right);

    if (isComplete) {
      const completed = await ProductGenerationJob.findOneAndUpdate(
        { _id: jobId, status: { $ne: "completed" } },
        { $set: { status: "completed" } },
        { new: true }
      );
      if (completed && completed.createdBy) {
        publishJobEvent(completed.createdBy.toString(), {
          type: "job:update",
          kind: "generate",
          jobId: String(completed._id),
          status: "completed",
          images: { ...(completed.images as Record<string, string>) },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Product Webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
