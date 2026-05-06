"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { withAuthRequest } from "@/lib/authClient";

interface Category {
  _id: string;
  name: string;
  slug: string;
  parentSlug?: string | null;
  order?: number;
}

interface Product {
  _id: string; name: string; price: number; categories: string[];
  stock: number; availableStock?: number; soldQuantity?: number; fullStock?: number; tag: string; brand: string; reference?: string; createdAt: string; productType?: "fashion" | "perfume" | "clothing" | "shoes"; availabilityStatus?: string; isActive?: boolean; visibilityStatus?: string; approvalStatus?: "pending" | "approved" | "rejected"; images?: Array<{ url: string; isMain: boolean }>; originPictures?: { front?: string; back?: string; left?: string; right?: string };
}

type SortKey = "name" | "_id" | "categories" | "productType" | "price" | "stock" | "status" | "approval" | "visibility" | "tag";
type SortDirection = "asc" | "desc";

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
    return { label: "In Stock", className: "bg-bg-secondary text-text-secondary" };
  }

  if (product.productType === "perfume") {
    if (product.stock <= 0) {
      return { label: "Out of Stock", className: "bg-danger/10 text-danger" };
    }
    if (product.stock <= 3) {
      return { label: "Low Stock", className: "bg-warning/10 text-warning" };
    }
    return { label: "In Stock", className: "bg-bg-secondary text-text-secondary" };
  }

  return product.stock > 0
    ? { label: "Available", className: "bg-bg-secondary text-text-secondary" }
    : { label: "Reserved", className: "bg-warning/10 text-warning" };
}

