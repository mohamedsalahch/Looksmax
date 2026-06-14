import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import OutfitGenerationJob from "@/store/models/OutfitGenerationJob";
import { requireWebhookSecret } from "@/lib/webhookAuth";
import { publishStoreUserEvent } from "@/store/lib/storeUserEvents";
import { persistOutfitImage } from "@/store/lib/outfitImageStorage";
import { refundOutfitTryForJob } from "@/store/lib/outfitTryAccounting";

function normalizeWebhookImage(data: Record<string, unknown>) {
  const imageCandidates = [
    data.image,
    data.base64,
    data.front_image,
    data.back_image,
  ];
  const image =
    imageCandidates.find((value): value is string => typeof value === "string" && value.length > 0) ||
    "";

  const rawView = [data.view, data.side, data.position, data.type]
    .find((value): value is string => typeof value === "string" && value.length > 0)
    ?.toLowerCase();

  const view =
    rawView === "back" || rawView === "rear"
      ? "back"
      : rawView === "front"
        ? "front"
        : typeof data.back_image === "string"
          ? "back"
          : "front";

  return { image, view };
}

export async function POST(req: NextRequest) {
  try {
    const unauthorized = requireWebhookSecret(req, { allowQuerySecret: true });
    if (unauthorized) return unauthorized;

    const body = (await req.json()) as Record<string, unknown>;
    const jobId =
      (typeof body.job_id === "string" && body.job_id) ||
      (typeof body.jobId === "string" && body.jobId) ||
      "";

    if (!jobId) {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }

    await dbConnect();

    if (typeof body.error === "string" && body.error) {
      console.error(`[outfit-webhook] Generation service error for job ${jobId}: ${body.error}`);
      const failed = await OutfitGenerationJob.findByIdAndUpdate(
        jobId,
        { status: "failed", errorMessage: "Outfit generation failed." },
        { new: true }
      );
      await refundOutfitTryForJob(jobId);
      if (failed?.user) {
        publishStoreUserEvent(String(failed.user), {
          type: "outfit:update",
          jobId,
          status: "failed",
          errorMessage: "Outfit generation failed.",
        });
      }
      return NextResponse.json({ ok: true });
    }

    const { image, view } = normalizeWebhookImage(body);
    if (!image) {
      return NextResponse.json({ error: "Missing image payload" }, { status: 400 });
    }

    const existingJob = await OutfitGenerationJob.findById(jobId).lean();
    if (!existingJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const storedImage = await persistOutfitImage(jobId, view, image);
    const nextImages = {
      front: view === "front" ? storedImage : existingJob.images?.front || "",
      back: view === "back" ? storedImage : existingJob.images?.back || "",
    };

    const nextStatus: "processing" | "completed" =
      nextImages.front ? "completed" : "processing";
    await OutfitGenerationJob.findByIdAndUpdate(jobId, {
      status: nextStatus,
      images: nextImages,
      errorMessage: "",
    });

    publishStoreUserEvent(String(existingJob.user), {
      type: "outfit:update",
      jobId,
      status: nextStatus,
      images: nextImages,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
