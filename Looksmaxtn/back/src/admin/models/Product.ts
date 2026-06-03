import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { type IAuditActor, auditActorSchema } from "@/admin/lib/audit";

export interface IProductImage {
  url: string;
  isMain: boolean;
  isPublic?: boolean;
  source?: string;
  color?: string | null;
  sourceKey?: string;
  /**
   * For unisex products, which gendered model this picture depicts so the front
   * can show the male model under Men and the female model under Women. Null /
   * undefined = gender-neutral (original product shots, single-gender products).
   */
  gender?: "men" | "women" | null;
}

export interface IOriginPictures {
  front: string;
  back: string;
  left: string;
  right: string;
}

export type ProductType = "fashion" | "perfume" | "clothing" | "shoes";
export type ProductApprovalStatus = "pending" | "approved" | "rejected";

export interface IProductVariant {
  _id: Types.ObjectId;
  size: string;
  color: string | null;
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
  gender?: "men" | "women" | "children" | "unisex" | null;
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
  modelId?: string;
  companionSettings?: Map<string, {
    topType?: string;
    topColor?: { name: string; hex: string } | null;
    bottomType?: string;
    bottomColor?: { name: string; hex: string } | null;
    footwearType?: string;
    footwearColor?: { name: string; hex: string } | null;
    additionalInstructions?: string;
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
    isPublic: { type: Boolean, default: true },
    source: { type: String, default: "" },
    color: { type: String, default: null },
    sourceKey: { type: String, default: "" },
    gender: { type: String, enum: ["men", "women"], default: null },
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

const productVariantSchema = new Schema<IProductVariant>({
  size: { type: String, default: "", trim: true },
  color: { type: String, default: null, trim: true, lowercase: true },
  fullStock: { type: Number, default: 0, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  conditionScore: { type: Number, min: 0, max: 10, default: null },
  images: { type: [Number], default: [] },
});

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, default: "", trim: true },
    price: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    categories: [{ type: String, lowercase: true, trim: true }],
    gender: {
      type: String,
      enum: ["men", "women", "children", "unisex"],
      default: null,
    },
    description: { type: String, default: "" },
    stock: { type: Number, default: 0, min: 0 },
    fullStock: { type: Number, default: 0, min: 0 },
    variants: { type: [productVariantSchema], default: [] },
    images: [productImageSchema],
    tag: { type: String, default: "" },
    newTagDurationDays: { type: Number, default: 3, min: 1 },
    brand: { type: String, default: "" },
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
        additionalInstructions: { type: String, default: "" },
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
productSchema.index({ "variants._id": 1 });
productSchema.index({ "variants.color": 1, "variants.size": 1 });
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
