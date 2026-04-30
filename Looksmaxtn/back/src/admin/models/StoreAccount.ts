import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStoreAccount extends Document {
  storeRequestId: mongoose.Types.ObjectId;
  storeName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  password: string;
  logo: string;
  onboardingCompleted: boolean;
  firstLoginAt?: Date | null;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  passwordResetSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const storeAccountSchema = new Schema<IStoreAccount>(
  {
    storeRequestId: { type: Schema.Types.ObjectId, ref: "StoreRequest", required: true, unique: true },
    storeName: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    ownerEmail: { type: String, required: true, lowercase: true, trim: true, unique: true },
    ownerPhone: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    logo: { type: String, default: "" },
    onboardingCompleted: { type: Boolean, default: false },
    firstLoginAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
    passwordResetSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const StoreAccount: Model<IStoreAccount> =
  mongoose.models.StoreAccount || mongoose.model<IStoreAccount>("StoreAccount", storeAccountSchema);

export default StoreAccount;
