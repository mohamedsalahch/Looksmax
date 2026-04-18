import mongoose, { Schema, Document, Model } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";
import { type CouponDiscountType } from "@/lib/coupons";

export interface ICoupon extends Document {
  code: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumOrderAmount?: number;
  maxUses?: number | null;
  usageCount: number;
  isActive: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  createdBy?: IAuditActor | null;
  updatedBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String, default: "" },
    discountType: { type: String, enum: ["percentage", "fixed"], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minimumOrderAmount: { type: Number, default: 0, min: 0 },
    maxUses: { type: Number, default: null, min: 0 },
    usageCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1 }, { unique: true });

if (process.env.NODE_ENV !== "production" && mongoose.models.Coupon) {
  delete mongoose.models.Coupon;
}

const Coupon: Model<ICoupon> =
  mongoose.models.Coupon || mongoose.model<ICoupon>("Coupon", couponSchema);

export default Coupon;
