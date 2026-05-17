import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import GeneratedImageAsset from "@/admin/models/GeneratedImageAsset";
import {
  saveGeneratedResultBase64,
} from "@/admin/lib/generatedImageUploads";
import { requireWebhookSecret } from "@/lib/webhookAuth";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";

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
    const asset = await GeneratedImageAsset.findById(jobId);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (body.error) {
      console.error(`[generated-images-webhook] Generation service error for job ${jobId}: ${body.error}`);
      asset.status = "failed";
      asset.errorMessage = "Generation failed.";
      await asset.save();
      broadcastAdminEvent({
        type: "generated-image:update",
        asset: {
          _id: String(asset._id),
          status: "failed",
          images: [...asset.images],
          errorMessage: asset.errorMessage,
        },
      });
      return NextResponse.json({ ok: true });
    }

    const imageBase64 =
      typeof body.image === "string"
        ? body.image
        : typeof body.base64 === "string"
          ? body.base64
          : "";
    const view = body.view; // "front", "back", "left", "right" or "result"

    if (imageBase64) {
      const savedPath = await saveGeneratedResultBase64(imageBase64, asset.images.length);
      asset.images.push(savedPath);

      // Determine if job is finished
      // 1. One image case (proxy)
      if (view === "result") {
        asset.status = "completed";
      }
      // 2. Simple heuristic: clothes expect 2, shoes expect 4
      else if (view === "back" && asset.images.length >= 2) {
         asset.status = "completed";
      } else if (view === "right" && asset.images.length >= 4) {
         asset.status = "completed";
      }
    } else if (Array.isArray(body.images)) {
      // Direct array response
      const savedImages = await Promise.all(
        body.images.map((img: unknown, i: number) => {
           const b64 = typeof img === "string" ? img : typeof img === "object" && img !== null && "base64" in img ? String(img.base64 || "") : "";
           return saveGeneratedResultBase64(b64, i);
        })
      );
      asset.images = savedImages;
      asset.status = "completed";
    }

    await asset.save();

    broadcastAdminEvent({
      type: "generated-image:update",
      asset: {
        _id: String(asset._id),
        status: asset.status as "processing" | "completed" | "failed",
        images: [...asset.images],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
