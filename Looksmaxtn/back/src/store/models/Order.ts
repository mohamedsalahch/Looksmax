import mongoose, { Schema, Document, Model } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/store/lib/audit";

export interface IOrderItem {
  product: mongoose.Types.ObjectId;
  store?: mongoose.Types.ObjectId | null;
  storeNameSnapshot?: string;
  name: string;
  price: number;
  size: string;
  color: string;
  quantity: number;
}

export interface IOrder extends Document {
  user?: mongoose.Types.ObjectId | null;
  guestEmail?: string;
  guestAccessToken?: string;
  items: IOrderItem[];
  storeIds?: mongoose.Types.ObjectId[];
  isArchived: boolean;
  archivedAt?: Date | null;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    fullName: string;
  };
  paymentMethod: string;
  orderStatus: "processing" | "confirmed" | "canceled" | "shipping" | "delivered" | "returned";
  subtotalPrice: number;
  shippingFee: number;
  couponCode?: string;
  couponDiscountType?: string;
  couponDiscountValue?: number;
  couponDiscountAmount?: number;
  totalPrice: number;
  createdBy?: IAuditActor | null;
  updatedBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null },
    storeNameSnapshot: { type: String, default: "Looksmaxtn" },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    size: { type: String, default: "" },
    color: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    guestEmail: { type: String, default: "" },
    guestAccessToken: { type: String, default: "" },
    items: [orderItemSchema],
    storeIds: [{ type: Schema.Types.ObjectId, ref: "Store", index: true }],
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    shippingAddress: {
      fullName: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zip: { type: String, required: true },
      phone: { type: String, required: true },
    },
    paymentMethod: { type: String, default: "cod" },
    orderStatus: {
      type: String,
      enum: ["processing", "confirmed", "canceled", "shipping", "delivered", "returned"],
      default: "processing",
    },
    subtotalPrice: { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    couponCode: { type: String, default: "" },
    couponDiscountType: { type: String, default: "" },
    couponDiscountValue: { type: Number, default: 0 },
    couponDiscountAmount: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true },
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ storeIds: 1, createdAt: -1 });
orderSchema.index({ "items.store": 1, createdAt: -1 });

const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>("Order", orderSchema);

export default Order;
