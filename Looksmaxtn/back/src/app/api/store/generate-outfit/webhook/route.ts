import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import OutfitGenerationJob from "@/store/models/OutfitGenerationJob";

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
    const configuredSecret = process.env.OUTFIT_WEBHOOK_SECRET || "";
    const requestSecret =
      req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret") || "";

    if (configuredSecret && requestSecret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      await OutfitGenerationJob.findByIdAndUpdate(jobId, {
        status: "failed",
        errorMessage: "Outfit generation failed.",
      });
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

    const nextImages = {
      front: view === "front" ? image : existingJob.images?.front || "",
      back: view === "back" ? image : existingJob.images?.back || "",
    };

    await OutfitGenerationJob.findByIdAndUpdate(jobId, {
      status: nextImages.front && nextImages.back ? "completed" : "processing",
      images: nextImages,
      errorMessage: "",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
