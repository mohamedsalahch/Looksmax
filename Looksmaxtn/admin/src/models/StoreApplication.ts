import mongoose, { Schema, Document, Model } from "mongoose";

export type StoreApplicationCategory = "clothes" | "fragrances" | "accessories";
export type StoreApplicationStatus = "pending" | "approved" | "rejected";

export interface IStoreApplication extends Document {
  name: string;
  storeName: string;
  email: string;
  category: StoreApplicationCategory;
  address: string;
  phoneNumber: string;
  additionalInformation?: string;
  status: StoreApplicationStatus;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const storeApplicationSchema = new Schema<IStoreApplication>(
  {
    name: { type: String, required: true, trim: true },
    storeName: { type: String, default: "", trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    category: {
      type: String,
      enum: ["clothes", "fragrances", "accessories"],
      required: true,
    },
    address: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    additionalInformation: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const StoreApplication: Model<IStoreApplication> =
  mongoose.models.StoreApplication ||
  mongoose.model<IStoreApplication>("StoreApplication", storeApplicationSchema);

export default StoreApplication;
