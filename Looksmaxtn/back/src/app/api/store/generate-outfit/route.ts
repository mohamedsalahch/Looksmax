import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import os from "os";
import path from "path";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import OutfitGenerationJob from "@/store/models/OutfitGenerationJob";

type ZonePayload = {
  status?: boolean;
  fashionSubtype?: string;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
};

function extractImagesFromResponse(data: unknown) {
  if (typeof data === "string") return [data];
  if (Array.isArray(data)) return data.filter((item): item is string => typeof item === "string");
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.front_image === "string" || typeof record.back_image === "string") {
      return [
        typeof record.front_image === "string" ? record.front_image : "",
        typeof record.back_image === "string" ? record.back_image : "",
      ].filter((item): item is string => item.length > 0);
    }
    if (typeof record.image === "string") return [record.image];
    if (typeof record.imageFront === "string" || typeof record.imageBack === "string") {
      return [
        typeof record.imageFront === "string" ? record.imageFront : "",
        typeof record.imageBack === "string" ? record.imageBack : "",
      ].filter((item): item is string => item.length > 0);
    }
    if (typeof record.base64 === "string") return [record.base64];
    if (Array.isArray(record.imagesBase64)) {
      return record.imagesBase64.filter((item): item is string => typeof item === "string");
    }
    if (Array.isArray(record.images)) {
      return record.images.filter((item): item is string => typeof item === "string");
    }
  }
  return [];
}

async function publicPathToBase64(imagePath: string) {
  if (!imagePath) return "";
  if (imagePath.startsWith("data:")) return imagePath.split(",")[1] || "";

  let fullPath = "";
  if (imagePath.startsWith("/uploads/body-profiles/")) {
    fullPath = path.join(process.cwd(), "..", "front", "public", imagePath.replace(/^\//, ""));
  } else if (imagePath.startsWith("/uploads/products/")) {
    fullPath = path.join(process.cwd(), "..", "admin", "public", imagePath.replace(/^\//, ""));
  } else {
    return "";
  }

  try {
    const buffer = await readFile(fullPath);
    return buffer.toString("base64");
  } catch {
    return "";
  }
}

function getPreferredIpv4Host() {
  if (process.env.OUTFIT_WEBHOOK_BASE_URL) {
    return process.env.OUTFIT_WEBHOOK_BASE_URL.replace(/\/$/, "");
  }

  if (process.env.BACKEND_BASE_URL) {
    return process.env.BACKEND_BASE_URL.replace(/\/$/, "");
  }

  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return `http://${address.address}:3004`;
      }
    }
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      profileImage?: string;
      heightCm?: string;
      weightKg?: string;
      usualSize?: string;
      bodyZones?: Record<string, ZonePayload | null>;
    };

    const bodyZones = body.bodyZones || {};
    const zoneEntries = await Promise.all(
      Object.entries(bodyZones).map(async ([zone, value]) => {
        const status = Boolean(value?.status);
        const originPictures = value?.originPictures || {};
        const isShoes = value?.fashionSubtype === "shoes";
        const usesFourViews = zone === "footwear" && isShoes;

        if (!status) {
          console.log("[generate_outfit] inactive body zone", { zone, status: false });
        }

        return [
          zone,
          {
            status,
            front:
              status && originPictures.front ? await publicPathToBase64(originPictures.front) : "",
            back:
              status && originPictures.back ? await publicPathToBase64(originPictures.back) : "",
            left:
              status && usesFourViews && originPictures.left
                ? await publicPathToBase64(originPictures.left)
                : "",
            right:
              status && usesFourViews && originPictures.right
                ? await publicPathToBase64(originPictures.right)
                : "",
          },
        ];
      })
    );

    const payload = {
      profile_picture: await publicPathToBase64(body.profileImage || ""),
      height: body.heightCm || "",
      weight: body.weightKg || "",
      size: body.usualSize || "",
      body_zones: Object.fromEntries(zoneEntries),
    };

    const summarizedBodyZones = Object.fromEntries(
      Object.entries(payload.body_zones).map(([zone, value]) => {
        const zoneValue = value as {
          status: boolean;
          front: string;
          back: string;
          left: string;
          right: string;
        };

        return [
          zone,
          {
            status: zoneValue.status,
            hasFront: zoneValue.front.length > 0,
            hasBack: zoneValue.back.length > 0,
            hasLeft: zoneValue.left.length > 0,
            hasRight: zoneValue.right.length > 0,
          },
        ];
      })
    );

    const requestPayloadSummary = {
      height: payload.height,
      weight: payload.weight,
      size: payload.size,
      hasProfilePicture: payload.profile_picture.length > 0,
      body_zones: summarizedBodyZones,
    };

    await dbConnect();
    const job = new OutfitGenerationJob({
      user: new mongoose.Types.ObjectId(session.userId),
      status: "processing",
      images: { front: "", back: "" },
      requestPayload: requestPayloadSummary,
    });
    await job.save();

    const baseUrl = (process.env.PRODUCT_GENERATION_URL_BASE || "").replace(/\/?$/, "/");
    if (!baseUrl) {
      return NextResponse.json({ error: "PRODUCT_GENERATION_URL_BASE is not configured." }, { status: 500 });
    }
    const preferredWebhookBase = getPreferredIpv4Host();
    const webhookBase = preferredWebhookBase || req.nextUrl.origin;
    const webhookUrl = `${webhookBase}/api/store/generate-outfit/webhook`;
    const generatorUrl = `${baseUrl}generate_outfit`;

    console.log("[generate_outfit] sending request", {
      generatorUrl,
      webhookUrl,
      jobId: job._id.toString(),
    });

    const generatorResponse = await fetch(generatorUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        job_id: job._id.toString(),
        webhook_url: webhookUrl,
      }),
    });

    const generatorData = await generatorResponse.json().catch(() => null);

    console.log("[generate_outfit] generator response", {
      ok: generatorResponse.ok,
      status: generatorResponse.status,
      jobId: job._id.toString(),
      hasData: Boolean(generatorData),
    });

    if (!generatorResponse.ok) {
      console.error("[generate_outfit] generator request failed", {
        status: generatorResponse.status,
        data: generatorData,
        jobId: job._id.toString(),
      });
      await OutfitGenerationJob.findByIdAndUpdate(job._id, {
        status: "failed",
        errorMessage:
          (generatorData as { error?: string } | null)?.error || "Outfit generation failed.",
      });

      return NextResponse.json(
        {
          error:
            (generatorData as { error?: string } | null)?.error ||
            "Unable to reach outfit generator.",
        },
        { status: 502 }
      );
    }

    const images = extractImagesFromResponse(generatorData);
    if (images.length > 0) {
      await OutfitGenerationJob.findByIdAndUpdate(job._id, {
        status: images.length >= 2 ? "completed" : "processing",
        images: {
          front: images[0] || "",
          back: images[1] || "",
        },
      });
    }

    return NextResponse.json({
      jobId: job._id.toString(),
      status: "processing",
    });
  } catch (error) {
    console.error("[generate_outfit] route error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
