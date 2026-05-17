import { NextRequest, NextResponse } from "next/server";
import os from "os";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import Product from "@/store/models/Product";
import User from "@/store/models/User";
import OutfitGenerationJob from "@/store/models/OutfitGenerationJob";
import { loadImageAsBase64 } from "@/lib/imageSource";
import { calculateUserOutfitStudioTries } from "@/store/lib/outfitStudioUtils";

type ZonePayload = {
  status?: boolean;
  productId?: string;
  fashionSubtype?: string;
  color?: string;
  image?: string;
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

type VariantWithImages = { color?: string | null; images?: number[] };

function getColorIndices(variants: unknown, color: string) {
  if (!color || !Array.isArray(variants)) return [];
  const target = color.toLowerCase();
  for (const variant of variants as VariantWithImages[]) {
    if (variant?.color?.toLowerCase() === target) {
      return Array.isArray(variant.images) ? variant.images : [];
    }
  }
  return [];
}

function getColorIndicesByImage(
  variants: unknown,
  images: Array<{ url?: string }>,
  image: string
) {
  if (!image || !Array.isArray(variants)) return [];
  for (const variant of variants as VariantWithImages[]) {
    const indices = variant?.images;
    if (!Array.isArray(indices) || indices.length === 0) continue;
    if (indices.some((index) => images[index]?.url === image)) {
      return indices;
    }
  }
  return [];
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
    const userId = new mongoose.Types.ObjectId(session.userId);
    const requestingUser = await User.findById(userId).lean();

    if (!requestingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check outfit studio tries - admins have unlimited
    if (requestingUser.role !== "admin") {
      const initialTries = requestingUser.outfitStudioStats?.initialTries || 5;
      const triesUsed = requestingUser.outfitStudioStats?.triesUsed || 0;
      const { total: totalAvailableTries } = await calculateUserOutfitStudioTries(userId, initialTries);

      if (triesUsed >= totalAvailableTries) {
        return NextResponse.json(
          { error: "No outfit studio tries remaining. Spend 100 TND to earn 5 more tries." },
          { status: 403 }
        );
      }
    }

    const bestProfileImage = requestingUser.bodyProfile?.profileImageEnhanced
      || requestingUser.bodyProfile?.profileImage
      || body.profileImage
      || "";
    const fallbackProfileImage = requestingUser.bodyProfile?.profileImage
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
          .select("_id originPictures fashionSubtype images variants")
          .lean()
      : [];
    const productMap = new Map(
      selectedProducts.map((product) => [product._id.toString(), product])
    );
    const zoneEntries = await Promise.all(
      Object.entries(bodyZones).map(async ([zone, value]) => {
        const status = Boolean(value?.status);
        const product = value?.productId ? productMap.get(value.productId) : null;
        const fashionSubtype = product?.fashionSubtype || value?.fashionSubtype || "";
        const isShoes = fashionSubtype === "shoes";
        const usesFourViews = zone === "footwear" && isShoes;
        const savedImages = Array.isArray(product?.images) ? product.images : [];
        const viewCount = usesFourViews ? 4 : 2;
        const selectedColor = String(value?.color || "").trim();
        const selectedImage = String(value?.image || "").trim();
        const colorIndices = (() => {
          const byColor = getColorIndices(product?.variants, selectedColor);
          if (byColor.length > 0) return byColor;
          return getColorIndicesByImage(product?.variants, savedImages, selectedImage);
        })();
        const selectedIndices = colorIndices.length > 0 ? colorIndices : savedImages.map((_, index) => index);
        const enhancedViews = selectedIndices.length > 0
          ? selectedIndices.slice(Math.max(selectedIndices.length - viewCount, 0)).map((index) => savedImages[index]).filter(Boolean)
          : [];
        const enhancedFront = enhancedViews[0]?.url || "";
        const enhancedBack = enhancedViews[1]?.url || "";
        const enhancedLeft = usesFourViews ? enhancedViews[2]?.url || "" : "";
        const enhancedRight = usesFourViews ? enhancedViews[3]?.url || "" : "";
        const fallbackImage =
          (savedImages.find((image) => Boolean(image?.isMain)) || savedImages[0] || null)?.url || "";
        const frontImage =
          enhancedFront ||
          value?.originPictures?.front ||
          value?.originPictures?.left ||
          fallbackImage;
        const backImage =
          enhancedBack ||
          value?.originPictures?.back ||
          value?.originPictures?.right ||
          fallbackImage;
        const leftImage = usesFourViews ? (enhancedLeft || value?.originPictures?.left || fallbackImage) : "";
        const rightImage = usesFourViews ? (enhancedRight || value?.originPictures?.right || fallbackImage) : "";

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

    // Increment tries used for non-admin users
    if (requestingUser.role !== "admin") {
      const initialTries = requestingUser.outfitStudioStats?.initialTries || 5;
      const triesUsed = requestingUser.outfitStudioStats?.triesUsed || 0;
      const { total: totalAvailableTries } = await calculateUserOutfitStudioTries(userId, initialTries);

      if (triesUsed >= totalAvailableTries) {
        return NextResponse.json(
          { error: "No outfit studio tries remaining. Spend 100 TND to earn 5 more tries." },
          { status: 403 }
        );
      }

      await User.updateOne(
        { _id: userId },
        { $inc: { "outfitStudioStats.triesUsed": 1 } }
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
