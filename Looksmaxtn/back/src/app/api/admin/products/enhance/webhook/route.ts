import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import ProductMediaEnhancementJob from "@/admin/models/ProductMediaEnhancementJob";
import { saveProductMediaResultBase64 } from "@/admin/lib/productMediaUploads";

type WebhookBody = {
  job_id?: string;
  jobId?: string;
  view?: string;
  image?: string;
  base64?: string;
  error?: string;
};

export async function POST(req: NextRequest) {
  try {
    const configuredSecret = process.env.OUTFIT_WEBHOOK_SECRET || "";
    const requestSecret = req.headers.get("x-webhook-secret") || "";

    if (configuredSecret && requestSecret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as WebhookBody;
    const jobId = body.job_id || body.jobId;
    const view = req.nextUrl.searchParams.get("view") || String(body.view || "");

    if (!jobId) {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }

    await dbConnect();
    const job = await ProductMediaEnhancementJob.findById(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (body.error) {
      console.error(`[product-media-webhook] Generation service error for job ${jobId}: ${body.error}`);
      job.status = "failed";
      job.errorMessage = "Product media enhancement failed.";
      await job.save();
      return NextResponse.json({ ok: true });
    }

    const imageBase64 = body.image || body.base64;
    if (!imageBase64) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    if (view !== "front" && view !== "back") {
      return NextResponse.json({ error: "Missing view" }, { status: 400 });
    }

    const savedPath = await saveProductMediaResultBase64(imageBase64, view);
    job.images[view] = savedPath;

    if (job.images.front && job.images.back) {
      job.status = "completed";
    }

    await job.save();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[product-media-webhook] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
