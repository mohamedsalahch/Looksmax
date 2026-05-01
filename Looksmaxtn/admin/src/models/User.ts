import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  name: string; storeName?: string; storeType?: "thrift" | "retail" | null; email: string; password: string; role: "user" | "admin" | "store_owner";
  isBlocked?: boolean;
  emailVerified?: boolean;
  emailVerificationTokenHash?: string | null;
  emailVerificationExpiresAt?: Date | null;
  emailVerificationSentAt?: Date | null;
  sessionVersion?: number;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  passwordResetSentAt?: Date | null;
  address?: { street: string; city: string; state: string; zip: string; phone: string; };
  createdAt: Date; updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  storeName: { type: String, default: "", trim: true },
  storeType: { type: String, enum: ["thrift", "retail", null], default: null },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin", "store_owner"], default: "user" },
  isBlocked: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: true },
  emailVerificationTokenHash: { type: String, default: null },
  emailVerificationExpiresAt: { type: Date, default: null },
  emailVerificationSentAt: { type: Date, default: null },
  sessionVersion: { type: Number, default: 0 },
  passwordResetTokenHash: { type: String, default: null },
  passwordResetExpiresAt: { type: Date, default: null },
  passwordResetSentAt: { type: Date, default: null },
  address: {
    street: { type: String, default: "" }, city: { type: String, default: "" },
    state: { type: String, default: "" }, zip: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
}, { timestamps: true });

if (process.env.NODE_ENV !== "production" && mongoose.models.User) {
  delete mongoose.models.User;
}

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
export default User;