function getApprovalStatus(product: Product) {
  switch (product.approvalStatus || "approved") {
    case "pending":
      return { label: "Pending", className: "bg-warning/10 text-warning" };
    case "rejected":
      return { label: "Rejected", className: "bg-danger/10 text-danger" };
    default:
      return { label: "Approved", className: "bg-bg-secondary text-text-secondary" };
  }
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [togglingVisibilityId, setTogglingVisibilityId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [userRole, setUserRole] = useState("");
  const deferredSearch = useDeferredValue(search);
  const canManageProducts = userRole === "store_owner";
  const canToggleVisibility = userRole === "store_owner" || userRole === "admin";

  const fetchProducts = () => {
    fetch("/api/products", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const fetchCategories = () => {
    fetch("/api/categories", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetch("/api/auth/me", withAuthRequest()).then((r) => r.json()).then((d) => setUserRole(d.user?.role || "")).catch(() => {});
    fetchProducts();
    fetchCategories();
  }, []);

  const handleToggleVisibility = async (product: Product) => {
    setTogglingVisibilityId(product._id);
    try {
      const response = await fetch(`/api/products/${product._id}`, withAuthRequest({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !(product.isActive !== false) }),
      }));
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

      const matchesCategory =
        categoryFilter === "all" ||
        (product.categories || []).includes(categoryFilter);

      const isInactive = product.isActive === false || product.visibilityStatus === "inactive";
      const normalizedApprovalStatus = product.approvalStatus || "approved";
      const matchesVisibility =
        visibilityFilter === "all" ||
        (visibilityFilter === "active" && !isInactive) ||
        (visibilityFilter === "inactive" && isInactive);
      const matchesApproval =
        approvalFilter === "all" || normalizedApprovalStatus === approvalFilter;

      return matchesSearch && matchesCategory && matchesVisibility && matchesApproval;
    });
  }, [approvalFilter, categoryFilter, deferredSearch, products, visibilityFilter]);

  const categoryOptions = useMemo(() => {
    const bySlug = new Map(categories.map((category) => [category.slug, category]));
    const buildLabel = (category: Category) => {
      const segments = [category.name];
      let cursor = category.parentSlug ? bySlug.get(category.parentSlug) : null;
      while (cursor) {
        segments.unshift(cursor.name);
        cursor = cursor.parentSlug ? bySlug.get(cursor.parentSlug) : null;
      }
      return segments.join(" / ");
    };

    return [...categories]
      .sort((a, b) => {
        const aPath = buildLabel(a);
        const bPath = buildLabel(b);
        return aPath.localeCompare(bPath, undefined, { numeric: true, sensitivity: "base" });
      })
      .map((category) => ({
        value: category.slug,
        label: buildLabel(category),
      }));
  }, [categories]);

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
        case "price":
          return product.price;
        case "stock":
          return product.availableStock ?? product.stock;
        case "status":
          return getProductStatus(product).label;
        case "approval":
          return product.approvalStatus || "approved";
        case "visibility":
          return product.isActive === false || product.visibilityStatus === "inactive" ? "inactive" : "active";
        case "tag":
          return product.tag || "";
        default:
          return product.createdAt;
      }
    };

    items.sort((a, b) => {
      const left = getSortableValue(a);
      const right = getSortableValue(b);

      let comparison = 0;
      if (typeof left === "number" && typeof right === "number") {
        comparison = left - right;
      } else {
        comparison = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return items;
  }, [filteredProducts, sortDirection, sortKey]);

  const getProductThumbnail = (product: Product) =>
    product.originPictures?.front || product.images?.find((image) => image.isMain)?.url || product.images?.[0]?.url || "";

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
    return <span className="text-[9px] text-accent">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-wide">Products</h1>
        {canManageProducts ? (
          <Link href="/dashboard/products/new" className="inline-flex w-full justify-center bg-text-primary text-bg-primary px-4 py-2 text-xs font-semibold tracking-wide uppercase hover:bg-accent transition-colors sm:w-auto">
            + Add Product
          </Link>
        ) : (
          <span className="inline-flex w-full justify-center bg-bg-secondary text-text-secondary px-4 py-2 text-xs font-semibold tracking-wide uppercase sm:w-auto">
            Product Access
          </span>
        )}
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, brand, tag, category, or ID..."
          className="bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-text-primary transition-colors"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-text-primary transition-colors"
        >
          <option value="all">All categories</option>
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value)}
          className="bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-text-primary transition-colors"
        >
          <option value="all">All visibility</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          value={approvalFilter}
          onChange={(e) => setApprovalFilter(e.target.value)}
          className="bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-text-primary transition-colors"
        >
          <option value="all">All approvals</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : filteredProducts.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">No products found</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-none">
          <table className="min-w-[760px] w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 cursor-pointer">
                    Product {renderSortIndicator("name")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("categories")} className="inline-flex items-center gap-1 cursor-pointer">
                    Category {renderSortIndicator("categories")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <span className="inline-flex items-center gap-1">Reference</span>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("price")} className="inline-flex items-center gap-1 cursor-pointer">
                    Price {renderSortIndicator("price")}
                  </button>
                </th>
                <th className="px-4 py-3">Picture</th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("status")} className="inline-flex items-center gap-1 cursor-pointer">
                    Status {renderSortIndicator("status")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("approval")} className="inline-flex items-center gap-1 cursor-pointer">
                    Approval {renderSortIndicator("approval")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("visibility")} className="inline-flex items-center gap-1 cursor-pointer">
                    Visibility {renderSortIndicator("visibility")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("tag")} className="inline-flex items-center gap-1 cursor-pointer">
                    Tag {renderSortIndicator("tag")}
                  </button>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedProducts.map((p) => (
                <tr
                  key={p._id}
                  onClick={() => router.push(`/dashboard/products/${p._id}`)}
                  className="cursor-pointer hover:bg-bg-hover transition-colors"
                >
                  {(() => {
                    const status = getProductStatus(p);
                    const approval = getApprovalStatus(p);
                    return (
                      <>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium">{p.name}</p>
                    <p className="text-[10px] text-text-secondary">{p.brand}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary capitalize">{(p.categories || []).join(", ")}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{p.reference || "—"}</td>
                  <td className="px-4 py-3 text-xs font-medium">{p.price.toFixed(2)} TND</td>
                  <td className="px-4 py-3">
                    <div className="flex h-16 w-16 overflow-hidden rounded border border-border bg-bg-secondary">
                      {getProductThumbnail(p) ? (
                        <img
                          src={getProductThumbnail(p)}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-text-secondary">
                          No image
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-2">
                      <span className={`text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${approval.className}`}>
                        {approval.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {canToggleVisibility ? (
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
                          className={`absolute inset-0 rounded-full transition-colors ${
                            p.isActive === false || p.visibilityStatus === "inactive"
                              ? "bg-bg-secondary"
                              : "bg-[#d7c08c]"
                          }`}
                        />
                        <span
                          className={`absolute top-[2px] h-5 w-5 rounded-full bg-bg-primary shadow-sm ring-1 ring-black/5 transition-all duration-200 ease-out ${
                            p.isActive === false || p.visibilityStatus === "inactive"
                              ? "left-[2px]"
                              : "left-[26px]"
                          }`}
                        />
                      </button>
                    ) : (
                      <span className={`text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${p.isActive === false || p.visibilityStatus === "inactive" ? "bg-neutral-200 text-neutral-700" : "bg-bg-secondary text-text-secondary"}`}>
                        {p.isActive === false || p.visibilityStatus === "inactive" ? "Inactive" : "Active"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.tag && <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 font-medium uppercase">{p.tag}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canManageProducts ? (
                        <>
                          <Link
                            href={`/dashboard/products/${p._id}/edit`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center border border-accent bg-accent px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-bg-primary transition-colors hover:bg-accent rounded-none"
                          >
                            Edit
                          </Link>
                        </>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider text-text-secondary">
                          View only
                        </span>
                      )}
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
