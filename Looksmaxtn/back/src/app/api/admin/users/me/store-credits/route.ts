import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { getSession } from "@/admin/lib/auth";
import { getStoreCreditTransactions } from "@/admin/lib/storeCredits";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(session.userId).select("role storeOwnerStats").lean();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.role !== "store_owner") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const allowed = user.storeOwnerStats?.triesAllowed ?? 50;
    const used = user.storeOwnerStats?.triesUsed ?? 0;
    const transactions = await getStoreCreditTransactions(session.userId);

    return NextResponse.json({
      allowed,
      used,
      remaining: Math.max(0, allowed - used),
      transactions,
    });
  } catch (error) {
    console.error("[store-credits] GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(session.userId).select("role storeOwnerStats").exec();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.role !== "store_owner") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Credits are managed by the admin. Contact support to request more." },
      { status: 403 }
    );
  } catch (error) {
    console.error("[store-credits] POST error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
