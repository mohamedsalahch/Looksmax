import { NextRequest, NextResponse } from "next/server";
import os from "os";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import Product from "@/store/models/Product";
import User from "@/store/models/User";
import OutfitGenerationJob from "@/store/models/OutfitGenerationJob";
import { loadImageAsBase64 } from "@/lib/imageSource";

type ZonePayload = {
  status?: boolean;
  productId?: string;
  fashionSubtype?: string;
  size?: string;
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

function normalizeProductId(value: string) {
  return value.split("__")[0] || value;
}

function hasAnyImage(value: { front: string; back: string; left: string; right: string }) {
  return Boolean(value.front || value.back || value.left || value.right);
}

async function publicPathToBase64(imagePath: string) {
  if (!imagePath) return "";
  try {
    return await loadImageAsBase64(imagePath);
  } catch (err) {
    console.error("[publicPathToBase64] failed to load image:", imagePath, err);
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
  let job: InstanceType<typeof OutfitGenerationJob> | null = null;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      profileImage?: string;
      heightCm?: string;
      weightKg?: string;
      topSize?: string;
      bottomSize?: string;
      shoeSize?: string;
      bodyZones?: Record<string, ZonePayload | null>;
    };

    // Fetch the enhanced profile image if available
    await dbConnect();
    const requestingUser = await User.collection.findOne(
      { _id: new mongoose.Types.ObjectId(session.userId) },
      { projection: { bodyProfile: 1 } }
    );
    const generationLimit = 100;
    const generationCount = Number(requestingUser?.bodyProfile?.outfitGenerationCount || 0);
    if (generationCount >= generationLimit) {
      return NextResponse.json(
        { error: "Generation limit reached. Use your saved outfit results." },
        { status: 403 }
      );
    }
    const bestProfileImage = requestingUser?.bodyProfile?.profileImageEnhanced
      || requestingUser?.bodyProfile?.profileImage
      || body.profileImage
      || "";
    const fallbackProfileImage = requestingUser?.bodyProfile?.profileImage
      || body.profileImage
      || "";

    const bodyZones = body.bodyZones || {};
    const selectedProductIds = [...new Set(
      Object.values(bodyZones)
        .map((value) => value?.productId)
        .filter((productId): productId is string => typeof productId === "string" && productId.length > 0)
    )].map((productId) => normalizeProductId(productId));
    const selectedProducts = selectedProductIds.length > 0
      ? await Product.find({ _id: { $in: selectedProductIds } })
          .select("_id originPictures fashionSubtype images")
          .lean()
      : [];
    const productMap = new Map(
      selectedProducts.map((product) => [product._id.toString(), product])
    );
    const zoneEntries = await Promise.all(
      Object.entries(bodyZones).map(async ([zone, value]) => {
        const status = Boolean(value?.status);
        const product = value?.productId ? productMap.get(value.productId) : null;
        const fallbackImage =
          Array.isArray(product?.images) && product.images.length > 0
            ? (product.images.find((image) => Boolean(image?.isMain)) || product.images[0] || null)?.url || ""
            : "";
        const originPictures = {
          front:
            product?.originPictures?.front ||
            value?.originPictures?.front ||
            product?.originPictures?.left ||
            value?.originPictures?.left ||
            fallbackImage,
          back:
            product?.originPictures?.back ||
            value?.originPictures?.back ||
            product?.originPictures?.right ||
            value?.originPictures?.right ||
            fallbackImage,
          left: product?.originPictures?.left || value?.originPictures?.left || fallbackImage,
          right: product?.originPictures?.right || value?.originPictures?.right || fallbackImage,
        };
        const fashionSubtype = product?.fashionSubtype || value?.fashionSubtype || "";
        const isShoes = fashionSubtype === "shoes";
        const usesFourViews = zone === "footwear" && isShoes;
        const frontImage = originPictures.front;
        const backImage = originPictures.back;
        const leftImage = usesFourViews ? originPictures.left : "";
        const rightImage = usesFourViews ? originPictures.right : "";

        return [
          zone,
          {
            status,
            size: value?.size || "",
            front: status && frontImage ? await publicPathToBase64(frontImage) : "",
            back: status && backImage ? await publicPathToBase64(backImage) : "",
            left: status && leftImage ? await publicPathToBase64(leftImage) : "",
            right: status && rightImage ? await publicPathToBase64(rightImage) : "",
          },
        ];
      })
    );

    let profilePictureBase64 = await publicPathToBase64(bestProfileImage);
    if (!profilePictureBase64 && fallbackProfileImage && fallbackProfileImage !== bestProfileImage) {
      console.warn("[generate_outfit] enhanced image missing, falling back to original:", fallbackProfileImage);
      profilePictureBase64 = await publicPathToBase64(fallbackProfileImage);
    }

    const payload = {
      profile_picture: profilePictureBase64,
      height: body.heightCm || "",
      weight: body.weightKg || "",
      top_size: body.topSize || "",
      bottom_size: body.bottomSize || "",
      shoe_size: body.shoeSize || "",
      body_zones: Object.fromEntries(zoneEntries),
    };

    if (!payload.profile_picture) {
      console.error("[generate_outfit] profile picture is empty — bestProfileImage:", bestProfileImage || "(empty)", "fallback:", fallbackProfileImage || "(empty)", "clientSent:", body.profileImage || "(empty)");
      return NextResponse.json(
        { error: "Profile picture could not be loaded. Please re-upload your body profile image." },
        { status: 400 }
      );
    }

    const activeZonesWithNoImages = Object.entries(payload.body_zones)
      .filter(([, value]) => {
        const z = value as { status: boolean; front: string; back: string; left: string; right: string };
        return z.status && !hasAnyImage(z);
      })
      .map(([zone]) => zone);

    if (activeZonesWithNoImages.length > 0) {
      console.error("[generate_outfit] active zones with no images:", activeZonesWithNoImages);
      return NextResponse.json(
        { error: `Selected items have no images: ${activeZonesWithNoImages.join(", ")}` },
        { status: 400 }
      );
    }

    const generationCounterUpdate = await User.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(session.userId),
        "bodyProfile.outfitGenerationCount": { $lt: generationLimit },
      },
      {
        $inc: { "bodyProfile.outfitGenerationCount": 1 },
      }
    );

    if (generationCounterUpdate.matchedCount === 0) {
      return NextResponse.json(
        { error: "Generation limit reached. Use your saved outfit results." },
        { status: 403 }
      );
    }

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
      top_size: payload.top_size,
      bottom_size: payload.bottom_size,
      shoe_size: payload.shoe_size,
      hasProfilePicture: payload.profile_picture.length > 0,
      body_zones: summarizedBodyZones,
    };

    await dbConnect();
    job = new OutfitGenerationJob({
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
    const generatorUrl = `${baseUrl}api/generate_outfit`;

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
    if (job) {
      await OutfitGenerationJob.findByIdAndUpdate(job._id, {
        status: "failed",
        errorMessage: "Generation request failed.",
      });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
