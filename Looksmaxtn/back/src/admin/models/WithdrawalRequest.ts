import mongoose, { Document, Model, Schema } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";

export type WithdrawalStatus = "pending" | "approved" | "rejected";
export type WithdrawalPaymentMethod = "bank_transfer" | "d17" | "other";

export interface IWithdrawalRequest extends Document {
  storeOwner: mongoose.Types.ObjectId;
  amount: number;
  paymentMethod: WithdrawalPaymentMethod;
  paymentDetails: string;
  note?: string;
  status: WithdrawalStatus;
  reviewedBy?: IAuditActor | null;
  reviewedAt?: Date | null;
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWithdrawalRequest>(
  {
    storeOwner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    paymentMethod: {
      type: String,
      enum: ["bank_transfer", "d17", "other"],
      default: "bank_transfer",
    },
    paymentDetails: { type: String, required: true, trim: true },
    note: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: auditActorSchema, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

schema.index({ storeOwner: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.WithdrawalRequest) {
  delete mongoose.models.WithdrawalRequest;
}

const WithdrawalRequest: Model<IWithdrawalRequest> =
  mongoose.models.WithdrawalRequest ||
  mongoose.model<IWithdrawalRequest>("WithdrawalRequest", schema);

export default WithdrawalRequest;
