import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import { getAuditActorFromSession } from "@/store/lib/auditRoute";
import Store from "@/store/models/Store";
import { saveStoreLogo } from "@/lib/storeUtils";

async function getPatchPayload(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const logoFile = formData.get("logo");
    return {
      name: formData.get("name"),
      category: formData.get("category"),
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
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const { id } = await params;
    const store = await Store.findOne({ _id: id, owner: session.userId }).lean();
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    return NextResponse.json({ store });
  } catch (error) {
    console.error("Get owner store error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const { id } = await params;
    const body = await getPatchPayload(req);
    const update: Record<string, unknown> = { updatedBy: await getAuditActorFromSession(session) };
    for (const field of ["name", "category", "logo"] as const) {
      if (typeof body[field] === "string" && body[field].trim()) {
        update[field] = body[field].trim();
      }
    }

    const store = await Store.findOneAndUpdate(
      { _id: id, owner: session.userId, isMainStore: false },
      update,
      { new: true }
    ).lean();
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    return NextResponse.json({ store });
  } catch (error) {
    console.error("Update owner store error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
