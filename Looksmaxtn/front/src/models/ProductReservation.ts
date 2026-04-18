import mongoose, { Document, Model, Schema } from "mongoose";

export interface IProductReservation extends Document {
  product: mongoose.Types.ObjectId;
  reservationKey: string;
  quantity: number;
  reservedUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

const productReservationSchema = new Schema<IProductReservation>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    reservationKey: { type: String, required: true, index: true },
    quantity: { type: Number, required: true, default: 1, min: 1 },
    reservedUntil: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

productReservationSchema.index({ reservedUntil: 1 }, { expireAfterSeconds: 0 });
productReservationSchema.index({ product: 1, reservationKey: 1 }, { unique: true });

const ProductReservation: Model<IProductReservation> =
  mongoose.models.ProductReservation ||
  mongoose.model<IProductReservation>("ProductReservation", productReservationSchema);

export default ProductReservation;
