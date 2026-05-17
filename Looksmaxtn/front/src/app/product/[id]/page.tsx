import ProductImageGallery from "@/components/ProductImageGallery";
import ProductInfo from "@/components/ProductInfo";
import RelatedProducts, { type RelatedProduct } from "@/components/RelatedProducts";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import TikTokViewContent from "@/components/TikTokViewContent";
import type { VariantAvailabilityMap } from "@/lib/variantAvailability";
import {
  absoluteUrl,
  buildPageMetadata,
  productAvailability,
  truncateDescription,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

type ProductVariantPayload = {
  _id: string;
  size: string;
  color: string | null;
  stock: number;
  fullStock: number;
  conditionScore?: number | null;
  images: number[];
};

type ProductResponse = {
  product?: {
    _id?: string;
    name: string;
    categories?: string[];
    price: number;
    brand: string;
    storeName?: string;
    storeType?: "thrift" | "retail" | null;
    createdBy?: {
      name?: string;
    } | null;
    images?: { url: string; isMain: boolean }[];
    sizes?: string[];
    colors?: string[];
    variants?: ProductVariantPayload[];
    variantAvailability?: VariantAvailabilityMap | null;
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

function normalizeHexParam(value: string | undefined) {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function resolveInitialSelection(
  variants: ProductVariantPayload[],
  availability: VariantAvailabilityMap | null,
  requestedSize: string,
  requestedColorHex: string,
): { variantId: string; colorHex: string | null } {
  if (variants.length === 0) {
    return { variantId: "", colorHex: requestedColorHex || null };
  }

  const candidates = variants.filter((variant) => {
    if (requestedSize && variant.size !== requestedSize) return false;
    if (requestedColorHex && variant.color?.toLowerCase() !== requestedColorHex) return false;
    return true;
  });
  const pool = candidates.length > 0 ? candidates : variants;

  const available = pool.find((variant) => availability?.[variant._id]?.available);
  const chosen = available || pool[0];
  return {
    variantId: chosen._id,
    colorHex: chosen.color || (requestedColorHex || null),
  };
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
    `${dbProduct.name}${dbProduct.brand ? ` by ${dbProduct.brand}` : ""} available from LOOKSMAX Tunisia.`;

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
  searchParams?: Promise<{ size?: string; color?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedSize = (resolvedSearchParams?.size || "").trim();
  const requestedColorHex = normalizeHexParam(resolvedSearchParams?.color);

  const [dbProduct, relatedProducts] = await Promise.all([
    loadProduct(id),
    loadRelatedProducts(),
  ]);
  if (!dbProduct) {
    notFound();
  }

  const variants = dbProduct.variants || [];
  const variantAvailability = dbProduct.variantAvailability || null;
  const stock = Math.max(dbProduct.stock ?? 0, 0);
  const { variantId: initialSelectedVariantId, colorHex: initialSelectedColorHex } =
    resolveInitialSelection(variants, variantAvailability, requestedSize, requestedColorHex);
  const initialSelectedVariantStock =
    initialSelectedVariantId && variantAvailability?.[initialSelectedVariantId]
      ? variantAvailability[initialSelectedVariantId].stock
      : stock;

  const product = {
    name: dbProduct.name,
    categories: dbProduct.categories || [],
    price: dbProduct.price.toFixed(2),
    brand: dbProduct.brand || "",
    storeName: dbProduct.storeName || dbProduct.createdBy?.name || "",
    storeType: dbProduct.storeType || null,
    image: dbProduct.images?.find((image) => image.isMain)?.url || dbProduct.images?.[0]?.url || "",
    images: dbProduct.images || [],
    variants,
    variantAvailability,
    stock,
    initialSelectedVariantId,
    initialSelectedVariantStock,
    initialSelectedColorHex,
    description: dbProduct.description || "",
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
      availability: productAvailability(product.initialSelectedVariantStock),
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
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-secondary">
            <li>
              <Link href="/" className="hover:text-foreground transition-colors">
                HOME
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link
                href="/category/all"
                className="hidden md:inline hover:text-foreground transition-colors"
              >
                COLLECTION
              </Link>
            </li>
            <li>/</li>
            <li className="text-foreground">{product.name}</li>
          </ol>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          <ProductImageGallery
            images={product.images as { url: string; isMain: boolean }[]}
            variants={product.variants}
            initialColorHex={initialSelectedColorHex}
          />

          <div className="md:sticky md:top-[80px] md:self-start">
            <ProductInfo product={{ ...product, id: productId }} />
          </div>
        </div>
      </div>

      <RelatedProducts products={relatedProducts} />
    </div>
  );
}
