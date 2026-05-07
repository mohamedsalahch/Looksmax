import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import ProductMediaEnhancementJob from "@/admin/models/ProductMediaEnhancementJob";
import User from "@/admin/models/User";
import {
  saveProductMediaSourceImage,
} from "@/admin/lib/productMediaUploads";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";
import { canAccessAdminResource, getSession } from "@/admin/lib/auth";

const PRODUCT_MEDIA_ENHANCEMENT_PROMPT = `You are a professional e-commerce product retouching assistant.

Task:

* Transform the provided product image into a clean, mannequin-free product image suitable for a professional catalog.

Main Actions:

* Remove the mannequin completely
* Keep only the garment visible
* Reconstruct missing parts naturally if needed

View & Layout:

* The final image must be a top-down view (flat lay)
* The garment must be laid flat on a surface
* Ensure a natural and symmetrical flat presentation
* Keep proportions accurate and realistic

Fabric Preparation:

* Ironing clothes removes wrinkles — remove all wrinkles and creases
* Make the garment look freshly ironed or professionally steamed
* Keep natural fabric texture (do NOT over-smooth or make it look artificial)

Strict Preservation Rules:

* Preserve the product EXACTLY:

  * shape and proportions
  * color
  * fabric and texture
  * stitching and details
  * logos and branding
* Do NOT redesign or alter the garment

Background:

* Use a clean solid background with color #EAE9E7
* Flat surface, smooth and uniform
* No gradients, no texture, no distractions

Lighting:

* Soft, even studio lighting
* Minimal shadows
* Clean, catalog-style illumination

Constraints:

* No mannequin
* No human model
* No props
* No text or graphics
* No added elements

Output:

* High-resolution image
* Clean, ironed, flat-lay garment
* Professional e-commerce ready (Instagram & catalog quality)

- Background color must remain exactly #EAE9E7 with no variation`;

const ACCESSORY_MEDIA_ENHANCEMENT_PROMPT = `You are a professional e-commerce product retouching assistant.

Task:

* Enhance the provided product image for a premium catalog result
* Preserve the item exactly as photographed while improving the presentation

Strict Preservation Rules:

* Keep the product details exactly the same
* Preserve shape, proportions, color, material, texture, stitching, logos, hardware, and branding
* Do NOT redesign, reshape, restyle, or replace any part of the item

Enhancement Goals:

* Clean up the image professionally
* Improve clarity, sharpness, and lighting balance
* Keep natural texture and fine details
* Remove distractions only if they are part of the background
* Do NOT over-smooth or make the product look artificial

Background:

* Replace the background with a clean solid color #EAE9E7
* Keep the background flat, smooth, and uniform
* No gradients, no texture, no props, no text

Composition:

* Keep the full product visible
* Center the item cleanly
* Maintain a natural catalog composition

Output:

* High-resolution image
* Product-only catalog result
* Background color must remain exactly #EAE9E7 with no variation`;

const ALL_VIEWS = ["front", "back", "left", "right"] as const;
type EnhancementView = typeof ALL_VIEWS[number];

async function fileToBase64(file: File) {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

async function compareFrontBackImages(baseUrl: string, frontBase64: string, backBase64: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const compareUrl = normalizedBaseUrl.endsWith("/api")
    ? `${normalizedBaseUrl}/compare-front-back`
    : `${normalizedBaseUrl}/api/compare-front-back`;

    const response = await fetch(compareUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        front: frontBase64,
        back: backBase64,
        front_label: "front",
        back_label: "back",
      }),
    });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

