import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import GeneratedImageAsset from "@/admin/models/GeneratedImageAsset";
import GeneratedImagePrompt from "@/admin/models/GeneratedImagePrompt";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { saveGeneratedSourceImage } from "@/admin/lib/generatedImageUploads";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";

async function fileToBase64(file: File) {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "assets")) {
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
    await logRequestStart("admin.generated-images.post", req);
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const baseUrl = process.env.ADMIN_IMAGE_GENERATION_URL_BASE;
    if (!baseUrl) {
      return NextResponse.json({ error: "ADMIN_IMAGE_GENERATION_URL_BASE is not configured." }, { status: 500 });
    }

    const webhookBaseUrl = process.env.OUTFIT_WEBHOOK_BASE_URL || "http://localhost:3004";
    const webhookUrl = `${webhookBaseUrl}/api/admin/generated-images/webhook`;

    await dbConnect();
    const auditActor = await getAuditActorFromSession(session);
    const formData = await req.formData();
    const name = String(formData.get("name") || "").trim();
    const promptId = String(formData.get("promptId") || "").trim();
    let prompt = String(formData.get("prompt") || "").trim();
    let promptTitle = String(formData.get("promptTitle") || "").trim();
    let promptDescription = String(formData.get("promptDescription") || "").trim();
    const sourceFiles = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (promptId) {
      const savedPrompt = await GeneratedImagePrompt.findById(promptId).lean();
      if (!savedPrompt) {
        return NextResponse.json({ error: "Selected prompt was not found." }, { status: 404 });
      }

      promptTitle = savedPrompt.title;
      promptDescription = savedPrompt.description;
      prompt = `${savedPrompt.title}\n\n${savedPrompt.description}`;
    }

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    if (sourceFiles.length === 0) {
      return NextResponse.json({ error: "At least one source image is required." }, { status: 400 });
    }

    // 1. Save source images and create entry in "processing" state
    const sourceImages = await Promise.all(sourceFiles.map((file) => saveGeneratedSourceImage(file)));
    
    const generatedImage = await GeneratedImageAsset.create({
      name,
      prompt,
      promptId,
      promptTitle,
      promptDescription,
      sourceImages,
      images: [],
      status: "processing",
      createdBy: auditActor,
      updatedBy: auditActor,
    });

    // 2. Prepare payload for Python
    const payload = {
      job_id: generatedImage._id,
      webhook_url: webhookUrl,
      prompt,
      images: await Promise.all(sourceFiles.map((file) => fileToBase64(file))),
    };

    // 3. Trigger Python (Asynchronous)
    const triggerResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!triggerResponse.ok) {
      generatedImage.status = "failed";
      generatedImage.errorMessage = "Failed to reach generation service.";
      await generatedImage.save();
      return NextResponse.json({ error: "Generation service unreachable." }, { status: 502 });
    }

    // 4. Return immediately to avoid 500 timeouts
    return NextResponse.json({ generatedImage }, { status: 201 });
  } catch (error) {
    logRequestError("admin.generated-images.post", req, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
