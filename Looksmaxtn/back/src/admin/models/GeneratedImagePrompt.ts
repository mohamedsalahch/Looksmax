import mongoose, { Document, Model, Schema } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";

export interface IGeneratedImagePrompt extends Document {
  title: string;
  description: string;
  createdBy?: IAuditActor | null;
  updatedBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const generatedImagePromptSchema = new Schema<IGeneratedImagePrompt>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
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
