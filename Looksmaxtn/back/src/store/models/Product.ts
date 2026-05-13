import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/store/lib/audit";

export interface IProductImage {
  url: string;
  isMain: boolean;
}

export interface IOriginPictures {
  front: string;
  back: string;
  left: string;
  right: string;
}

export type ProductType = "fashion" | "perfume" | "clothing" | "shoes";
export type ProductApprovalStatus = "pending" | "approved" | "rejected";

export interface IVariantColor {
  name: string;
  hex: string;
}

export interface IProductVariant {
  _id: Types.ObjectId;
  size: string;
  color: IVariantColor | null;
  fullStock: number;
  stock: number;
  conditionScore?: number | null;
  images: number[];
}

export interface IProduct extends Document {
  name: string;
  price: number;
  isActive: boolean;
  approvalStatus: ProductApprovalStatus;
  categories: string[];
  description: string;
  stock: number;
  fullStock: number;
  variants: Types.DocumentArray<IProductVariant>;
  images: IProductImage[];
  tag?: string;
  newTagDurationDays?: number;
  brand: string;
  reference?: string;
  productType: ProductType;
  fashionSubtype?: "clothes" | "shoes" | null;
  conditionStatus?: "new" | "like new" | "good" | "used" | null;
  conditionScore?: number | null;
  originPictures?: IOriginPictures;
  cloneSourceName?: string;
  cloneSourceImage?: string;
  createdBy?: IAuditActor | null;
  updatedBy?: IAuditActor | null;
  createdAt: Date;
  updatedAt: Date;
}

const productImageSchema = new Schema<IProductImage>(
  {
    url: { type: String, required: true },
    isMain: { type: Boolean, default: false },
  },
  { _id: false }
);

const originPicturesSchema = new Schema<IOriginPictures>(
  {
    front: { type: String, default: "" },
    back: { type: String, default: "" },
    left: { type: String, default: "" },
    right: { type: String, default: "" },
  },
  { _id: false }
);

const variantColorSchema = new Schema<IVariantColor>(
  {
    name: { type: String, required: true, trim: true },
    hex: { type: String, required: true, trim: true, lowercase: true },
  },
  { _id: false }
);

const productVariantSchema = new Schema<IProductVariant>({
  size: { type: String, default: "", trim: true },
  color: { type: variantColorSchema, default: null },
  fullStock: { type: Number, default: 0, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  conditionScore: { type: Number, min: 0, max: 10, default: null },
  images: { type: [Number], default: [] },
});

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    categories: [{ type: String, lowercase: true, trim: true }],
    description: { type: String, default: "" },
    stock: { type: Number, default: 0, min: 0 },
    fullStock: { type: Number, default: 0, min: 0 },
    variants: { type: [productVariantSchema], default: [] },
    images: [productImageSchema],
    tag: { type: String, default: "" },
    newTagDurationDays: { type: Number, default: 3, min: 1 },
    brand: { type: String, default: "LOOKSMAX" },
    reference: { type: String, default: "", trim: true },
    productType: {
      type: String,
      enum: ["fashion", "perfume", "clothing", "shoes"],
      default: "fashion",
    },
    fashionSubtype: {
      type: String,
      enum: ["clothes", "shoes"],
      default: null,
    },
    conditionStatus: {
      type: String,
      enum: ["new", "like new", "good", "used"],
      default: null,
    },
    conditionScore: { type: Number, min: 0, max: 10, default: null },
    originPictures: { type: originPicturesSchema, default: () => ({}) },
    cloneSourceName: { type: String, default: "" },
    cloneSourceImage: { type: String, default: "" },
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

productSchema.index({ categories: 1 });
productSchema.index({ name: "text", description: "text" });
productSchema.index({ "variants._id": 1 });
productSchema.index({ "variants.color.hex": 1, "variants.size": 1 });
productSchema.index(
  { "createdBy.id": 1, reference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      "createdBy.id": { $type: "string" },
      reference: { $type: "string", $ne: "" },
    },
  }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Product) {
  delete mongoose.models.Product;
}

const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", productSchema);

export default Product;
