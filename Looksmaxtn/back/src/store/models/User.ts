import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

export interface IBodyProfile {
  heightCm: string;
  weightKg: string;
  topSize: string;
  bottomSize: string;
  shoeSize: string;
  profileImage: string;
  profileImageEnhanced: string;
  gender: string;
  imageEnhancing: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  isBlocked?: boolean;
  emailVerified?: boolean;
  emailVerificationTokenHash?: string | null;
  emailVerificationExpiresAt?: Date | null;
  emailVerificationSentAt?: Date | null;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  passwordResetSentAt?: Date | null;
  address?: IAddress;
  bodyProfile?: IBodyProfile;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddress>(
  {
    street: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zip: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
  { _id: false }
);

const bodyProfileSchema = new Schema<IBodyProfile>(
  {
    heightCm: { type: String, default: "" },
    weightKg: { type: String, default: "" },
    topSize: { type: String, default: "" },
    bottomSize: { type: String, default: "" },
    shoeSize: { type: String, default: "" },
    profileImage: { type: String, default: "" },
    profileImageEnhanced: { type: String, default: "" },
    gender: { type: String, default: "" },
    imageEnhancing: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isBlocked: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: true },
    emailVerificationTokenHash: { type: String, default: null },
    emailVerificationExpiresAt: { type: Date, default: null },
    emailVerificationSentAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
    passwordResetSentAt: { type: Date, default: null },
    address: { type: addressSchema, default: () => ({}) },
    bodyProfile: { type: bodyProfileSchema, default: () => ({}) },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.User) {
  delete mongoose.models.User;
}

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", userSchema);

export default User;
