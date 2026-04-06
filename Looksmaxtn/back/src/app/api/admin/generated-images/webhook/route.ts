import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import GeneratedImageAsset from "@/admin/models/GeneratedImageAsset";
import {
  saveGeneratedResultBase64,
} from "@/admin/lib/generatedImageUploads";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, any>;
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
      asset.status = "failed";
      await asset.save();
      return NextResponse.json({ ok: true });
    }

    const imageBase64 = body.image || body.base64;
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
    } else if (body.images && Array.isArray(body.images)) {
      // Direct array response
      const savedImages = await Promise.all(
        body.images.map((img: any, i: number) => {
           const b64 = typeof img === "string" ? img : img.base64;
           return saveGeneratedResultBase64(b64, i);
        })
      );
      asset.images = savedImages;
      asset.status = "completed";
    }

    await asset.save();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
