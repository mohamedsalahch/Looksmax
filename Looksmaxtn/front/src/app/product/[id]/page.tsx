import ProductImageGallery from "@/components/ProductImageGallery";
import ProductInfo from "@/components/ProductInfo";
import RelatedProducts from "@/components/RelatedProducts";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";
import ProductReservation from "@/models/ProductReservation";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const BLOCKING_ORDER_STATUSES = ["processing", "confirmed", "shipping"];
const HIDDEN_ORDER_STATUSES = ["delivered"];

const defaultProduct: {
  name: string;
  price: string;
  brand: string;
  image?: string;
  size?: string;
  stock: number;
  description: string;
  images: { url: string; isMain: boolean }[];
  reservationExpiresAt: string | null;
  conditionScore?: number | null;
  conditionStatus?: string | null;
  productType: "fashion" | "perfume" | "clothing" | "shoes";
  fashionSubtype?: "clothes" | "shoes" | null;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
  cloneSourceName?: string;
  cloneSourceImage?: string;
} = {
  name: "Vintage Thrift Find",
  price: "29.99",
  brand: "Unknown",
  image: "",
  size: "M",
  stock: 1,
  description:
    "A unique thrift find in great condition. One-of-a-kind piece curated for the LOOKSMAX collection.",
  images: [{ url: "", isMain: true }],
  reservationExpiresAt: null,
  conditionScore: 7,
  conditionStatus: "used",
  productType: "fashion",
  fashionSubtype: "clothes",
  originPictures: {
    front: "",
    back: "",
    left: "",
    right: "",
  },
  cloneSourceName: "",
  cloneSourceImage: "",
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let product = defaultProduct;
  let productId = id;

  try {
    await dbConnect();
    const now = new Date();
    const [dbProduct, activeOrders, activeReservation] = await Promise.all([
      Product.findById(id).lean(),
      Order.find({
        orderStatus: { $in: ["processing", "confirmed", "shipping", "delivered"] },
        "items.product": id,
      })
        .select("orderStatus items.product items.quantity")
        .lean(),
      ProductReservation.findOne({ product: id, reservedUntil: { $gt: now } })
        .select("reservedUntil")
        .lean(),
    ]);
    const hasBlockingOrder = activeOrders.some((order) =>
      BLOCKING_ORDER_STATUSES.includes(order.orderStatus)
    );
    const hasHiddenOrder =
      dbProduct?.productType !== "perfume" &&
      activeOrders.some((order) => order.orderStatus === "delivered");
    const perfumeQuantityInOrders = activeOrders.reduce((sum, order) => {
      const quantity = order.items
        .filter((item) => item.product?.toString() === id)
        .reduce((itemSum, item) => itemSum + (item.quantity || 0), 0);
      return sum + quantity;
    }, 0);
    if (hasHiddenOrder) {
      notFound();
    }
    if (dbProduct) {
      product = {
        name: dbProduct.name,
        price: dbProduct.price.toFixed(2),
        brand: dbProduct.brand || "LOOKSMAX",
        image: dbProduct.images?.find((image) => image.isMain)?.url || dbProduct.images?.[0]?.url || "",
        size: dbProduct.sizes?.[0] || "",
        stock:
          dbProduct.productType === "perfume"
            ? Math.max((dbProduct.stock ?? 0) - perfumeQuantityInOrders, 0)
            : hasBlockingOrder || activeReservation
              ? 0
              : Math.min(dbProduct.stock ?? 1, 1),
        description: dbProduct.description || "",
        images: dbProduct.images || [],
        reservationExpiresAt:
          dbProduct.productType === "perfume"
            ? null
            : activeReservation?.reservedUntil?.toISOString() || null,
        conditionScore: dbProduct.conditionScore ?? null,
        conditionStatus: dbProduct.conditionStatus || null,
        productType: dbProduct.productType || "fashion",
        fashionSubtype: dbProduct.fashionSubtype || "clothes",
        originPictures: {
          front: dbProduct.originPictures?.front || "",
          back: dbProduct.originPictures?.back || "",
          left: dbProduct.originPictures?.left || "",
          right: dbProduct.originPictures?.right || "",
        },
        cloneSourceName: dbProduct.cloneSourceName || "",
        cloneSourceImage: dbProduct.cloneSourceImage || "",
      };
      productId = dbProduct._id.toString();
    }
  } catch {
    // Use default product if DB is unavailable
  }

  return (
    <div className="pt-[72px]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-xs text-text-secondary">
            <li>
              <a href="/" className="hover:text-foreground transition-colors">
                Home
              </a>
            </li>
            <li>/</li>
            <li>
              <a
                href="/category/all"
                className="hover:text-foreground transition-colors"
              >
                Collection
              </a>
            </li>
            <li>/</li>
            <li className="text-foreground">{product.name}</li>
          </ol>
        </nav>

        {/* Product Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          {/* Left — Images */}
          <ProductImageGallery images={product.images as { url: string; isMain: boolean }[]} />

          {/* Right — Info */}
          <div className="md:sticky md:top-[80px] md:self-start">
            <ProductInfo product={{ ...product, id: productId }} />
          </div>
        </div>
      </div>

      {/* Related Products */}
      <RelatedProducts />
    </div>
  );
}
