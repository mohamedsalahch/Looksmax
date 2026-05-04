import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { getSession } from "@/admin/lib/auth";

const BUY_CODE = "l00ksmax";

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

    return NextResponse.json({
      allowed,
      used,
      remaining: Math.max(0, allowed - used),
    });
  } catch (error) {
    console.error("[store-credits] GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => null);
    const amount = Number(body?.amount);
    const code = String(body?.code || "").trim();

    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a valid credit amount" }, { status: 400 });
    }

    if (code !== BUY_CODE) {
      return NextResponse.json({ error: "Invalid code" }, { status: 403 });
    }

    user.storeOwnerStats = user.storeOwnerStats || { triesAllowed: 50, triesUsed: 0 };
    user.storeOwnerStats.triesAllowed += amount;
    await user.save();

    const allowed = user.storeOwnerStats.triesAllowed;
    const used = user.storeOwnerStats.triesUsed || 0;

    return NextResponse.json({
      allowed,
      used,
      remaining: Math.max(0, allowed - used),
    });
  } catch (error) {
    console.error("[store-credits] POST error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
