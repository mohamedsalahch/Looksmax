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
  profileImageUploadCount: number;
  outfitGenerationCount: number;
  gender: string;
  imageEnhancing: boolean;
  profileImageRequiresGeneration: boolean;
  profileImageValidationError?: string;
  outfitStudioTriesUsed?: number;
}

export interface IOutfitStudioStats {
  initialTries: number;
  triesUsed: number;
}

export interface IStoreOwnerStats {
  triesAllowed: number;
  triesUsed: number;
}

export interface IUser extends Document {
  name: string;
  storeName?: string;
  storeType?: "thrift" | "retail" | null;
  storeApprovalStatus?: "pending" | "approved" | "rejected" | null;
  email: string;
  password: string;
  role: "user" | "admin" | "store_owner";
  googleId?: string | null;
  isBlocked?: boolean;
  emailVerified?: boolean;
  emailVerificationTokenHash?: string | null;
  emailVerificationExpiresAt?: Date | null;
  emailVerificationSentAt?: Date | null;
  sessionVersion?: number;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  passwordResetSentAt?: Date | null;
  address?: IAddress;
  bodyProfile?: IBodyProfile;
  outfitStudioStats?: IOutfitStudioStats;
  storeOwnerStats?: IStoreOwnerStats;
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
    profileImageUploadCount: { type: Number, default: 0 },
    outfitGenerationCount: { type: Number, default: 0 },
    gender: { type: String, default: "" },
    imageEnhancing: { type: Boolean, default: false },
    profileImageRequiresGeneration: { type: Boolean, default: false },
    profileImageValidationError: { type: String, default: "" },
    outfitStudioTriesUsed: { type: Number, default: 0 },
  },
  { _id: false }
);

const outfitStudioStatsSchema = new Schema<IOutfitStudioStats>(
  {
    initialTries: { type: Number, default: 5 },
    triesUsed: { type: Number, default: 0 },
  },
  { _id: false }
);

const storeOwnerStatsSchema = new Schema<IStoreOwnerStats>(
  {
    triesAllowed: { type: Number, default: 50 },
    triesUsed: { type: Number, default: 0 },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    storeName: { type: String, default: "", trim: true },
    storeType: { type: String, enum: ["thrift", "retail", null], default: null },
    storeApprovalStatus: { type: String, enum: ["pending", "approved", "rejected", null], default: null },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["user", "admin", "store_owner"], default: "user" },
    googleId: { type: String, unique: true, sparse: true },
    isBlocked: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: true },
    emailVerificationTokenHash: { type: String, default: null },
    emailVerificationExpiresAt: { type: Date, default: null },
    emailVerificationSentAt: { type: Date, default: null },
    sessionVersion: { type: Number, default: 0 },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
    passwordResetSentAt: { type: Date, default: null },
    address: { type: addressSchema, default: () => ({}) },
    bodyProfile: { type: bodyProfileSchema, default: () => ({}) },
    outfitStudioStats: { type: outfitStudioStatsSchema, default: () => ({ initialTries: 5, triesUsed: 0 }) },
    storeOwnerStats: { type: storeOwnerStatsSchema, default: () => ({ triesAllowed: 50, triesUsed: 0 }) },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.User) {
  delete mongoose.models.User;
}

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", userSchema);

export default User;
