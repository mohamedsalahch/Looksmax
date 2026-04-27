import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import Store from "@/admin/models/Store";
import User from "@/admin/models/User";
import { buildUniqueStoreSlug, saveStoreLogo } from "@/lib/storeUtils";

async function getStorePayload(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const logoFile = formData.get("logo");
    const logo =
      logoFile instanceof File && logoFile.size > 0
        ? await saveStoreLogo(logoFile)
        : String(formData.get("logoUrl") || "");

    return {
      owner: String(formData.get("owner") || ""),
      name: String(formData.get("name") || ""),
      logo,
      category: String(formData.get("category") || ""),
      status: String(formData.get("status") || "pending"),
      isMainStore: String(formData.get("isMainStore") || "false") === "true",
    };
  }

  return req.json();
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const stores = await Store.find(filter)
      .populate("owner", "name email")
      .sort({ isMainStore: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ stores });
  } catch (error) {
    console.error("Get admin stores error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await getStorePayload(req);
    const owner = await User.findById(body.owner).select("_id");
    if (!owner) {
      return NextResponse.json({ error: "Store owner not found" }, { status: 400 });
    }

    const name = String(body.name || "").trim();
    const logo = String(body.logo || "").trim();
    const category = String(body.category || "").trim();
    if (!name || !logo || !category) {
      return NextResponse.json({ error: "Store name, logo, and category are required" }, { status: 400 });
    }

    const auditActor = await getAuditActorFromSession(session);
    const slug = await buildUniqueStoreSlug(name, async (candidate) =>
      Boolean(await Store.exists({ slug: candidate }))
    );

    const store = await Store.create({
      owner: owner._id,
      name,
      slug,
      logo,
      category,
      status: ["pending", "approved", "disabled"].includes(body.status) ? body.status : "pending",
      isMainStore: Boolean(body.isMainStore),
      createdBy: auditActor,
      updatedBy: auditActor,
    });

    await User.updateOne({ _id: owner._id }, { $set: { role: "store_owner" } });

    return NextResponse.json({ store }, { status: 201 });
  } catch (error) {
    console.error("Create admin store error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
