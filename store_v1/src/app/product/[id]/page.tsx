import ProductImageGallery from "@/components/ProductImageGallery";
import ProductInfo from "@/components/ProductInfo";
import RelatedProducts from "@/components/RelatedProducts";

// Sample product data — will come from backend later
const sampleProducts: Record<string, {
  name: string;
  price: string;
  brand: string;
  size: string;
  color: string;
  stock: number;
  description: string;
  details: string[];
}> = {
  "1": {
    name: "Relaxed Fit Vintage Wash Jeans",
    price: "35.99",
    brand: "Levi's",
    size: "M / 32",
    color: "Light Blue",
    stock: 1,
    description:
      "Pre-owned relaxed fit jeans in a beautiful vintage wash. Soft, broken-in denim with natural fading and distressing. A timeless piece for any wardrobe.",
    details: [
      "100% Cotton denim",
      "Relaxed fit through thigh",
      "Button fly closure",
      "Five-pocket styling",
      "Condition: Excellent — minimal signs of wear",
      "Era: Early 2000s",
    ],
  },
  "2": {
    name: "Oversized Graphic Print T-Shirt",
    price: "15.99",
    brand: "Stüssy",
    size: "L",
    color: "Black",
    stock: 2,
    description:
      "Vintage oversized graphic tee with bold front print. Heavyweight cotton with a perfectly faded look that only comes with age.",
    details: [
      "100% Heavyweight cotton",
      "Oversized fit",
      "Crew neckline",
      "Screen-printed graphic",
      "Condition: Good — slight fading adds character",
      "Era: Late 90s",
    ],
  },
};

const defaultProduct = {
  name: "Vintage Thrift Find",
  price: "29.99",
  brand: "Unknown",
  size: "M",
  color: "Mixed",
  stock: 1,
  description:
    "A unique thrift find in great condition. One-of-a-kind piece curated for the LOOKSMAX collection.",
  details: [
    "Pre-owned condition",
    "Carefully inspected and cleaned",
    "Unique vintage piece",
    "What you see is what you get",
  ],
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = sampleProducts[id] || defaultProduct;

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
                href="/category/collection"
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
          <ProductImageGallery />

          {/* Right — Info */}
          <div className="md:sticky md:top-[80px] md:self-start">
            <ProductInfo product={{ ...product, id }} />
          </div>
        </div>
      </div>

      {/* Related Products */}
      <RelatedProducts />
    </div>
  );
}
