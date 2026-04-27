import mongoose, { Document, Model, Schema } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/store/lib/audit";

export type StoreStatus = "pending" | "approved" | "disabled";

export interface IStore extends Document {
  owner: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  logo: string;
  category: string;
  status: StoreStatus;
  isMainStore: boolean;
  createdBy?: IAuditActor | null;
  updatedBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const storeSchema = new Schema<IStore>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    logo: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "disabled"],
      default: "pending",
      index: true,
    },
    isMainStore: { type: Boolean, default: false, index: true },
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

storeSchema.index({ owner: 1, createdAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Store) {
  delete mongoose.models.Store;
}

const Store: Model<IStore> =
  mongoose.models.Store || mongoose.model<IStore>("Store", storeSchema);

export default Store;
