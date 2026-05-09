import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import {
  adjustStoreCredits,
  getStoreCreditSummary,
  getStoreCreditTransactions,
} from "@/admin/lib/storeCredits";

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
    const credits = await getStoreCreditSummary(storeOwnerId);
    if (!credits) {
      return NextResponse.json({ error: "Store owner not found" }, { status: 404 });
    }

    const transactions = await getStoreCreditTransactions(storeOwnerId);
    return NextResponse.json({ ...credits, transactions });
  } catch (error) {
    console.error("[admin-store-credits] GET error", error);
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
    const amount = Number(body?.amount);
    const reason = String(body?.reason || "").trim() || "Admin balance adjustment";

    if (!Number.isInteger(amount) || amount === 0) {
      return NextResponse.json({ error: "Enter a non-zero whole number of credits" }, { status: 400 });
    }

    await dbConnect();
    const actor = await getAuditActorFromSession(session);
    const credits = await adjustStoreCredits({ storeOwnerId, amount, reason, actor });
    const transactions = await getStoreCreditTransactions(storeOwnerId);

    return NextResponse.json({ ...credits, transactions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("not found") ? 404 : message.includes("Cannot") || message.includes("Enter") ? 400 : 500;
    console.error("[admin-store-credits] POST error", error);
    return NextResponse.json({ error: message }, { status });
  }
}
