import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOrder extends Document {
  user: mongoose.Types.ObjectId;
  items: { product: mongoose.Types.ObjectId; name: string; price: number; size: string; color: string; quantity: number; }[];
  shippingAddress: { fullName: string; street: string; city: string; state: string; zip: string; phone: string; };
  paymentMethod: string;
  orderStatus: "processing" | "confirmed" | "canceled" | "shipping" | "delivered" | "returned";
  totalPrice: number; createdAt: Date; updatedAt: Date;
}

const orderSchema = new Schema<IOrder>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  items: [{
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true }, price: { type: Number, required: true },
    size: { type: String, default: "" }, color: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
  }],
  shippingAddress: {
    fullName: { type: String, required: true }, street: { type: String, required: true },
    city: { type: String, required: true }, state: { type: String, required: true },
    zip: { type: String, required: true }, phone: { type: String, required: true },
  },
  paymentMethod: { type: String, default: "cod" },
  orderStatus: { type: String, enum: ["processing", "confirmed", "canceled", "shipping", "delivered", "returned"], default: "processing" },
  totalPrice: { type: Number, required: true },
}, { timestamps: true });

const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>("Order", orderSchema);
export default Order;
