import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import ProductMediaEnhancementJob from "@/admin/models/ProductMediaEnhancementJob";
import { saveProductMediaResultBase64 } from "@/admin/lib/productMediaUploads";
import { requireWebhookSecret } from "@/lib/webhookAuth";
import { publishJobEvent } from "@/admin/lib/jobEvents";

type WebhookBody = {
  job_id?: string;
  jobId?: string;
  view?: string;
  image?: string;
  base64?: string;
  error?: string;
};

const VALID_VIEWS = ["front", "back", "left", "right"] as const;
type EnhancementView = typeof VALID_VIEWS[number];

function hasAllEnhancedResults(job: {
  sourceImages: Record<EnhancementView, string>;
  images: Record<EnhancementView, string>;
}) {
  return VALID_VIEWS.every((view) => {
    if (!job.sourceImages[view]) return true;
    return Boolean(job.images[view]);
  });
}

export async function POST(req: NextRequest) {
  try {
    const unauthorized = requireWebhookSecret(req);
    if (unauthorized) return unauthorized;

    const body = (await req.json()) as WebhookBody;
    const jobId = body.job_id || body.jobId;
    const view = (req.nextUrl.searchParams.get("view") || String(body.view || "")) as EnhancementView;

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
      if (job.createdBy) {
        publishJobEvent(job.createdBy.toString(), {
          type: "job:update",
          kind: "enhance",
          jobId: String(job._id),
          status: "failed",
          error: job.errorMessage,
        });
      }
      return NextResponse.json({ ok: true });
    }

    const imageBase64 = body.image || body.base64;
    if (!imageBase64) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    if (!(VALID_VIEWS as readonly string[]).includes(view)) {
      return NextResponse.json({ error: "Missing view" }, { status: 400 });
    }

    const savedPath = await saveProductMediaResultBase64(imageBase64, view);
    job.images[view] = savedPath;
    job.markModified("images");

    const wasCompleted = hasAllEnhancedResults(
      job as unknown as { sourceImages: Record<EnhancementView, string>; images: Record<EnhancementView, string> }
    );
    if (wasCompleted) {
      job.status = "completed";
    }

    await job.save();

    if (wasCompleted && job.createdBy) {
      publishJobEvent(job.createdBy.toString(), {
        type: "job:update",
        kind: "enhance",
        jobId: String(job._id),
        status: "completed",
        images: { ...(job.images as Record<string, string>) },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[product-media-webhook] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
