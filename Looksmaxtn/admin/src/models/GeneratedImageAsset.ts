import mongoose, { Document, Model, Schema } from "mongoose";

export interface IGeneratedImageAsset extends Document {
  name: string;
  prompt: string;
  promptId?: string;
  promptTitle?: string;
  promptDescription?: string;
  sourceImages: string[];
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

const generatedImageAssetSchema = new Schema<IGeneratedImageAsset>(
  {
    name: { type: String, required: true, trim: true },
    prompt: { type: String, required: true, trim: true },
    promptId: { type: String, default: "", trim: true },
    promptTitle: { type: String, default: "", trim: true },
    promptDescription: { type: String, default: "", trim: true },
    sourceImages: [{ type: String, required: true, trim: true }],
    images: [{ type: String, required: true, trim: true }],
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
