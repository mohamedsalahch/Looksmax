import mongoose, { Schema, Document, Model } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";

export interface ICategory extends Document {
  name: string;
  slug: string;
  order: number;
  isActive: boolean;
  parentSlug?: string | null;
  createdBy?: IAuditActor | null;
  updatedBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    parentSlug: { type: String, default: null },
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Category) {
  delete mongoose.models.Category;
}

const Category: Model<ICategory> =
  mongoose.models.Category || mongoose.model<ICategory>("Category", categorySchema);
export default Category;
