import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import ModelAsset from "@/admin/models/ModelAsset";
import { getSession } from "@/admin/lib/auth";
import { readModelImageAsBase64 } from "@/admin/lib/modelUploads";

async function fileToBase64(file: File) {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

function normalizeType(type: string, fashionSubtype: string) {
  if (type === "perfume") return "perfume";
  return fashionSubtype === "shoes" ? "shoes" : "clothes";
}

function extractImagesFromResponse(data: unknown) {
  if (typeof data === "string") return [data];
  if (Array.isArray(data)) return data.filter((item): item is string => typeof item === "string");
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.imagesBase64)) {
      return record.imagesBase64.filter((item): item is string => typeof item === "string");
    }
    if (typeof record.image === "string") {
      return [record.image];
    }
    if (Array.isArray(record.images)) {
      return record.images
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && typeof (item as Record<string, unknown>).base64 === "string") {
            return (item as Record<string, string>).base64;
          }
          return null;
        })
        .filter((item): item is string => Boolean(item));
    }
    if (typeof record.base64 === "string") return [record.base64];
  }
  return [];
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const baseUrl = process.env.PRODUCT_GENERATION_URL_BASE;
    if (!baseUrl) {
      return NextResponse.json({ error: "PRODUCT_GENERATION_URL_BASE is not configured." }, { status: 500 });
    }

    await dbConnect();
    const formData = await req.formData();
    const modelId = String(formData.get("modelId") || "");
    const type = String(formData.get("type") || "fashion");
    const fashionSubtype = String(formData.get("fashionSubtype") || "clothes");
    const normalizedType = normalizeType(type, fashionSubtype);
    const model =
      normalizedType === "clothes" ? await ModelAsset.findById(modelId).lean() : null;

    if (normalizedType === "clothes" && !model) {
      return NextResponse.json({ error: "Model not found." }, { status: 404 });
    }

    const front = formData.get("front");
    const back = formData.get("back");
    const left = formData.get("left");
    const right = formData.get("right");

    const requiredFiles =
      normalizedType === "shoes"
        ? { front, back, left, right }
        : { front, back };
    for (const [label, file] of Object.entries(requiredFiles)) {
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: `${label} image is required.` }, { status: 400 });
      }
    }

    const payload =
      normalizedType === "shoes"
        ? {
            product_pictures: {
              front: await fileToBase64(front as File),
              back: await fileToBase64(back as File),
              left: await fileToBase64(left as File),
              right: await fileToBase64(right as File),
            },
          }
        : {
            model_pictures: {
              front: await readModelImageAsBase64(model?.frontImage || model?.images?.[0] || ""),
              back: await readModelImageAsBase64(
                model?.backImage || model?.images?.[1] || model?.images?.[0] || ""
              ),
            },
            product_pictures: {
              front: await fileToBase64(front as File),
              back: await fileToBase64(back as File),
            },
          };

    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    const endpoint = normalizedType === "shoes" ? `${normalizedBaseUrl}/generate-shoes` : `${normalizedBaseUrl}/generate`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { error: (data as { error?: string } | null)?.error || "Generation request failed." },
        { status: 502 }
      );
    }

    const images = extractImagesFromResponse(data);
    if (images.length === 0) {
      return NextResponse.json({ error: "Generation service returned no images." }, { status: 502 });
    }

    return NextResponse.json({ imagesBase64: images });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
