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

export interface ISizeStockEntry {
  fullStock: number;
  stock: number;
}

export interface IProduct extends Document {
  name: string;
  store?: mongoose.Types.ObjectId | null;
  storeNameSnapshot?: string;
  price: number;
  isActive: boolean;
  categories: string[];
  description: string;
  sizes: string[];
  colors: string[];
  stock: number;
  fullStock?: number;
  sizeStock?: Map<string, ISizeStockEntry> | null;
  images: IProductImage[];
  tag?: string;
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

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    storeNameSnapshot: { type: String, default: "Looksmaxtn" },
    price: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    categories: [{ type: String, lowercase: true, trim: true }],
    description: { type: String, default: "" },
    sizes: [{ type: String }],
    colors: [{ type: String }],
    stock: { type: Number, default: 1, min: 0 },
    fullStock: { type: Number, default: 1, min: 0 },
    sizeStock: {
      type: Map,
      of: new Schema({ fullStock: { type: Number, default: 0, min: 0 }, stock: { type: Number, default: 0, min: 0 } }, { _id: false }),
      default: null,
    },
    images: [productImageSchema],
    tag: { type: String, default: "" },
    brand: { type: String, default: "LOOKSMAX" },
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
    createdBy: { type: auditActorSchema, default: null },
    updatedBy: { type: auditActorSchema, default: null },
  },
  { timestamps: true }
);

productSchema.index({ categories: 1 });
productSchema.index({ store: 1, createdAt: -1 });
productSchema.index({ store: 1, isActive: 1 });
productSchema.index({ name: "text", description: "text" });

if (process.env.NODE_ENV !== "production" && mongoose.models.Product) {
  delete mongoose.models.Product;
}

const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", productSchema);

export default Product;
