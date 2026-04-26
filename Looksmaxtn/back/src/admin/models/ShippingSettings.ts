import mongoose, { Document, Model, Schema } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";

export interface IShippingSettings extends Document {
  key: string;
  shippingCost: number;
  freeShippingThreshold: number;
  createdBy?: IAuditActor | null;
  updatedBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const shippingSettingsSchema = new Schema<IShippingSettings>(
  {
    key: { type: String, required: true, unique: true, default: "shipping" },
    shippingCost: { type: Number, required: true, default: 0, min: 0 },
    freeShippingThreshold: { type: Number, required: true, default: 0, min: 0 },
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.ShippingSettings) {
  delete mongoose.models.ShippingSettings;
}

const ShippingSettings: Model<IShippingSettings> =
  mongoose.models.ShippingSettings ||
  mongoose.model<IShippingSettings>("ShippingSettings", shippingSettingsSchema);

export default ShippingSettings;
