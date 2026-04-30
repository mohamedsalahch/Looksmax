"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StoreDashboardShell from "@/components/StoreDashboardShell";
import { withAuthRequest } from "@/lib/authClient";

interface Product {
  _id: string;
  store?: string;
  name: string;
  price: number;
  categories: string[];
  stock: number;
  availableStock?: number;
  soldQuantity?: number;
  fullStock?: number;
  tag: string;
  brand: string;
  reference?: string;
  productType?: "fashion" | "perfume" | "clothing" | "shoes";
  availabilityStatus?: string;
  isActive?: boolean;
  visibilityStatus?: string;
}

type SortKey = "name" | "_id" | "categories" | "productType" | "price" | "stock" | "status" | "visibility" | "tag";
type SortDirection = "asc" | "desc";

function getProductStatus(product: Product) {
  if (product.availabilityStatus === "sold") return { label: "Sold", className: "bg-neutral-200 text-neutral-700" };
  if (product.availabilityStatus === "reserved") return { label: "Reserved", className: "bg-[#f6ead3] text-[#8a5b13]" };
  if (product.availabilityStatus === "out-of-stock") return { label: "Out of Stock", className: "bg-[#faf3f2] text-[#430C05]" };
  if (product.availabilityStatus === "low-stock") return { label: "Low Stock", className: "bg-[#f6ead3] text-[#8a5b13]" };
  if (product.availabilityStatus === "in-stock") return { label: "In Stock", className: "bg-[#f1ede8] text-[#6b6055]" };

  return product.stock > 0
    ? { label: "Available", className: "bg-[#f1ede8] text-[#6b6055]" }
    : { label: "Reserved", className: "bg-[#f6ead3] text-[#8a5b13]" };
}

function formatStockLabel(product: Product) {
  const available = Math.max(product.availableStock ?? product.stock ?? 0, 0);
  const sold = Math.max(product.soldQuantity ?? 0, 0);
  const full = Math.max(product.fullStock ?? available + sold, 0);
  return `Available: ${available} · Sold: ${sold} · Full: ${full}`;
}

export default function StoreProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    fetch("/api/products", withAuthRequest())
      .then((response) => response.json())
      .then((data) => setProducts(data.products || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/products/${id}`, withAuthRequest({ method: "DELETE" }));
    setProducts((current) => current.filter((product) => product._id !== id));
  };

  const filteredProducts = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          product._id,
          product.name,
          product.brand,
          product.reference,
          product.tag,
          ...(product.categories || []),
        ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));

      const normalizedProductType = product.productType === "clothing" ? "fashion" : product.productType || "fashion";
      const matchesType = typeFilter === "all" || normalizedProductType === typeFilter;
      const isInactive = product.isActive === false || product.visibilityStatus === "inactive";
      const matchesVisibility =
        visibilityFilter === "all" ||
        (visibilityFilter === "active" && !isInactive) ||
        (visibilityFilter === "inactive" && isInactive);

      return matchesSearch && matchesType && matchesVisibility;
    });
  }, [deferredSearch, products, typeFilter, visibilityFilter]);

  const sortedProducts = useMemo(() => {
    const items = [...filteredProducts];

    const getSortableValue = (product: Product) => {
      switch (sortKey) {
        case "name":
          return product.name;
        case "_id":
          return product._id;
        case "categories":
          return (product.categories || []).join(", ");
        case "productType":
          return product.productType === "perfume" ? "perfume" : "fashion";
        case "price":
          return product.price;
        case "stock":
          return product.availableStock ?? product.stock;
        case "status":
          return getProductStatus(product).label;
        case "visibility":
          return product.isActive === false || product.visibilityStatus === "inactive" ? "inactive" : "active";
        case "tag":
          return product.tag || "";
        default:
          return product.name;
      }
    };

    items.sort((a, b) => {
      const left = getSortableValue(a);
      const right = getSortableValue(b);
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return items;
  }, [filteredProducts, sortDirection, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-[9px] text-text-secondary/60">↕</span>;
    return <span className="text-[9px] text-foreground">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <StoreDashboardShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-text-secondary">Store</p>
          <h1 className="text-xl font-semibold tracking-wide text-foreground">Products</h1>
        </div>
        <Link href="/products/new" className="inline-flex w-full justify-center bg-foreground px-4 py-2 text-xs font-semibold uppercase tracking-wide text-background transition-colors hover:bg-accent sm:w-auto">
          + Add Product
        </Link>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, brand, tag, category, or ID..."
          className="border border-border-color bg-surface/40 px-4 py-2.5 text-sm text-foreground transition-colors placeholder:text-text-secondary/70 focus:border-foreground"
        />
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="border border-border-color bg-surface/40 px-4 py-2.5 text-sm text-foreground transition-colors focus:border-foreground"
        >
          <option value="all">All types</option>
          <option value="fashion">Fashion</option>
          <option value="perfume">Perfume</option>
        </select>
        <select
          value={visibilityFilter}
          onChange={(event) => setVisibilityFilter(event.target.value)}
          className="border border-border-color bg-surface/40 px-4 py-2.5 text-sm text-foreground transition-colors focus:border-foreground"
        >
          <option value="all">All visibility</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : filteredProducts.length === 0 ? (
        <div className="border border-border-color border-dashed p-8 text-center">
          <p className="text-sm text-text-secondary">No products found</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border-color">
          <table className="min-w-[760px] w-full text-left">
            <thead className="bg-surface/70">
              <tr className="text-[10px] uppercase tracking-wider text-text-secondary">
                <th className="px-4 py-3">Store</th>
                {[
                  ["name", "Product"],
                  ["_id", "ID"],
                  ["categories", "Category"],
                  ["productType", "Type"],
                  ["price", "Price"],
                  ["stock", "Inventory"],
                  ["status", "Status"],
                  ["visibility", "Visibility"],
                  ["tag", "Tag"],
                  ["actions", "Actions"],
                ].map(([key, label]) => (
                  <th key={key} className="px-4 py-3">
                    <button type="button" onClick={() => toggleSort(key as SortKey)} className="inline-flex items-center gap-1">
                      {label} {renderSortIndicator(key as SortKey)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color">
              {sortedProducts.map((product) => {
                const status = getProductStatus(product);
                const inactive = product.isActive === false || product.visibilityStatus === "inactive";
                return (
                  <tr key={product._id} className="transition-colors hover:bg-hover/60">
                    <td className="px-4 py-3 text-xs text-text-secondary">{product.store || "Your store"}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium">{product.name}</p>
                      <p className="text-[10px] text-text-secondary">{product.brand}</p>
                    </td>
                    <td className="px-4 py-3 text-[10px] text-text-secondary">{product._id}</td>
                    <td className="px-4 py-3 text-xs capitalize text-text-secondary">{(product.categories || []).join(", ")}</td>
                    <td className="px-4 py-3 text-xs capitalize text-text-secondary">
                      {product.productType === "perfume" ? "Perfume" : "Fashion"}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">{Number(product.price || 0).toFixed(2)} TND</td>
                    <td className="px-4 py-3 text-xs font-medium text-foreground">{formatStockLabel(product)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] uppercase tracking-wider text-text-secondary">
                        {inactive ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {product.tag && <span className="bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase text-foreground">{product.tag}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/products/${product._id}/edit`} className="text-[10px] font-medium uppercase tracking-wider text-foreground underline underline-offset-4">
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(product._id)}
                          className="text-[10px] font-medium uppercase tracking-wider text-[#430C05] underline underline-offset-4"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </StoreDashboardShell>
  );
}
