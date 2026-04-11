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
  usualSize: string;
  profileImage: string;
  gender: string;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  isBlocked?: boolean;
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
    usualSize: { type: String, default: "" },
    profileImage: { type: String, default: "" },
    gender: { type: String, default: "" },
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
