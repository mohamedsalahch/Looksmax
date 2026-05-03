import mongoose, { Schema, Document, Model } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";

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

export interface ISizeStockEntry {
  fullStock: number;
  stock: number;
  conditionScore?: number | null;
}

export interface IProduct extends Document {
  name: string;
  price: number;
  isActive: boolean;
  approvalStatus: ProductApprovalStatus;
  categories: string[];
  description: string;
  sizes: string[];
  colors: string[];
  stock: number;
  fullStock?: number;
  sizeStock?: Map<string, ISizeStockEntry> | null;
  colorImages?: Map<string, number[]> | null;
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
  modelId?: string;
  companionSettings?: Map<string, {
    topType?: string;
    topColor?: { name: string; hex: string } | null;
    bottomType?: string;
    bottomColor?: { name: string; hex: string } | null;
    footwearType?: string;
    footwearColor?: { name: string; hex: string } | null;
  }> | null;
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
    sizes: [{ type: String }],
    colors: [{ type: String }],
    stock: { type: Number, default: 1, min: 0 },
    fullStock: { type: Number, default: 1, min: 0 },
    sizeStock: {
      type: Map,
      of: new Schema({
        fullStock: { type: Number, default: 0, min: 0 },
        stock: { type: Number, default: 0, min: 0 },
        conditionScore: { type: Number, min: 0, max: 10, default: null },
      }, { _id: false }),
      default: null,
    },
    colorImages: {
      type: Map,
      of: [Number],
      default: null,
    },
    images: [productImageSchema],
    tag: { type: String, default: "" },
    newTagDurationDays: { type: Number, default: 3, min: 1 },
    brand: { type: String, default: "" },
    reference: { type: String, default: "" },
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
    modelId: { type: String, default: "" },
    companionSettings: {
      type: Map,
      of: new Schema({
        topType: { type: String, default: "" },
        topColor: { type: new Schema({ name: String, hex: String }, { _id: false }), default: null },
        bottomType: { type: String, default: "" },
        bottomColor: { type: new Schema({ name: String, hex: String }, { _id: false }), default: null },
        footwearType: { type: String, default: "" },
        footwearColor: { type: new Schema({ name: String, hex: String }, { _id: false }), default: null },
      }, { _id: false }),
      default: null,
    },
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

productSchema.index({ categories: 1 });
productSchema.index({ name: "text", description: "text" });

if (process.env.NODE_ENV !== "production" && mongoose.models.Product) {
  delete mongoose.models.Product;
}

const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", productSchema);

export default Product;
