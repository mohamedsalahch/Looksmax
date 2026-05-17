import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import TrainingSample, { TrainingFlow } from "@/store/models/TrainingSample";
import { getR2Client, getR2TrainingBucket } from "@/lib/r2";
import { getRequiredSecret } from "@/lib/env";

const ALLOWED_FLOWS: TrainingFlow[] = [
  "outfit",
  "garment_enhance",
  "accessory_enhance",
  "model_generation",
  "photo_validation",
  "compare_front_back",
];

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function checkAuth(req: NextRequest) {
  let token: string;
  try {
    token = getRequiredSecret("INTERNAL_DATASET_TOKEN");
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_DATASET_TOKEN not configured" },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-internal-token") || "";
  if (!provided || !safeEqual(provided, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

interface ImagePayload {
  base64?: string;
  mime?: string;
}

function extFromMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

async function uploadImage(
  bucket: string,
  keyPrefix: string,
  role: string,
  payload: ImagePayload
): Promise<string | null> {
  if (!payload?.base64) return null;
  const mime = payload.mime || "image/png";
  const ext = extFromMime(mime);
  const key = `${keyPrefix}/${role}.${ext}`;
  const body = Buffer.from(payload.base64, "base64");
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: mime,
    })
  );
  return key;
}

export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const flow = String(body.flow || "") as TrainingFlow;
  if (!ALLOWED_FLOWS.includes(flow)) {
    return NextResponse.json({ error: `Invalid flow: ${flow}` }, { status: 400 });
  }

  const modelName = String(body.model || "").trim();
  const promptVersion = String(body.prompt_version || "").trim();
  const promptText = String(body.prompt_text || "");
  if (!modelName || !promptVersion) {
    return NextResponse.json(
      { error: "model and prompt_version are required" },
      { status: 400 }
    );
  }

  const inputs = (body.inputs as Record<string, ImagePayload>) || {};
  const outputs = (body.outputs as Record<string, ImagePayload>) || {};

  const sampleId = randomUUID();
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const keyPrefix = `${flow}/${yyyy}/${mm}/${dd}/${sampleId}`;

  let bucket: string;
  try {
    bucket = getR2TrainingBucket();
  } catch (err) {
    console.error("[internal-dataset] R2 training bucket not configured:", err);
    return NextResponse.json(
      { error: "Training bucket not configured" },
      { status: 503 }
    );
  }

  const inputKeys: Record<string, string> = {};
  const outputKeys: Record<string, string> = {};

  try {
    for (const [role, payload] of Object.entries(inputs)) {
      const key = await uploadImage(bucket, `${keyPrefix}/inputs`, role, payload);
      if (key) inputKeys[role] = key;
    }
    for (const [role, payload] of Object.entries(outputs)) {
      const key = await uploadImage(bucket, `${keyPrefix}/outputs`, role, payload);
      if (key) outputKeys[role] = key;
    }
  } catch (err) {
    console.error("[internal-dataset] R2 upload failed:", err);
    return NextResponse.json({ error: "R2 upload failed" }, { status: 502 });
  }

  try {
    await dbConnect();
    const userIdRaw = body.user_id ? String(body.user_id) : "";
    const userObjectId =
      userIdRaw && mongoose.Types.ObjectId.isValid(userIdRaw)
        ? new mongoose.Types.ObjectId(userIdRaw)
        : undefined;
    const doc = await TrainingSample.create({
      flow,
      jobId: body.job_id ? String(body.job_id) : "",
      user: userObjectId,
      modelName,
      promptVersion,
      promptText,
      modelParams: (body.model_params as Record<string, unknown>) || null,
      inputs: inputKeys,
      outputs: outputKeys,
      extra: (body.extra as Record<string, unknown>) || null,
      latencyMs: typeof body.latency_ms === "number" ? body.latency_ms : 0,
    });
    return NextResponse.json({ ok: true, sample_id: String(doc._id) });
  } catch (err) {
    console.error("[internal-dataset] Mongo insert failed:", err);
    return NextResponse.json({ error: "Mongo insert failed" }, { status: 500 });
  }
}
