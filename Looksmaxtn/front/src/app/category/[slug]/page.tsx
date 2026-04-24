import CategoryNav from "@/components/CategoryNav";
import ProductGrid from "@/components/ProductGrid";

function formatSlug(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
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

  // Fetch category name from API (server-side)
  let categoryName = formatSlug(slug);
  if (slug === "new" || slug === "new-arrivals") {
    categoryName = "New Arrivals";
  } else {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const res = await fetch(`${baseUrl}/api/categories`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const match = data.categories?.find(
          (c: { slug: string; name: string }) => c.slug === slug
        );
        if (match) categoryName = match.name;
      }
    } catch {
      // fallback to formatted slug
    }
  }
  const initialData = await loadCategoryData(slug);

  return (
    <div className="pt-[57px]">
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
