import mongoose, { Document, Model, Schema } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";

export interface IGeneratedImageAsset extends Document {
  prompt: string;
  sourceImages: string[];
  images: string[];
  createdBy?: IAuditActor | null;
  updatedBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const generatedImageAssetSchema = new Schema<IGeneratedImageAsset>(
  {
    prompt: { type: String, required: true, trim: true },
    sourceImages: [{ type: String, required: true, trim: true }],
    images: [{ type: String, required: true, trim: true }],
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.GeneratedImageAsset) {
  delete mongoose.models.GeneratedImageAsset;
}

const GeneratedImageAsset: Model<IGeneratedImageAsset> =
  mongoose.models.GeneratedImageAsset ||
  mongoose.model<IGeneratedImageAsset>("GeneratedImageAsset", generatedImageAssetSchema);

export default GeneratedImageAsset;
