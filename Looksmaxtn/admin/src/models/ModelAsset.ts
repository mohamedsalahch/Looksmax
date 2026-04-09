import mongoose, { Document, Model, Schema } from "mongoose";

export interface IModelAsset extends Document {
  name: string;
  images: string[];
  frontImage: string;
  backImage: string;
  createdAt: Date;
  updatedAt: Date;
}

const modelAssetSchema = new Schema<IModelAsset>(
  {
    name: { type: String, required: true, trim: true },
    images: [{ type: String, required: true, trim: true }],
    frontImage: { type: String, required: true, trim: true },
    backImage: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.ModelAsset) {
  delete mongoose.models.ModelAsset;
}

const ModelAsset: Model<IModelAsset> =
  mongoose.models.ModelAsset || mongoose.model<IModelAsset>("ModelAsset", modelAssetSchema);

export default ModelAsset;
