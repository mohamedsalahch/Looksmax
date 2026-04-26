import CategoryNav from "@/components/CategoryNav";
import ProductGrid from "@/components/ProductGrid";
import { buildPageMetadata } from "@/lib/seo";

function formatSlug(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

async function loadCategoryName(slug: string) {
  if (slug === "new" || slug === "new-arrivals") return "New Arrivals";

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/categories`, { cache: "no-store" });
    if (!res.ok) return formatSlug(slug);
    const data = await res.json();
    const match = data.categories?.find((category: { slug: string; name: string }) => category.slug === slug);
    return match?.name || formatSlug(slug);
  } catch {
    return formatSlug(slug);
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const categoryName = await loadCategoryName(slug);

  return buildPageMetadata({
    title: `${categoryName} | LOOKSMAX Tunisia`,
    description: `Shop ${categoryName.toLowerCase()} at LOOKSMAX Tunisia. Discover curated men's fashion, shoes, perfumes, and outfit essentials.`,
    path: `/category/${slug}`,
  });
}

async function loadCategoryData(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const params = new URLSearchParams();
  params.set("category", slug);
  params.set("includeFacets", "1");
  params.set("limit", "24");

  const response = await fetch(`${baseUrl}/api/products?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    return { products: [], total: 0, facets: null };
  }

  const data = await response.json();
  return {
    products: data.products || [],
    total: data.total || 0,
    facets: data.facets || null,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const initialData = await loadCategoryData(slug);

  return (
    <div className="pt-[77px]">
      <CategoryNav activeSlug={slug} />

      <ProductGrid
        category={slug}
        initialProducts={initialData.products}
        initialTotal={initialData.total}
        initialFacets={initialData.facets}
      />
    </div>
  );
}
