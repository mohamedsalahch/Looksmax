import mongoose, { Document, Model, Schema } from "mongoose";

interface IOutfitGenerationImages {
  front: string;
  back: string;
}

export interface IOutfitGenerationJob extends Document {
  user: Schema.Types.ObjectId;
  status: "pending" | "processing" | "completed" | "failed";
  images: IOutfitGenerationImages;
  errorMessage?: string;
  requestPayload?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const outfitGenerationImagesSchema = new Schema<IOutfitGenerationImages>(
  {
    front: { type: String, default: "" },
    back: { type: String, default: "" },
  },
  { _id: false }
);

const outfitGenerationJobSchema = new Schema<IOutfitGenerationJob>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    images: { type: outfitGenerationImagesSchema, default: () => ({}) },
    errorMessage: { type: String, default: "" },
    requestPayload: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.OutfitGenerationJob) {
  delete mongoose.models.OutfitGenerationJob;
}

const OutfitGenerationJob: Model<IOutfitGenerationJob> =
  mongoose.models.OutfitGenerationJob ||
  mongoose.model<IOutfitGenerationJob>("OutfitGenerationJob", outfitGenerationJobSchema);

export default OutfitGenerationJob;
