import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import {
  getBalanceSummary,
  getBalanceTransactions,
  getWithdrawalsForOwner,
} from "@/admin/lib/storeBalance";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.role !== "store_owner") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const summary = await getBalanceSummary(session.userId);
    if (!summary) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [transactions, withdrawals] = await Promise.all([
      getBalanceTransactions(session.userId),
      getWithdrawalsForOwner(session.userId),
    ]);

    return NextResponse.json({ ...summary, transactions, withdrawals });
  } catch (error) {
    console.error("[me-balance] GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
