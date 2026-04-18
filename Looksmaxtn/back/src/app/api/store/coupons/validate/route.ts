import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Coupon from "@/store/models/Coupon";
import {
  buildCouponValidationResult,
  getCouponValidationError,
  normalizeCouponCode,
} from "@/lib/coupons";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const { code, subtotal } = (await req.json()) as { code?: string; subtotal?: number };

    const normalizedCode = normalizeCouponCode(code || "");
    const numericSubtotal = Number(subtotal || 0);

    if (!normalizedCode) {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }

    const coupon = await Coupon.findOne({ code: normalizedCode }).lean();
    if (!coupon) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    const error = getCouponValidationError(coupon, numericSubtotal);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const validation = buildCouponValidationResult(coupon, numericSubtotal);
    return NextResponse.json({
      coupon: {
        code: coupon.code,
        description: coupon.description || "",
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minimumOrderAmount: coupon.minimumOrderAmount ?? 0,
        maxUses: coupon.maxUses ?? null,
        usageCount: coupon.usageCount ?? 0,
        discountAmount: validation.discountAmount,
        totalAfterDiscount: validation.totalAfterDiscount,
      },
    });
  } catch (error: unknown) {
    console.error("Validate coupon error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
