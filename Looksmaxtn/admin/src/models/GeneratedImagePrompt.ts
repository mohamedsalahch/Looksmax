import mongoose, { Document, Model, Schema } from "mongoose";

export interface IGeneratedImagePrompt extends Document {
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const generatedImagePromptSchema = new Schema<IGeneratedImagePrompt>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

generatedImagePromptSchema.index({ title: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.GeneratedImagePrompt) {
  delete mongoose.models.GeneratedImagePrompt;
}

const GeneratedImagePrompt: Model<IGeneratedImagePrompt> =
  mongoose.models.GeneratedImagePrompt ||
  mongoose.model<IGeneratedImagePrompt>("GeneratedImagePrompt", generatedImagePromptSchema);

export default GeneratedImagePrompt;
