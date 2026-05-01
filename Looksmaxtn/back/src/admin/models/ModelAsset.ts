import mongoose, { Document, Model, Schema } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";

export type ModelGender = "male" | "female" | "unisex";

export interface IModelAsset extends Document {
  name: string;
  gender: ModelGender;
  images: string[];
  frontImage: string;
  backImage: string;
  createdBy?: IAuditActor | null;
  updatedBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const modelAssetSchema = new Schema<IModelAsset>(
  {
    name: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["male", "female", "unisex"], required: true, default: "unisex" },
    images: [{ type: String, required: true, trim: true }],
    frontImage: { type: String, required: true, trim: true },
    backImage: { type: String, required: true, trim: true },
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.ModelAsset) {
  delete mongoose.models.ModelAsset;
}

const ModelAsset: Model<IModelAsset> =
  mongoose.models.ModelAsset || mongoose.model<IModelAsset>("ModelAsset", modelAssetSchema);

export default ModelAsset;
