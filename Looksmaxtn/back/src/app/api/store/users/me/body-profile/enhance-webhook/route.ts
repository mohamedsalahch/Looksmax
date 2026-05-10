import { NextRequest, NextResponse } from "next/server";
import {
  clearFailedBodyProfileImage,
  saveEnhancedBodyProfileImage,
} from "@/store/lib/bodyProfileEnhancement";
import { deleteBodyProfileImage } from "@/store/lib/bodyProfileUploads";
import { requireWebhookSecret } from "@/lib/webhookAuth";
import { publishStoreUserEvent } from "@/store/lib/storeUserEvents";

export async function POST(req: NextRequest) {
  try {
    const unauthorized = requireWebhookSecret(req, { allowQuerySecret: true });
    if (unauthorized) return unauthorized;

    const body = (await req.json()) as Record<string, unknown>;
    const userId = req.nextUrl.searchParams.get("userId") || "";
    const imagePath = req.nextUrl.searchParams.get("imagePath") || "";

    // Handle error from generation service
    if (typeof body.error === "string" && body.error) {
      if (userId) {
        await clearFailedBodyProfileImage(userId, "Photo enhancement failed. Please upload another photo.");
        if (imagePath) {
          await deleteBodyProfileImage(imagePath);
        }
        console.warn(`[enhance-webhook] Generation service reported error for user ${userId}: ${body.error}`);
        publishStoreUserEvent(userId, {
          type: "body-profile:update",
          status: "failed",
          errorMessage: "Photo enhancement failed. Please upload another photo.",
        });
      }
      return NextResponse.json({ ok: true, error: true });
    }

    const image = typeof body.image === "string" ? body.image : "";

    if (!image) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    if (!userId || !imagePath) {
      return NextResponse.json({ error: "Missing userId or imagePath" }, { status: 400 });
    }

    const enhancedImagePath = await saveEnhancedBodyProfileImage(userId, imagePath, image);
    if (!enhancedImagePath) {
      return NextResponse.json({ ok: true, stale: true });
    }

    publishStoreUserEvent(userId, {
      type: "body-profile:update",
      status: "completed",
      enhancedImagePath,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[enhance-webhook] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
