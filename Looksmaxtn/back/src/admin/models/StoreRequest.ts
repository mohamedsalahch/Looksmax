import mongoose, { Schema, Document, Model } from "mongoose";

const STORE_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;

export type StoreRequestStatus = "pending" | "approved" | "rejected";

export interface IStoreRequest extends Document {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  storeName: string;
  storeCategory: string;
  storeLocation: string;
  socialLink: string;
  message: string;
  status: StoreRequestStatus;
  userId?: mongoose.Types.ObjectId | null;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const storeRequestSchema = new Schema<IStoreRequest>(
  {
    ownerName: { type: String, required: true, trim: true },
    ownerEmail: { type: String, required: true, lowercase: true, trim: true },
    ownerPhone: { type: String, required: true, trim: true },
    storeName: { type: String, required: true, trim: true },
    storeCategory: { type: String, required: true, trim: true },
    storeLocation: { type: String, required: true, trim: true },
    socialLink: { type: String, default: "", trim: true },
    message: { type: String, default: "" },
    status: { type: String, enum: STORE_REQUEST_STATUSES, default: "pending" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

function getStoreRequestModel(): Model<IStoreRequest> {
  const existing = mongoose.models.StoreRequest as Model<IStoreRequest> | undefined;
  if (!existing) {
    return mongoose.model<IStoreRequest>("StoreRequest", storeRequestSchema);
  }

  const statusPath = existing.schema.path("status") as
    | (mongoose.SchemaType & { enumValues?: string[]; enum: (...values: StoreRequestStatus[]) => void })
    | undefined;
  const isMissingStatus = STORE_REQUEST_STATUSES.some((status) => !statusPath?.enumValues?.includes(status));

  if (isMissingStatus) {
    statusPath?.enum(...STORE_REQUEST_STATUSES);
  }

  return existing;
}

const StoreRequest: Model<IStoreRequest> = getStoreRequestModel();

export default StoreRequest;
