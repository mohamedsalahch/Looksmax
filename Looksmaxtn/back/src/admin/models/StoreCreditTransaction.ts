import mongoose, { Document, Model, Schema } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";

export type StoreCreditTransactionType = "admin_adjustment" | "usage";

export interface IStoreCreditTransaction extends Document {
  storeOwner: mongoose.Types.ObjectId;
  type: StoreCreditTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  triesAllowedBefore: number;
  triesAllowedAfter: number;
  triesUsedBefore: number;
  triesUsedAfter: number;
  reason: string;
  createdBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const storeCreditTransactionSchema = new Schema<IStoreCreditTransaction>(
  {
    storeOwner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["admin_adjustment", "usage"], required: true, index: true },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    triesAllowedBefore: { type: Number, required: true },
    triesAllowedAfter: { type: Number, required: true },
    triesUsedBefore: { type: Number, required: true },
    triesUsedAfter: { type: Number, required: true },
    reason: { type: String, default: "", trim: true },
    createdBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

storeCreditTransactionSchema.index({ storeOwner: 1, createdAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.StoreCreditTransaction) {
  delete mongoose.models.StoreCreditTransaction;
}

const StoreCreditTransaction: Model<IStoreCreditTransaction> =
  mongoose.models.StoreCreditTransaction ||
  mongoose.model<IStoreCreditTransaction>("StoreCreditTransaction", storeCreditTransactionSchema);

export default StoreCreditTransaction;
