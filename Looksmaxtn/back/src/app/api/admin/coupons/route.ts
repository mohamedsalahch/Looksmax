import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Coupon from "@/admin/models/Coupon";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { normalizeCouponCode } from "@/lib/coupons";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ coupons });
  } catch (error) {
    console.error("Get coupons error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const auditActor = await getAuditActorFromSession(session);
    await dbConnect();

    const body = (await req.json()) as {
      code?: string;
      description?: string;
      discountType?: "percentage" | "fixed";
      discountValue?: number;
      minimumOrderAmount?: number;
      maxUses?: number | null;
      startsAt?: string | null;
      endsAt?: string | null;
      isActive?: boolean;
    };

    const code = normalizeCouponCode(body.code || "");
    const discountType = body.discountType || "percentage";
    const discountValue = Number(body.discountValue || 0);
    const minimumOrderAmount = Number(body.minimumOrderAmount || 0);
    const maxUses = body.maxUses == null ? null : Number(body.maxUses);
    const startsAt = body.startsAt ? new Date(body.startsAt) : null;
    const endsAt = body.endsAt ? new Date(body.endsAt) : null;

    if (!code) {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }

    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return NextResponse.json({ error: "Discount value must be greater than zero" }, { status: 400 });
    }

    if (discountType === "percentage" && discountValue > 100) {
      return NextResponse.json({ error: "Percentage discount cannot exceed 100" }, { status: 400 });
    }

    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 0)) {
      return NextResponse.json({ error: "Maximum uses must be a positive number" }, { status: 400 });
    }

    const existing = await Coupon.findOne({ code });
    if (existing) {
      return NextResponse.json({ error: "A coupon with this code already exists" }, { status: 400 });
    }

    const coupon = await Coupon.create({
      code,
      description: body.description || "",
      discountType,
      discountValue,
      minimumOrderAmount: Number.isFinite(minimumOrderAmount) ? Math.max(0, minimumOrderAmount) : 0,
      maxUses,
      startsAt,
      endsAt,
      isActive: body.isActive ?? true,
      createdBy: auditActor,
      updatedBy: auditActor,
    });

    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    console.error("Create coupon error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
