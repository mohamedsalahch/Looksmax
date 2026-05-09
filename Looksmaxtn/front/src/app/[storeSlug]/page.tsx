import { notFound } from "next/navigation";
import ProductGrid from "@/components/ProductGrid";
import { buildPageMetadata } from "@/lib/seo";

type StoreInfo = {
  id: string;
  name: string;
  slug: string;
  type?: "thrift" | "retail" | null;
};

async function loadStore(slug: string): Promise<StoreInfo | null> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  try {
    const response = await fetch(`${baseUrl}/api/stores/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return data.store || null;
  } catch {
    return null;
  }
}

async function loadStoreProducts(storeName: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const params = new URLSearchParams();
  params.set("store", storeName);
  params.set("includeFacets", "1");
  params.set("limit", "24");

  try {
    const response = await fetch(`${baseUrl}/api/products?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) return { products: [], total: 0, facets: null };
    const data = await response.json();
    return {
      products: data.products || [],
      total: data.total || 0,
      facets: data.facets || null,
    };
  } catch {
    return { products: [], total: 0, facets: null };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await loadStore(storeSlug);
  if (!store) {
    return buildPageMetadata({
      title: "Store not found | LOOKSMAX Tunisia",
      description: "This LOOKSMAX Tunisia store could not be found.",
      path: `/${storeSlug}`,
    });
  }

  return buildPageMetadata({
    title: `${store.name} | LOOKSMAX Tunisia`,
    description: `Shop products from ${store.name} on LOOKSMAX Tunisia.`,
    path: `/${store.slug}`,
  });
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await loadStore(storeSlug);
  if (!store) notFound();

  const initialData = await loadStoreProducts(store.name);

  return (
    <div className="pt-[77px]">
      <section className="border-b border-border-color">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <p className="text-[11px] uppercase tracking-[0.24em] text-text-secondary">
            {store.type ? `${store.type} store` : "Store"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold uppercase tracking-wide text-foreground">
            {store.name}
          </h1>
        </div>
      </section>

      <ProductGrid
        storeName={store.name}
        initialProducts={initialData.products}
        initialTotal={initialData.total}
        initialFacets={initialData.facets}
      />
    </div>
  );
}
