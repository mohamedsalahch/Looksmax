import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import GeneratedImageAsset from "@/admin/models/GeneratedImageAsset";
import { getSession } from "@/admin/lib/auth";
import {
  saveGeneratedResultBase64,
  saveGeneratedSourceImage,
} from "@/admin/lib/generatedImageUploads";

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
          if (
            item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).base64 === "string"
          ) {
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

async function fileToBase64(file: File) {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const generatedImages = await GeneratedImageAsset.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ generatedImages });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const baseUrl = process.env.ADMIN_IMAGE_GENERATION_URL_BASE || "http://192.168.1.101:8000";

    await dbConnect();
    const formData = await req.formData();
    const prompt = String(formData.get("prompt") || "").trim();
    const sourceFiles = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    if (sourceFiles.length === 0) {
      return NextResponse.json({ error: "At least one source image is required." }, { status: 400 });
    }

    const sourceImages = await Promise.all(sourceFiles.map((file) => saveGeneratedSourceImage(file)));
    const payload = {
      prompt,
      images: await Promise.all(sourceFiles.map((file) => fileToBase64(file))),
    };

    const response = await fetch(`${baseUrl}/proxy`, {
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

    const imagesBase64 = extractImagesFromResponse(data);
    if (imagesBase64.length === 0) {
      return NextResponse.json({ error: "Generation service returned no images." }, { status: 502 });
    }

    const images = await Promise.all(
      imagesBase64.map((image, index) => saveGeneratedResultBase64(image, index))
    );

    const generatedImage = await GeneratedImageAsset.create({
      prompt,
      sourceImages,
      images,
    });

    return NextResponse.json({ generatedImage }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
