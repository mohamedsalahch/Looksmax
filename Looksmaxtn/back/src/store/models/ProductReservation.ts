import mongoose, { Document, Model, Schema } from "mongoose";

export interface IProductReservation extends Document {
  product: mongoose.Types.ObjectId;
  reservationKey: string;
  reservedUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

const productReservationSchema = new Schema<IProductReservation>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, unique: true },
    reservationKey: { type: String, required: true, index: true },
    reservedUntil: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

productReservationSchema.index({ reservedUntil: 1 }, { expireAfterSeconds: 0 });

const ProductReservation: Model<IProductReservation> =
  mongoose.models.ProductReservation ||
  mongoose.model<IProductReservation>("ProductReservation", productReservationSchema);

export default ProductReservation;
