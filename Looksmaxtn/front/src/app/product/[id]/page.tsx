import ProductImageGallery from "@/components/ProductImageGallery";
import ProductInfo from "@/components/ProductInfo";
import RelatedProducts from "@/components/RelatedProducts";
import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import ProductReservation from "@/models/ProductReservation";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const defaultProduct: {
  name: string;
  categories?: string[];
  price: string;
  brand: string;
  image?: string;
  size?: string;
  sizes?: string[];
  stock: number;
  description: string;
    images: { url: string; isMain: boolean }[];
    reservationExpiresAt: string | null;
    cartCount?: number;
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
    const now = new Date();
    const [dbProduct, activeCartPresences] = await Promise.all([
      Product.findById(id).lean(),
      ProductReservation.find({ product: id, reservedUntil: { $gt: now } })
        .select("product reservedUntil")
        .lean(),
    ]);
    const cartCount = activeCartPresences.length;
    if (dbProduct && dbProduct.isActive === false) {
      notFound();
    }
    if (dbProduct) {
      product = {
        name: dbProduct.name,
        categories: dbProduct.categories || [],
        price: dbProduct.price.toFixed(2),
        brand: dbProduct.brand || "LOOKSMAX",
        image: dbProduct.images?.find((image) => image.isMain)?.url || dbProduct.images?.[0]?.url || "",
        sizes: dbProduct.sizes || [],
        stock: Math.max(dbProduct.stock ?? 0, 0),
        description: dbProduct.description || "",
        images: dbProduct.images || [],
        reservationExpiresAt: null,
        cartCount,
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
