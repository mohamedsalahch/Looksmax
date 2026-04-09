import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import ProductGenerationJob from "@/admin/models/ProductGenerationJob";

export async function POST(req: NextRequest) {
  try {
    const configuredSecret = process.env.OUTFIT_WEBHOOK_SECRET || "";
    const requestSecret = req.headers.get("x-webhook-secret") || "";

    if (configuredSecret && requestSecret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, any>;
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
      job.status = "failed";
      job.error = body.error;
      await job.save();
      return NextResponse.json({ ok: true });
    }

    const imageBase64 = body.image || body.base64;
    const view = body.view; // "front", "back", "left", "right"

    if (imageBase64 && view) {
      // Store the image in the correct slot
      if (view === "front") job.images.front = imageBase64;
      if (view === "back") job.images.back = imageBase64;
      if (view === "left") job.images.left = imageBase64;
      if (view === "right") job.images.right = imageBase64;

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
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Product Webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
