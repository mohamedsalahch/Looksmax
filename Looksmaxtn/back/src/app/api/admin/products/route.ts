import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import Product from "@/admin/models/Product";
import { getSession } from "@/admin/lib/auth";
import { saveProductImages } from "@/admin/lib/productUploads";
import { getConditionStatusFromScore } from "@/admin/lib/productCondition";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";

function getAvailabilityStatus(params: {
  productType?: string;
  stock: number;
}) {
  const { productType, stock } = params;

  if (stock <= 0) return "out-of-stock";
  if (productType === "perfume" && stock <= 3) return "low-stock";
  return productType === "perfume" ? "in-stock" : "available";
}

function parseStringArray(value: FormDataEntryValue | null) {
  return JSON.parse(String(value || "[]")) as string[];
}

function normalizeProductType(value: string) {
  return value === "perfume" ? "perfume" : "fashion";
}

function normalizeOriginPictures(
  productType: string,
  fashionSubtype: string | null,
  current?: Partial<Record<"front" | "back" | "left" | "right", string>>
) {
  if (productType !== "fashion") {
    return { front: "", back: "", left: "", right: "" };
  }

  return {
    front: current?.front || "",
    back: current?.back || "",
    left: fashionSubtype === "shoes" ? current?.left || "" : "",
    right: fashionSubtype === "shoes" ? current?.right || "" : "",
  };
}

function getProductPayload(
  formData: FormData,
  imagePaths: string[],
  mainImageIndex: number,
  cloneSourceImagePath = "",
  originPictures?: Partial<Record<"front" | "back" | "left" | "right", string>>
) {
  const productType = normalizeProductType(String(formData.get("productType") || "fashion"));
  const fashionSubtype =
    productType === "fashion" ? String(formData.get("fashionSubtype") || "clothes") : null;
  const rawStock = Number(formData.get("stock") || 0);
  const conditionScore =
    productType === "perfume" ? null : Number(formData.get("conditionScore") || 7);
  const sizes = productType === "perfume" ? [] : parseStringArray(formData.get("sizes"));
  const colors = productType === "perfume" ? [] : parseStringArray(formData.get("colors"));

  return {
    name: String(formData.get("name") || ""),
    price: Number(formData.get("price") || 0),
    isActive: String(formData.get("isActive") || "true") === "true",
    categories: parseStringArray(formData.get("categories")),
    description: String(formData.get("description") || ""),
    brand: String(formData.get("brand") || "LOOKSMAX"),
    stock: Math.max(0, rawStock),
    tag: String(formData.get("tag") || ""),
    productType,
    fashionSubtype,
    conditionStatus:
      conditionScore === null ? null : getConditionStatusFromScore(conditionScore),
    conditionScore,
    originPictures: normalizeOriginPictures(productType, fashionSubtype, originPictures),
    sizes,
    colors,
    cloneSourceName: productType === "perfume" ? String(formData.get("cloneSourceName") || "") : "",
    cloneSourceImage:
      productType === "perfume" ? cloneSourceImagePath || String(formData.get("cloneSourceImage") || "") : "",
    images: imagePaths.map((url, index) => ({
      url,
      isMain: index === Math.min(mainImageIndex, imagePaths.length - 1),
    })),
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");

    const filter: Record<string, unknown> = {};
    if (category) filter.categories = category;
    if (search) filter.name = { $regex: search, $options: "i" };

    const products = await Product.find(filter).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      products: products.map((product) => ({
        ...product,
        stock: Math.max(product.stock ?? 0, 0),
        availabilityStatus: getAvailabilityStatus({
          productType: product.productType,
          stock: Math.max(product.stock ?? 0, 0),
        }),
        visibilityStatus: product.isActive === false ? "inactive" : "active",
      })),
    });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    await logRequestStart("admin.products.post", req);
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await dbConnect();
    const auditActor = await getAuditActorFromSession(session);
    const formData = await req.formData();
    const imageFiles = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0);
    const cloneSourceImageFile = formData.get("cloneSourceImageFile");
    const originPictureFiles = {
      front: formData.get("originPictureFrontFile"),
      back: formData.get("originPictureBackFile"),
      left: formData.get("originPictureLeftFile"),
      right: formData.get("originPictureRightFile"),
    };

    if (imageFiles.length === 0) {
      return NextResponse.json({ error: "Please upload at least one product image." }, { status: 400 });
    }

    const imagePaths = await saveProductImages(imageFiles);
    const cloneSourceImagePath =
      cloneSourceImageFile instanceof File && cloneSourceImageFile.size > 0
        ? (await saveProductImages([cloneSourceImageFile]))[0]
        : "";
    const originPictures = {
      front:
        originPictureFiles.front instanceof File && originPictureFiles.front.size > 0
          ? (await saveProductImages([originPictureFiles.front]))[0]
          : String(formData.get("originPictureFront") || ""),
      back:
        originPictureFiles.back instanceof File && originPictureFiles.back.size > 0
          ? (await saveProductImages([originPictureFiles.back]))[0]
          : String(formData.get("originPictureBack") || ""),
      left:
        originPictureFiles.left instanceof File && originPictureFiles.left.size > 0
          ? (await saveProductImages([originPictureFiles.left]))[0]
          : String(formData.get("originPictureLeft") || ""),
      right:
        originPictureFiles.right instanceof File && originPictureFiles.right.size > 0
          ? (await saveProductImages([originPictureFiles.right]))[0]
          : String(formData.get("originPictureRight") || ""),
    };
    const mainImageIndex = Math.max(0, Number(formData.get("mainImageIndex") ?? 0));
    const body = getProductPayload(
      formData,
      imagePaths,
      mainImageIndex,
      cloneSourceImagePath,
      originPictures
    );

    const product = await Product.create({
      ...body,
      createdBy: auditActor,
      updatedBy: auditActor,
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) { logRequestError("admin.products.post", req, error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
