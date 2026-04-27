import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import Store from "@/admin/models/Store";
import { saveStoreLogo } from "@/lib/storeUtils";

async function getPatchPayload(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const logoFile = formData.get("logo");
    return {
      name: formData.get("name"),
      category: formData.get("category"),
      status: formData.get("status"),
      logo:
        logoFile instanceof File && logoFile.size > 0
          ? await saveStoreLogo(logoFile)
          : formData.get("logoUrl"),
    };
  }

  return req.json();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const store = await Store.findById(id).populate("owner", "name email").lean();
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    return NextResponse.json({ store });
  } catch (error) {
    console.error("Get admin store error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const body = await getPatchPayload(req);
    const update: Record<string, unknown> = {};

    for (const field of ["name", "category", "logo"] as const) {
      if (typeof body[field] === "string" && body[field].trim()) {
        update[field] = body[field].trim();
      }
    }
    if (["pending", "approved", "disabled"].includes(body.status)) {
      update.status = body.status;
    }
    update.updatedBy = await getAuditActorFromSession(session);

    const store = await Store.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    return NextResponse.json({ store });
  } catch (error) {
    console.error("Update admin store error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
