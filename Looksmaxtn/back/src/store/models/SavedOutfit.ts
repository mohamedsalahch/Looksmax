import mongoose, { Document, Model, Schema } from "mongoose";

interface ISavedOutfitImages {
  front: string;
  back: string;
}

export interface ISavedOutfit extends Document {
  user: Schema.Types.ObjectId;
  name: string;
  images: ISavedOutfitImages;
  outfitSnapshot?: Record<string, unknown>;
  shareToken: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const savedOutfitImagesSchema = new Schema<ISavedOutfitImages>(
  {
    front: { type: String, default: "" },
    back: { type: String, default: "" },
  },
  { _id: false }
);

const savedOutfitSchema = new Schema<ISavedOutfit>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    images: { type: savedOutfitImagesSchema, default: () => ({}) },
    outfitSnapshot: { type: Schema.Types.Mixed, default: null },
    shareToken: { type: String, default: "", index: true },
    isPublic: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.SavedOutfit) {
  delete mongoose.models.SavedOutfit;
}

const SavedOutfit: Model<ISavedOutfit> =
  mongoose.models.SavedOutfit ||
  mongoose.model<ISavedOutfit>("SavedOutfit", savedOutfitSchema);

export default SavedOutfit;
