"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Product {
  _id: string; name: string; price: number; categories: string[];
  stock: number; tag: string; brand: string; createdAt: string; productType?: "fashion" | "perfume" | "clothing" | "shoes";
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

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
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium">{p.name}</p>
                    <p className="text-[10px] text-text-secondary">{p.brand}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary capitalize">{(p.categories || []).join(", ")}</td>
                  <td className="px-4 py-3 text-xs font-medium">{p.price.toFixed(2)} TND</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${p.stock > 0 ? "text-warning" : "text-danger"}`}>
                      {p.productType === "perfume"
                        ? `${p.stock} in stock`
                        : p.stock > 0
                          ? "1 / unique"
                          : "reserved"}
                    </span>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
