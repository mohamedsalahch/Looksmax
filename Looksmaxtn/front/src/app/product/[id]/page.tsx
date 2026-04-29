import ProductImageGallery from "@/components/ProductImageGallery";
import ProductInfo from "@/components/ProductInfo";
import RelatedProducts, { type RelatedProduct } from "@/components/RelatedProducts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDefaultSelectableSize, getSelectedSizeStock } from "@/lib/sizeAvailability";
import JsonLd from "@/components/JsonLd";
import TikTokViewContent from "@/components/TikTokViewContent";
import {
  absoluteUrl,
  buildPageMetadata,
  productAvailability,
  truncateDescription,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

type ProductResponse = {
  product?: {
    _id?: string;
    name: string;
    categories?: string[];
    price: number;
    brand: string;
    images?: { url: string; isMain: boolean }[];
    sizes?: string[];
    sizeAvailability?: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null;
    stock: number;
    description: string;
    reservationExpiresAt?: string | null;
    cartCount?: number;
    reservedElsewhere?: boolean;
    ownedReservation?: boolean;
    blockedByOrder?: boolean;
    conditionScore?: number | null;
    conditionStatus?: string | null;
    productType?: "fashion" | "perfume" | "clothing" | "shoes";
    fashionSubtype?: "clothes" | "shoes" | null;
    originPictures?: {
      front?: string;
      back?: string;
      left?: string;
      right?: string;
    };
    cloneSourceName?: string;
    cloneSourceImage?: string;
  };
};

async function loadProduct(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/products/${id}`, { cache: "no-store" });
  if (!response.ok) return null;

  const data = (await response.json()) as ProductResponse;
  return data.product || null;
}

async function loadRelatedProducts(): Promise<RelatedProduct[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  try {
    const response = await fetch(`${baseUrl}/api/products?limit=4`, { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return data.products || [];
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dbProduct = await loadProduct(id);
  if (!dbProduct) {
    return buildPageMetadata({
      title: "Product Not Found | LOOKSMAX Tunisia",
      description: "This LOOKSMAX product is no longer available.",
      path: `/product/${id}`,
      noIndex: true,
    });
  }

  const image = dbProduct.images?.find((item) => item.isMain)?.url || dbProduct.images?.[0]?.url || "";
  const description =
    dbProduct.description ||
    `${dbProduct.name} by ${dbProduct.brand || "LOOKSMAX"} available from LOOKSMAX Tunisia.`;

  return buildPageMetadata({
    title: `${dbProduct.name} | LOOKSMAX Tunisia`,
    description,
    path: `/product/${id}`,
    image,
  });
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ size?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedSize = resolvedSearchParams?.size || "";

  const [dbProduct, relatedProducts] = await Promise.all([
    loadProduct(id),
    loadRelatedProducts(),
  ]);
  if (!dbProduct) {
    notFound();
  }

  const sizes = (dbProduct.sizes?.length ? dbProduct.sizes : Object.keys(dbProduct.sizeAvailability || {})).filter((size) =>
    Boolean(size && size.trim())
  );
  const sizeAvailability = dbProduct.sizeAvailability || null;
  const stock = Math.max(dbProduct.stock ?? 0, 0);
  const initialSelectedSize = requestedSize && sizes.includes(requestedSize)
    ? requestedSize
    : getDefaultSelectableSize(sizes, sizeAvailability);
  const initialSelectedSizeStock = getSelectedSizeStock(sizeAvailability, initialSelectedSize, stock);

  const product = {
    name: dbProduct.name,
    categories: dbProduct.categories || [],
    price: dbProduct.price.toFixed(2),
    brand: dbProduct.brand || "LOOKSMAX",
    image: dbProduct.images?.find((image) => image.isMain)?.url || dbProduct.images?.[0]?.url || "",
    sizes,
    stock: Math.max(dbProduct.stock ?? 0, 0),
    sizeAvailability,
    initialSelectedSize,
    initialSelectedSizeStock,
    description: dbProduct.description || "",
    images: dbProduct.images || [],
    reservationExpiresAt: null,
    cartCount: dbProduct.cartCount ?? 0,
    reservedElsewhere: Boolean(dbProduct.reservedElsewhere),
    ownedReservation: Boolean(dbProduct.ownedReservation),
    blockedByOrder: Boolean(dbProduct.blockedByOrder),
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
  const productId = String(dbProduct._id || id);
  const productUrl = absoluteUrl(`/product/${productId}`);
  const productImages = product.images
    .map((image) => image.url)
    .filter(Boolean)
    .map((image) => absoluteUrl(image));
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: truncateDescription(product.description || `${product.name} by ${product.brand}`),
    image: productImages,
    brand: {
      "@type": "Brand",
      name: product.brand,
    },
    sku: productId,
    category: product.categories[0] || undefined,
    url: productUrl,
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "TND",
      price: dbProduct.price.toFixed(2),
      availability: productAvailability(product.initialSelectedSizeStock),
      itemCondition:
        product.conditionStatus === "new"
          ? "https://schema.org/NewCondition"
          : "https://schema.org/UsedCondition",
    },
  };

  return (
    <div className="pt-[80px]">
      <JsonLd data={productJsonLd} />
      <TikTokViewContent
        contentId={productId}
        contentName={product.name}
        value={dbProduct.price}
      />
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
                className="hidden md:inline hover:text-foreground transition-colors"
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
      <RelatedProducts products={relatedProducts} />
    </div>
  );
}
