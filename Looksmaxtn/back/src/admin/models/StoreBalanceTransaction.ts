import mongoose, { Document, Model, Schema } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";

export type StoreBalanceTransactionType =
  | "earning"
  | "withdrawal_pending"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "admin_adjustment";

export interface IStoreBalanceTransaction extends Document {
  storeOwner: mongoose.Types.ObjectId;
  type: StoreBalanceTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  order?: mongoose.Types.ObjectId | null;
  withdrawal?: mongoose.Types.ObjectId | null;
  createdBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IStoreBalanceTransaction>(
  {
    storeOwner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: [
        "earning",
        "withdrawal_pending",
        "withdrawal_approved",
        "withdrawal_rejected",
        "admin_adjustment",
      ],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reason: { type: String, default: "", trim: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    withdrawal: { type: Schema.Types.ObjectId, ref: "WithdrawalRequest", default: null },
    createdBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

schema.index({ storeOwner: 1, createdAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.StoreBalanceTransaction) {
  delete mongoose.models.StoreBalanceTransaction;
}

const StoreBalanceTransaction: Model<IStoreBalanceTransaction> =
  mongoose.models.StoreBalanceTransaction ||
  mongoose.model<IStoreBalanceTransaction>("StoreBalanceTransaction", schema);

export default StoreBalanceTransaction;
