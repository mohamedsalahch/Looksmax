import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { saveEnhancedBodyProfileImage } from "@/store/lib/bodyProfileEnhancement";

export async function POST(req: NextRequest) {
  try {
    const configuredSecret = process.env.OUTFIT_WEBHOOK_SECRET || "";
    const requestSecret =
      req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret") || "";

    if (configuredSecret && requestSecret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const userId = req.nextUrl.searchParams.get("userId") || "";
    const imagePath = req.nextUrl.searchParams.get("imagePath") || "";

    // Handle error from generation service
    if (typeof body.error === "string" && body.error) {
      if (userId) {
        await dbConnect();
        await User.collection.updateOne(
          { _id: new mongoose.Types.ObjectId(userId) },
          { $set: { "bodyProfile.imageEnhancing": false } }
        );
        console.warn(`[enhance-webhook] Generation service reported error for user ${userId}: ${body.error}`);
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

    console.log(`[enhance-webhook] Saved enhanced photo for user ${userId} → ${enhancedImagePath}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[enhance-webhook] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
