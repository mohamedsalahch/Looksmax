export type CouponDiscountType = "percentage" | "fixed";

export interface CouponLike {
  _id?: unknown;
  code: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumOrderAmount?: number;
  maxUses?: number | null;
  usageCount?: number;
  isActive: boolean;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}

export interface CouponValidationResult {
  discountAmount: number;
  totalAfterDiscount: number;
}

export function normalizeCouponCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

export function calculateCouponDiscountAmount(coupon: CouponLike, subtotal: number) {
  if (subtotal <= 0) return 0;

  const baseDiscount =
    coupon.discountType === "percentage"
      ? subtotal * (coupon.discountValue / 100)
      : coupon.discountValue;

  return Math.min(Math.max(baseDiscount, 0), subtotal);
}

export function getCouponValidationError(coupon: CouponLike, subtotal: number, now = new Date()) {
  if (!coupon.isActive) return "This coupon is not active.";

  const startsAt = coupon.startsAt ? new Date(coupon.startsAt) : null;
  const endsAt = coupon.endsAt ? new Date(coupon.endsAt) : null;

  if (startsAt && startsAt.getTime() > now.getTime()) {
    return "This coupon is not active yet.";
  }

  if (endsAt && endsAt.getTime() < now.getTime()) {
    return "This coupon has expired.";
  }

  if (typeof coupon.minimumOrderAmount === "number" && subtotal < coupon.minimumOrderAmount) {
    return `Minimum order amount of ${coupon.minimumOrderAmount.toFixed(2)} is required.`;
  }

  if (typeof coupon.maxUses === "number" && coupon.maxUses >= 0) {
    const usageCount = coupon.usageCount ?? 0;
    if (usageCount >= coupon.maxUses) {
      return "This coupon has reached its usage limit.";
    }
  }

  if (!coupon.code) return "Invalid coupon.";
  if (subtotal <= 0) return "Cart total must be greater than zero.";

  return null;
}

export function buildCouponValidationResult(coupon: CouponLike, subtotal: number): CouponValidationResult {
  const discountAmount = calculateCouponDiscountAmount(coupon, subtotal);
  return {
    discountAmount,
    totalAfterDiscount: Math.max(0, subtotal - discountAmount),
  };
}
