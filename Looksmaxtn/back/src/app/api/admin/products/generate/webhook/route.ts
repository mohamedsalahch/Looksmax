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
    const job = await ProductGenerationJob.findById(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (body.error) {
      console.error(`[product-webhook] Generation service error for job ${jobId}: ${body.error}`);
      job.status = "failed";
      job.error = "Generation failed.";
      await job.save();
      if (job.createdBy) {
        publishJobEvent(job.createdBy.toString(), {
          type: "job:update",
          kind: "generate",
          jobId: String(job._id),
          status: "failed",
          error: job.error,
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
    const view = typeof body.view === "string" ? body.view : ""; // "front", "back", "left", "right"

    if (imageBase64 && view) {
      if (!["front", "back", "left", "right"].includes(view)) {
        return NextResponse.json({ error: "Invalid view" }, { status: 400 });
      }

      const savedPath = await saveProductGenerationResultBase64(
        imageBase64,
        view as "front" | "back" | "left" | "right"
      );

      // Store the image in the correct slot
      if (view === "front") job.images.front = savedPath;
      if (view === "back") job.images.back = savedPath;
      if (view === "left") job.images.left = savedPath;
      if (view === "right") job.images.right = savedPath;
      job.markModified("images");

      // Check if job is completed
      const isClothes = job.fashionSubtype === "clothes";
      const isShoes = job.fashionSubtype === "shoes";

      if (isClothes && job.images.front && job.images.back) {
        job.status = "completed";
      } else if (isShoes && job.images.front && job.images.back && job.images.left && job.images.right) {
        job.status = "completed";
      }
    }

    await job.save();

    if (job.status === "completed" && job.createdBy) {
      publishJobEvent(job.createdBy.toString(), {
        type: "job:update",
        kind: "generate",
        jobId: String(job._id),
        status: "completed",
        images: { ...(job.images as Record<string, string>) },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Product Webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
