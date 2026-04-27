import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import Store from "@/admin/models/Store";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;
    const store = await Store.findByIdAndUpdate(
      id,
      { status: "approved", updatedBy: await getAuditActorFromSession(session) },
      { new: true }
    ).lean();
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    return NextResponse.json({ store });
  } catch (error) {
    console.error("Approve store error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
