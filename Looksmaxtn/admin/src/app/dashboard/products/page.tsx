"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Product {
  _id: string; name: string; price: number; categories: string[];
  stock: number; tag: string; brand: string; createdAt: string; productType?: "fashion" | "perfume" | "clothing" | "shoes"; availabilityStatus?: string; isActive?: boolean; visibilityStatus?: string;
}

function getProductStatus(product: Product) {
  if (product.availabilityStatus === "sold") {
    return { label: "Sold", className: "bg-neutral-200 text-neutral-700" };
  }
  if (product.availabilityStatus === "reserved") {
    return { label: "Reserved", className: "bg-warning/10 text-warning" };
  }
  if (product.availabilityStatus === "out-of-stock") {
    return { label: "Out of Stock", className: "bg-danger/10 text-danger" };
  }
  if (product.availabilityStatus === "low-stock") {
    return { label: "Low Stock", className: "bg-warning/10 text-warning" };
  }
  if (product.availabilityStatus === "in-stock") {
    return { label: "In Stock", className: "bg-success/10 text-success" };
  }

  if (product.productType === "perfume") {
    if (product.stock <= 0) {
      return { label: "Out of Stock", className: "bg-danger/10 text-danger" };
    }
    if (product.stock <= 3) {
      return { label: "Low Stock", className: "bg-warning/10 text-warning" };
    }
    return { label: "In Stock", className: "bg-success/10 text-success" };
  }

  return product.stock > 0
    ? { label: "Available", className: "bg-success/10 text-success" }
    : { label: "Reserved", className: "bg-warning/10 text-warning" };
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [togglingVisibilityId, setTogglingVisibilityId] = useState("");

  const fetchProducts = (q?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    fetch(`/api/products?${params}`).then((r) => r.json()).then((d) => setProducts(d.products || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    fetchProducts(search);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    setProducts((p) => p.filter((x) => x._id !== id));
  };

  const handleToggleVisibility = async (product: Product) => {
    setTogglingVisibilityId(product._id);
    try {
      const response = await fetch(`/api/products/${product._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !(product.isActive !== false) }),
      });
      const data = await response.json();
      if (!response.ok || !data.product) return;

      setProducts((current) =>
        current.map((entry) =>
          entry._id === product._id
            ? {
                ...entry,
                isActive: data.product.isActive,
                visibilityStatus: data.product.isActive === false ? "inactive" : "active",
              }
            : entry
        )
      );
    } catch {
      // Leave current state unchanged on network failure.
    } finally {
      setTogglingVisibilityId("");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold tracking-wide">Products</h1>
        <Link href="/dashboard/products/new" className="bg-accent text-bg-primary px-4 py-2 text-xs font-semibold tracking-wide uppercase hover:bg-accent-hover transition-colors">
          + Add Product
        </Link>
      </div>

      <form onSubmit={handleSearch} className="mb-6 flex gap-3">
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="flex-1 bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        />
        <button type="submit" className="bg-bg-card border border-border px-6 py-2.5 text-xs font-medium uppercase tracking-wider hover:bg-bg-hover transition-colors cursor-pointer">
          Search
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : products.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">No products found</p>
        </div>
      ) : (
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Visibility</th>
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => (
                <tr
                  key={p._id}
                  onClick={() => router.push(`/dashboard/products/${p._id}`)}
                  className="cursor-pointer hover:bg-bg-hover transition-colors"
                >
                  {(() => {
                    const status = getProductStatus(p);
                    return (
                      <>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium">{p.name}</p>
                    <p className="text-[10px] text-text-secondary">{p.brand}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary capitalize">{(p.categories || []).join(", ")}</td>
                  <td className="px-4 py-3 text-xs font-medium">{p.price.toFixed(2)} TND</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-text-primary">
                      {p.productType === "perfume" ? p.stock : p.stock > 0 ? "1" : "0"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggleVisibility(p);
                      }}
                      disabled={togglingVisibilityId === p._id}
                      className={`group relative inline-flex h-6 w-12 items-center transition-opacity ${
                        togglingVisibilityId === p._id ? "opacity-60" : ""
                      }`}
                      aria-label={`Toggle visibility for ${p.name}`}
                    >
                      <span
                        className={`absolute inset-0 transition-colors ${
                          p.isActive === false || p.visibilityStatus === "inactive"
                            ? "bg-[#d9d3c9]"
                            : "bg-[#d7c08c]"
                        }`}
                      />
                      <span
                        className={`absolute top-[2px] h-5 w-5 bg-[#1a1a1a] transition-all duration-200 ease-out ${
                          p.isActive === false || p.visibilityStatus === "inactive"
                            ? "left-[2px]"
                            : "left-[25px]"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {p.tag && <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 font-medium uppercase">{p.tag}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/products/${p._id}/edit`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] text-info hover:text-info/80 transition-colors uppercase font-medium"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(p._id);
                        }}
                        className="text-[10px] text-danger hover:text-danger/80 transition-colors uppercase font-medium cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
