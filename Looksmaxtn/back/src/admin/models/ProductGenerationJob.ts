import mongoose, { Document, Model, Schema } from "mongoose";

export interface IProductGenerationJob extends Document {
  status: "processing" | "completed" | "failed";
  productType: "fashion" | "perfume";
  fashionSubtype: "clothes" | "shoes";
  images: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductGenerationJobSchema = new Schema<IProductGenerationJob>(
  {
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
    },
    productType: { type: String, required: true },
    fashionSubtype: { type: String, required: true },
    images: {
      front: { type: String, default: "" },
      back: { type: String, default: "" },
      left: { type: String, default: "" },
      right: { type: String, default: "" },
    },
    error: { type: String },
  },
  { timestamps: true }
);

const ProductGenerationJob: Model<IProductGenerationJob> =
  mongoose.models.ProductGenerationJob ||
  mongoose.model<IProductGenerationJob>("ProductGenerationJob", ProductGenerationJobSchema);

export default ProductGenerationJob;
