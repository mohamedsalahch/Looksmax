import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import {
  createWithdrawalRequest,
  getBalanceSummary,
  getBalanceTransactions,
  getWithdrawalsForOwner,
  serializeWithdrawal,
} from "@/admin/lib/storeBalance";

const VALID_METHODS = new Set(["bank_transfer", "d17", "other"]);

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "store_owner") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const withdrawals = await getWithdrawalsForOwner(session.userId);
    return NextResponse.json({ withdrawals });
  } catch (error) {
    console.error("[me-withdrawals] GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "store_owner") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const amount = Number(body?.amount);
    const paymentMethod = String(body?.paymentMethod || "bank_transfer");
    const paymentDetails = String(body?.paymentDetails || "").trim();
    const note = String(body?.note || "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter an amount greater than 0" }, { status: 400 });
    }
    if (!VALID_METHODS.has(paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }
    if (!paymentDetails) {
      return NextResponse.json({ error: "Payment details are required" }, { status: 400 });
    }

    await dbConnect();
    const request = await createWithdrawalRequest({
      storeOwnerId: session.userId,
      amount,
      paymentMethod: paymentMethod as "bank_transfer" | "d17" | "other",
      paymentDetails,
      note,
    });

    const [summary, transactions, withdrawals] = await Promise.all([
      getBalanceSummary(session.userId),
      getBalanceTransactions(session.userId),
      getWithdrawalsForOwner(session.userId),
    ]);

    return NextResponse.json({
      withdrawal: serializeWithdrawal(request as unknown as Parameters<typeof serializeWithdrawal>[0]),
      ...summary,
      transactions,
      withdrawals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message.includes("not found") ? 404 :
      /required|exceeds|greater|invalid/i.test(message) ? 400 :
      500;
    console.error("[me-withdrawals] POST error", error);
    return NextResponse.json({ error: message }, { status });
  }
}
