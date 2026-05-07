import mongoose, { Document, Model, Schema } from "mongoose";

export interface IProductMediaEnhancementJob extends Document {
  status: "processing" | "completed" | "failed";
  sourceImages: {
    front: string;
    back: string;
    left?: string;
    right?: string;
  };
  images: {
    front: string;
    back: string;
    left?: string;
    right?: string;
  };
  errorMessage?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const productMediaEnhancementJobSchema = new Schema<IProductMediaEnhancementJob>(
  {
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
    },
    sourceImages: {
      front: { type: String, default: "" },
      back: { type: String, default: "" },
      left: { type: String, default: "" },
      right: { type: String, default: "" },
    },
    images: {
      front: { type: String, default: "" },
      back: { type: String, default: "" },
      left: { type: String, default: "" },
      right: { type: String, default: "" },
    },
    errorMessage: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.ProductMediaEnhancementJob) {
  delete mongoose.models.ProductMediaEnhancementJob;
}

const ProductMediaEnhancementJob: Model<IProductMediaEnhancementJob> =
  mongoose.models.ProductMediaEnhancementJob ||
  mongoose.model<IProductMediaEnhancementJob>("ProductMediaEnhancementJob", productMediaEnhancementJobSchema);

export default ProductMediaEnhancementJob;
