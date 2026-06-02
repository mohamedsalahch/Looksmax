import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { getBalanceSummary, resetStoreBalance } from "@/admin/lib/storeBalance";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ storeOwnerId: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { storeOwnerId } = await params;
    if (!mongoose.Types.ObjectId.isValid(storeOwnerId)) {
      return NextResponse.json({ error: "Invalid store owner id" }, { status: 400 });
    }

    await dbConnect();
    const summary = await getBalanceSummary(storeOwnerId);
    if (!summary) {
      return NextResponse.json({ error: "Store owner not found" }, { status: 404 });
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[admin-store-balance] GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ storeOwnerId: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { storeOwnerId } = await params;
    if (!mongoose.Types.ObjectId.isValid(storeOwnerId)) {
      return NextResponse.json({ error: "Invalid store owner id" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const action = String(body?.action || "reset");
    if (action !== "reset") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const reason = body?.reason ? String(body.reason) : undefined;

    await dbConnect();
    const actor = await getAuditActorFromSession(session);
    const summary = await resetStoreBalance({ storeOwnerId, actor, reason });

    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    console.error("[admin-store-balance] POST error", error);
    return NextResponse.json({ error: message }, { status });
  }
}
