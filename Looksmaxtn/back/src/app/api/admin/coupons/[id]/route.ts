import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Coupon from "@/admin/models/Coupon";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { normalizeCouponCode } from "@/lib/coupons";
import mongoose from "mongoose";

async function ensureAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return null;
  }
  return session;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await ensureAdmin();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid coupon ID" }, { status: 400 });
    }

    await dbConnect();
    const coupon = await Coupon.findById(id).lean();
    if (!coupon) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    return NextResponse.json({ coupon });
  } catch (error) {
    console.error("Get coupon error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await ensureAdmin();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid coupon ID" }, { status: 400 });
    }

    await dbConnect();
    const auditActor = await getAuditActorFromSession(session);
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

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    if (body.code) coupon.code = normalizeCouponCode(body.code);
    if (typeof body.description === "string") coupon.description = body.description;
    if (body.discountType) coupon.discountType = body.discountType;
    if (typeof body.discountValue === "number") coupon.discountValue = body.discountValue;
    if (typeof body.minimumOrderAmount === "number") coupon.minimumOrderAmount = Math.max(0, body.minimumOrderAmount);
    if (body.maxUses === null) coupon.maxUses = null;
    if (typeof body.maxUses === "number") coupon.maxUses = body.maxUses;
    if (body.startsAt !== undefined) coupon.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.endsAt !== undefined) coupon.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    if (typeof body.isActive === "boolean") coupon.isActive = body.isActive;
    coupon.updatedBy = auditActor;

    await coupon.save();
    return NextResponse.json({ coupon });
  } catch (error) {
    console.error("Update coupon error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await ensureAdmin();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid coupon ID" }, { status: 400 });
    }

    await dbConnect();
    const deleted = await Coupon.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete coupon error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
