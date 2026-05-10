import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import {
  approveWithdrawal,
  rejectWithdrawal,
  serializeWithdrawal,
} from "@/admin/lib/storeBalance";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid withdrawal id" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const action = String(body?.action || "");
    const reviewNote = body?.reviewNote ? String(body.reviewNote) : undefined;

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await dbConnect();
    const actor = await getAuditActorFromSession(session);

    const request =
      action === "approve"
        ? await approveWithdrawal({ withdrawalId: id, actor, reviewNote })
        : await rejectWithdrawal({ withdrawalId: id, actor, reviewNote });

    return NextResponse.json({
      withdrawal: serializeWithdrawal(request as unknown as Parameters<typeof serializeWithdrawal>[0]),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message.includes("not found") ? 404 :
      /already|enough|invalid/i.test(message) ? 400 :
      500;
    console.error("[admin-withdrawals/:id] POST error", error);
    return NextResponse.json({ error: message }, { status });
  }
}
