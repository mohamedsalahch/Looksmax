import ProductImageGallery from "@/components/ProductImageGallery";
import ProductInfo from "@/components/ProductInfo";
import RelatedProducts from "@/components/RelatedProducts";
import { getSession } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";
import ProductReservation from "@/models/ProductReservation";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function getSizeStockEntries(
  sizeStock: unknown
): Array<[string, { fullStock?: number; stock?: number }]> {
  if (sizeStock instanceof Map) {
    return Array.from(sizeStock.entries());
  }

  if (!sizeStock || typeof sizeStock !== "object") return [];

  return Object.entries(sizeStock as Record<string, { fullStock?: number; stock?: number }>);
}

function buildSizeAvailability(
  sizeStock: unknown
): Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null {
  const entries = getSizeStockEntries(sizeStock);
  if (entries.length === 0) return null;

  return Object.fromEntries(
    entries.map(([size, entry]) => [
      size,
      {
        stock: Math.max(entry.stock ?? 0, 0),
        available: Math.max(entry.stock ?? 0, 0) > 0,
        reservedElsewhere: false,
      },
    ])
  );
}

const defaultProduct: {
  name: string;
  categories?: string[];
  price: string;
  brand: string;
  image?: string;
    size?: string;
    sizes?: string[];
    stock: number;
    sizeAvailability?: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null;
    description: string;
    images: { url: string; isMain: boolean }[];
    reservationExpiresAt: string | null;
    cartCount?: number;
    reservedElsewhere?: boolean;
    ownedReservation?: boolean;
    blockedByOrder?: boolean;
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
  categories: [],
  price: "29.99",
  brand: "Unknown",
  image: "",
  sizes: [],
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
    const session = await getSession();
    const currentUserId = session?.userId || null;
    const reservationKey = currentUserId ? `user:${currentUserId}` : null;
    const now = new Date();
    const [dbProduct, activeOrders, activeReservations] = await Promise.all([
      Product.findById(id).lean(),
      Order.find({
        orderStatus: { $in: ["processing", "confirmed", "shipping"] },
        "items.product": id,
      })
        .select("user items.product")
        .lean(),
      ProductReservation.find({ product: id, reservedUntil: { $gt: now } })
        .select("reservationKey quantity")
        .lean(),
    ]);
    const ownedReservationQuantity = activeReservations
      .filter((reservation) => reservation.reservationKey === reservationKey)
      .reduce((sum, reservation) => sum + Math.max(1, Number(reservation.quantity) || 1), 0);
    const reservedByOthersQuantity = activeReservations
      .filter((reservation) => reservation.reservationKey !== reservationKey)
      .reduce((sum, reservation) => sum + Math.max(1, Number(reservation.quantity) || 1), 0);
    const activeOrderReservation = activeOrders.reduce(
      (state, order) => {
        const orderUserId = String(order.user || "");
        const isOwnedByCurrentUser = currentUserId ? orderUserId === currentUserId : false;
        for (const item of order.items || []) {
          if (item.product?.toString?.() !== id) continue;
          if (isOwnedByCurrentUser) state.ownedReservation = true;
          else state.reservedElsewhere = true;
        }
        return state;
      },
      { reservedElsewhere: false, ownedReservation: false }
    );
    const stock = Math.max(dbProduct?.stock ?? 0, 0);
    const cartReservedElsewhere = reservedByOthersQuantity > 0 && reservedByOthersQuantity >= stock;
    const blockedByOrder =
      stock <= 0 && (activeOrderReservation.reservedElsewhere || activeOrderReservation.ownedReservation);
    const ownedReservation = activeOrderReservation.ownedReservation;
    const productReservedElsewhere = cartReservedElsewhere;
    if (
      dbProduct &&
      stock <= 0 &&
      !blockedByOrder &&
      !productReservedElsewhere &&
      !ownedReservation
    ) {
      notFound();
    }
    if (dbProduct) {
      const sizeAvailability = buildSizeAvailability((dbProduct as { sizeStock?: unknown }).sizeStock);
      product = {
        name: dbProduct.name,
        categories: dbProduct.categories || [],
        price: dbProduct.price.toFixed(2),
        brand: dbProduct.brand || "LOOKSMAX",
        image: dbProduct.images?.find((image) => image.isMain)?.url || dbProduct.images?.[0]?.url || "",
        sizes: dbProduct.sizes || [],
        stock,
        sizeAvailability,
        description: dbProduct.description || "",
        images: dbProduct.images || [],
        reservationExpiresAt: null,
        cartCount: activeReservations.reduce((sum, reservation) => sum + Math.max(1, Number(reservation.quantity) || 1), 0),
        reservedElsewhere: productReservedElsewhere,
        ownedReservation,
        blockedByOrder,
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
              <Link href="/" className="hover:text-foreground transition-colors">
                Home
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link
                href="/category/all"
                className="hover:text-foreground transition-colors"
              >
                Collection
              </Link>
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
