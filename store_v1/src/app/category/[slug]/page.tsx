import CategoryNav from "@/components/CategoryNav";
import ProductGrid from "@/components/ProductGrid";

// Map slugs to display names
const categoryNames: Record<string, string> = {
  "new": "New Arrivals",
  "t-shirts": "T-Shirts",
  "polos": "Polos",
  "jeans": "Jeans",
  "trousers": "Trousers",
  "shorts": "Shorts",
  "shirts": "Shirts",
  "sweat": "Sweatshirts",
  "jackets": "Jackets",
  "knits": "Knits & Cardigans",
  "shoes": "Shoes",
  "accessories": "Accessories",
  "promotions": "Promotions",
  "swim": "Swim",
  "linen": "Linen",
  "sportswear": "Sportswear",
  "total-look": "Total Look",
  "basics": "Basics",
  "bags": "Bags & Backpacks",
  "collaborations": "Collaborations",
  "special-collection": "Special Collection",
  "stwd": "STWD",
  "community": "Community Stories",
  "collection": "Collection",
};

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const categoryName = categoryNames[slug] || slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");

  return (
    <div className="pt-[57px]">
      <CategoryNav activeSlug={slug} />

      {/* Category header */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <h1 className="text-sm font-medium tracking-wide">{categoryName}</h1>
        <p className="text-xs text-text-secondary mt-1">24 products</p>
      </div>

      <ProductGrid />
    </div>
  );
}