function getWebhookBaseUrl(req: NextRequest) {
  const configured = process.env.OUTFIT_WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return req.nextUrl.origin.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  try {
    await logRequestStart("admin.products.enhance.post", req);

    const session = await getSession();
    if (!session || !canAccessAdminResource(session.role, "products")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const baseUrl = process.env.ADMIN_IMAGE_GENERATION_URL_BASE;
    if (!baseUrl) {
      return NextResponse.json({ error: "ADMIN_IMAGE_GENERATION_URL_BASE is not configured." }, { status: 500 });
    }

    await dbConnect();

    // Check and consume a try for store_owners
    if (session.role === "store_owner") {
      const requestingUser = await User.findById(new mongoose.Types.ObjectId(session.userId))
        .select("storeOwnerStats")
        .lean();
      const triesAllowed = requestingUser?.storeOwnerStats?.triesAllowed ?? 50;
      const triesUsed = requestingUser?.storeOwnerStats?.triesUsed ?? 0;
      if (triesUsed >= triesAllowed) {
        return NextResponse.json({ error: "Enhancement try limit reached. Contact admin for more tries." }, { status: 403 });
      }
      await User.updateOne(
        { _id: new mongoose.Types.ObjectId(session.userId) },
        { $inc: { "storeOwnerStats.triesUsed": 1 } }
      );
    }

    const formData = await req.formData();
    const mode = String(formData.get("mode") || "garment");
    const filesByView = Object.fromEntries(
      ALL_VIEWS.map((view) => [view, formData.get(view)])
    ) as Record<EnhancementView, FormDataEntryValue | null>;
    const uploadedViews = ALL_VIEWS.filter(
      (view) => filesByView[view] instanceof File && (filesByView[view] as File).size > 0
    );

    if (mode === "accessory") {
      if (uploadedViews.length === 0) {
        return NextResponse.json({ error: "At least one image is required." }, { status: 400 });
      }

      const sourceImages = {
        front: "",
        back: "",
        left: "",
        right: "",
      };
      const base64ByView = await Promise.all(
        uploadedViews.map(async (view) => {
          const file = filesByView[view] as File;
          sourceImages[view] = await saveProductMediaSourceImage(file, view);
          return [view, await fileToBase64(file)] as const;
        })
      );

      const job = await ProductMediaEnhancementJob.create({
        status: "processing",
        sourceImages,
        images: {
          front: "",
          back: "",
          left: "",
          right: "",
        },
      });

      const webhookBaseUrl = getWebhookBaseUrl(req);
      const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
      const triggers = base64ByView.map(([view, imageBase64]) =>
        fetch(`${normalizedBaseUrl}/api/proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: job._id.toString(),
            webhook_url: `${webhookBaseUrl}/api/admin/products/enhance/webhook?view=${view}`,
            prompt: ACCESSORY_MEDIA_ENHANCEMENT_PROMPT,
            images: [imageBase64],
          }),
        })
      );

      const responses = await Promise.all(triggers);
      if (responses.some((response) => !response.ok)) {
        job.status = "failed";
        job.errorMessage = "Failed to reach generation service.";
        await job.save();
        return NextResponse.json({ error: "Generation service unreachable.", job_id: job._id }, { status: 502 });
      }

      return NextResponse.json({
        job_id: job._id,
        status: "processing",
        sourceImages: job.sourceImages,
        images: job.images,
      });
    }

    const frontFile = filesByView.front;
    const backFile = filesByView.back;

    if (!(frontFile instanceof File) || frontFile.size === 0) {
      return NextResponse.json({ error: "Front image is required." }, { status: 400 });
    }

    if (!(backFile instanceof File) || backFile.size === 0) {
      return NextResponse.json({ error: "Back image is required." }, { status: 400 });
    }

    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    const [frontBase64, backBase64] = await Promise.all([
      fileToBase64(frontFile),
      fileToBase64(backFile),
    ]);

    let compare: Awaited<ReturnType<typeof compareFrontBackImages>>;
    try {
      compare = await compareFrontBackImages(normalizedBaseUrl, frontBase64, backBase64);
    } catch (fetchErr: unknown) {
      const cause = fetchErr instanceof Error ? (fetchErr.cause ?? fetchErr) : fetchErr;
      console.error("[enhance] fetch to generator failed:", cause);
      logRequestError("admin.products.enhance.post", req, fetchErr);
      return NextResponse.json(
        { error: `Generation service unreachable at ${normalizedBaseUrl}. Make sure the generator API is running.` },
        { status: 503 }
      );
    }
    if (!compare.ok) {
      const reason = compare.data?.detail || compare.data?.error || "Unable to compare product images.";
      return NextResponse.json({ error: reason }, { status: compare.data?.status ? Number(compare.data.status) : 400 });
    }

    if (!compare.data?.valid) {
      return NextResponse.json(
        { error: compare.data?.reason || "Front and back images must be different." },
        { status: 400 }
      );
    }

    const sourceImages = {
      front: await saveProductMediaSourceImage(frontFile, "front"),
      back: await saveProductMediaSourceImage(backFile, "back"),
    };

    const job = await ProductMediaEnhancementJob.create({
      status: "processing",
      sourceImages,
      images: {
        front: "",
        back: "",
      },
    });

    const webhookBaseUrl = getWebhookBaseUrl(req);

    const frontTrigger = fetch(`${normalizedBaseUrl}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: job._id.toString(),
        webhook_url: `${webhookBaseUrl}/api/admin/products/enhance/webhook?view=front`,
        prompt: PRODUCT_MEDIA_ENHANCEMENT_PROMPT,
        images: [frontBase64],
      }),
    });

    const backTrigger = fetch(`${normalizedBaseUrl}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: job._id.toString(),
        webhook_url: `${webhookBaseUrl}/api/admin/products/enhance/webhook?view=back`,
        prompt: PRODUCT_MEDIA_ENHANCEMENT_PROMPT,
        images: [backBase64],
      }),
    });

    const [frontResponse, backResponse] = await Promise.all([frontTrigger, backTrigger]);

    if (!frontResponse.ok || !backResponse.ok) {
      job.status = "failed";
      job.errorMessage = "Failed to reach generation service.";
      await job.save();
      return NextResponse.json({ error: "Generation service unreachable.", job_id: job._id }, { status: 502 });
    }

    return NextResponse.json({
      job_id: job._id,
      status: "processing",
      sourceImages: job.sourceImages,
      images: job.images,
    });
  } catch (error) {
    logRequestError("admin.products.enhance.post", req, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get("job_id");
    if (!jobId) {
      return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
    }

    await dbConnect();
    const job = await ProductMediaEnhancementJob.findById(jobId).lean();
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      job_id: job._id,
      status: job.status,
      sourceImages: job.sourceImages,
      images: job.images,
      error: job.errorMessage || "",
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
