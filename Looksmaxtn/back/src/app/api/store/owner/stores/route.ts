import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import { getAuditActorFromSession } from "@/store/lib/auditRoute";
import Store from "@/store/models/Store";
import User from "@/store/models/User";
import { buildUniqueStoreSlug, saveStoreLogo } from "@/lib/storeUtils";

async function getStorePayload(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const logoFile = formData.get("logo");
    return {
      name: String(formData.get("name") || ""),
      category: String(formData.get("category") || ""),
      logo:
        logoFile instanceof File && logoFile.size > 0
          ? await saveStoreLogo(logoFile)
          : String(formData.get("logoUrl") || ""),
    };
  }

  return req.json();
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const stores = await Store.find({ owner: session.userId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ stores });
  } catch (error) {
    console.error("Get owner stores error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const body = await getStorePayload(req);
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
      owner: session.userId,
      name,
      slug,
      logo,
      category,
      status: "pending",
      isMainStore: false,
      createdBy: auditActor,
      updatedBy: auditActor,
    });

    await User.updateOne({ _id: session.userId }, { $set: { role: "store_owner" } });

    return NextResponse.json({ store }, { status: 201 });
  } catch (error) {
    console.error("Create owner store error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
