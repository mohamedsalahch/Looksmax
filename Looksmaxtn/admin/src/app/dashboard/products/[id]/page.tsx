"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import AuditMetaCard from "@/components/AuditMetaCard";
import { withAuthRequest } from "@/lib/authClient";

interface ProductImage {
  url: string;
  isMain: boolean;
}

interface AuditActor {
  id: string;
  name: string;
  email: string;
}

interface ProductDetail {
  _id: string;
  name: string;
  price: number;
  categories?: string[];
  description: string;
  details?: string[];
  sizes?: string[];
  colors?: string[];
  stock: number;
  availableStock?: number;
  soldQuantity?: number;
  fullStock?: number;
  sizeStock?: Record<string, { fullStock: number; stock: number; soldQuantity: number }> | null;
  images?: ProductImage[];
  tag?: string;
  brand: string;
  reference?: string;
  productType?: "fashion" | "perfume" | "clothing" | "shoes";
  availabilityStatus?: string;
  isActive?: boolean;
  visibilityStatus?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  cloneSourceName?: string;
  createdBy?: AuditActor | null;
  updatedBy?: AuditActor | null;
  createdAt: string;
  updatedAt: string;
}

interface SizeStockEntry {
  fullStock: number;
  stock: number;
  soldQuantity: number;
}

function getProductStatus(product: ProductDetail) {
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
    return { label: "In Stock", className: "bg-[#f1ede8] text-[#6b6055]" };
  }

  if (product.productType === "perfume") {
    if (product.stock <= 0) {
      return { label: "Out of Stock", className: "bg-danger/10 text-danger" };
    }
    if (product.stock <= 3) {
      return { label: "Low Stock", className: "bg-warning/10 text-warning" };
    }
    return { label: "In Stock", className: "bg-[#f1ede8] text-[#6b6055]" };
  }

  return product.stock > 0
    ? { label: "Available", className: "bg-[#f1ede8] text-[#6b6055]" }
    : { label: "Reserved", className: "bg-warning/10 text-warning" };
}

function getInventorySummary(product: ProductDetail) {
  const available = Math.max(product.availableStock ?? product.stock ?? 0, 0);
  const sold = Math.max(product.soldQuantity ?? 0, 0);
  const full = Math.max(product.fullStock ?? available + sold, 0);
  return { available, sold, full };
}

function getApprovalStatusBadge(approvalStatus: ProductDetail["approvalStatus"] | string) {
  switch (approvalStatus) {
    case "pending":
      return { label: "Pending", className: "bg-warning/10 text-warning" };
    case "rejected":
      return { label: "Rejected", className: "bg-danger/10 text-danger" };
    case "approved":
    default:
      return { label: "Approved", className: "bg-[#f1ede8] text-[#6b6055]" };
  }
}

function formatVariantLabel(label: string) {
  const [size] = label.split(" / ");
  return size?.trim() || label.trim();
}

function formatVariantColor(label: string) {
  const parts = label.split(" / ");
  if (parts.length < 2) return "";
  const color = parts[parts.length - 1]?.trim() || "";
  return color.startsWith("#") ? color.toUpperCase() : color;
}

export default function ProductViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [updatingApproval, setUpdatingApproval] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setUserRole(d.user?.role || ""))
      .catch(() => {});

    fetch(`/api/products/${id}`, withAuthRequest())
      .then((r) => r.json())
      .then((data) => {
        const nextProduct = data.product || null;
        setProduct(nextProduct);
        const nextImages = nextProduct?.images || [];
        const mainIndex = nextImages.findIndex((image: ProductImage) => image.isMain);
        setSelectedImageIndex(mainIndex >= 0 ? mainIndex : 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleApprovalUpdate = async (approvalStatus: "approved" | "rejected") => {
    if (!product || updatingApproval) return;

    setUpdatingApproval(true);

    try {
      const response = await fetch(
        `/api/products/${product._id}`,
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalStatus }),
        })
      );
      const data = await response.json();
      if (!response.ok || !data.product) return;

      setProduct((current) =>
        current
          ? {
              ...current,
              approvalStatus: data.product.approvalStatus || approvalStatus,
            }
          : current
      );
    } catch {
      // Leave the current state unchanged if the update fails.
    } finally {
      setUpdatingApproval(false);
    }
  };

  const images = product?.images || [];
  const mainImage = images[selectedImageIndex] || images.find((image) => image.isMain) || images[0];
  const categories = product?.categories || [];
  const details = product?.details || [];
  const isInactive = product?.isActive === false || product?.visibilityStatus === "inactive";
  const canModerateProduct = userRole === "admin";

  if (loading) return <p className="text-xs text-text-secondary animate-pulse">Loading product...</p>;
  if (!product) return <p className="text-sm text-text-secondary">Product not found.</p>;

  const status = getProductStatus(product);
  const inventory = getInventorySummary(product);
  const sizeEntries = Object.entries(product.sizeStock || {});
  const hasColorVariants = sizeEntries.some(([label]) => Boolean(formatVariantColor(label)));
  const approvalStatus = product.approvalStatus || "approved";
  const approvalBadge = getApprovalStatusBadge(approvalStatus);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-end gap-4">
        {userRole === "store_owner" ? (
          <Link
            href={`/dashboard/products/${product._id}/edit`}
            className="bg-accent text-bg-primary px-4 py-2 text-xs font-semibold tracking-wide uppercase hover:bg-accent-hover transition-colors"
          >
            Edit Product
          </Link>
        ) : userRole === "admin" ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleApprovalUpdate("approved")}
              disabled={!canModerateProduct || updatingApproval || approvalStatus === "approved"}
              className="border border-border bg-bg-card px-4 py-2 text-[10px] uppercase tracking-wider text-[#6b6055] transition-colors hover:text-text-primary disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => void handleApprovalUpdate("rejected")}
              disabled={!canModerateProduct || updatingApproval || approvalStatus === "rejected"}
              className="border border-border bg-bg-card px-4 py-2 text-[10px] uppercase tracking-wider text-danger transition-colors hover:text-danger/80 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        ) : (
          <span className="bg-bg-secondary text-text-secondary px-4 py-2 text-xs font-semibold tracking-wide uppercase">
            View Only
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,420px)] gap-6">
        <div className="space-y-4">
          <div className="relative bg-bg-card border border-border rounded overflow-hidden">
            {mainImage?.url ? (
              <>
                <img
                  src={mainImage.url}
                  alt={product.name}
                  className="w-full aspect-[16/11] object-contain bg-bg-secondary"
                />
                <button
                  type="button"
                  onClick={() => setIsZoomOpen(true)}
                  className="absolute right-3 top-3 h-9 w-9 border border-border bg-bg-primary/95 text-lg leading-none text-text-primary transition-colors hover:bg-bg-secondary"
                  aria-label="Enlarge product image"
                >
                  +
                </button>
              </>
            ) : (
              <div className="w-full aspect-[16/11] bg-bg-secondary flex items-center justify-center text-xs text-text-secondary uppercase tracking-wider">
                No image
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {images.map((image, index) => (
                <button
                  key={`${image.url}-${index}`}
                  type="button"
                  onClick={() => setSelectedImageIndex(index)}
                  className={`overflow-hidden rounded border bg-bg-card transition-colors ${
                    index === selectedImageIndex ? "border-accent" : "border-border hover:border-text-secondary"
                  }`}
                >
                  <img
                    src={image.url}
                    alt={`${product.name} ${index + 1}`}
                    className="h-24 w-full object-cover bg-bg-secondary"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-bg-card border border-border rounded p-4 space-y-3">
            <p className="text-xs text-text-secondary uppercase tracking-wider">Product Summary</p>
            <div className="space-y-2 border-b border-border pb-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Name</p>
                <p className="mt-1 text-base font-semibold text-text-primary">{product.name}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Brand</p>
                <p className="mt-1 text-sm text-text-primary">{product.brand}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Reference</p>
                <p className="mt-1 text-sm text-text-primary font-mono">{product.reference || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Product ID</p>
                <p className="mt-1 text-sm text-text-primary font-mono break-all">{product._id}</p>
              </div>
            </div>
            <p className="text-2xl font-semibold">{product.price.toFixed(2)} TND</p>
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex w-fit text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${status.className}`}>
                {status.label}
              </span>
              <div className={`inline-flex w-fit text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${isInactive ? "bg-neutral-200 text-neutral-700" : "bg-[#f1ede8] text-[#6b6055]"}`}>
                {isInactive ? "Inactive" : "Active"}
              </div>
              <span className={`inline-flex w-fit text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${approvalBadge.className}`}>
                {approvalBadge.label}
              </span>
            </div>
          </div>

          {product.productType === "perfume" && product.cloneSourceName && (
            <div className="bg-bg-card border border-border rounded p-4">
              <p className="text-xs text-text-secondary uppercase tracking-wider">Clone Source</p>
              <p className="mt-1 text-sm text-text-primary">{product.cloneSourceName}</p>
            </div>
          )}

          {product.description && (
            <div className="bg-bg-card border border-border rounded p-4">
              <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">Description</p>
              <p className="text-sm text-text-secondary leading-relaxed">{product.description}</p>
            </div>
          )}

          {details.length > 0 && (
            <div className="bg-bg-card border border-border rounded p-4">
              <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">Details</p>
              <ul className="space-y-1.5">
                {details.map((detail, index) => (
                  <li key={`${detail}-${index}`} className="text-sm text-text-secondary">
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-bg-card border border-border rounded p-4 space-y-4">
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wider">Stock Panel</p>
              <p className="mt-1 text-xs text-text-secondary">
                Full stock is the total inventory you set. Available is full minus sold.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border border-border rounded bg-bg-secondary p-3">
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Full</p>
                <p className="mt-2 text-xl font-semibold">{inventory.full}</p>
              </div>
              <div className="border border-border rounded bg-bg-secondary p-3">
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Available</p>
                <p className="mt-2 text-xl font-semibold">{inventory.available}</p>
              </div>
              <div className="border border-border rounded bg-bg-secondary p-3">
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Sold</p>
                <p className="mt-2 text-xl font-semibold">{inventory.sold}</p>
              </div>
            </div>

            {sizeEntries.length > 0 && (
              <div className="border border-border rounded bg-bg-secondary p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                  {hasColorVariants ? "By Size and Color" : "By Size"}
                </p>
                <div className="space-y-2">
                  {sizeEntries.map(([size, entry]) => {
                    const typedEntry = entry as SizeStockEntry;
                    const hasColor = Boolean(formatVariantColor(size));
                    const rowLabel = formatVariantLabel(size);
                    const rowColor = formatVariantColor(size);
                    return (
                      <div
                        key={size}
                        className="flex items-center justify-between gap-3 border border-border bg-bg-card px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium uppercase tracking-wider">{rowLabel}</p>
                            {hasColor && (
                              <span className="inline-flex items-center gap-1 rounded border border-border bg-bg-secondary px-2 py-0.5 text-[9px] uppercase tracking-wider text-text-secondary">
                                <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ backgroundColor: rowColor }} />
                                {rowColor}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-text-secondary">
                            Available {Math.max(typedEntry.stock ?? 0, 0)} | Full {Math.max(typedEntry.fullStock ?? 0, 0)} | Sold {Math.max(typedEntry.soldQuantity ?? 0, 0)}
                          </p>
                        </div>
                        <div className="text-right text-[10px] uppercase tracking-wider text-text-secondary">
                          <p>Stock: {Math.max(typedEntry.stock ?? 0, 0)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-bg-card border border-border rounded p-4">
            <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Categories</p>
            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <span
                    key={category}
                    className="text-[10px] bg-bg-secondary text-text-primary px-2 py-1 font-medium uppercase tracking-wider"
                  >
                    {category}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-secondary">No categories assigned.</p>
            )}
          </div>
        </div>
      </div>

      <AuditMetaCard
        createdAt={product.createdAt}
        updatedAt={product.updatedAt}
        createdBy={product.createdBy}
        updatedBy={product.updatedBy}
      />

      {isZoomOpen && mainImage?.url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-6 py-10"
          onClick={() => setIsZoomOpen(false)}
        >
          <div
            className="relative max-h-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsZoomOpen(false)}
              className="absolute right-3 top-3 z-10 h-9 w-9 border border-white/30 bg-black/35 text-sm text-white transition-colors hover:bg-black/55"
              aria-label="Close zoomed image"
            >
              X
            </button>
            <img
              src={mainImage.url}
              alt={`${product.name} enlarged`}
              className="max-h-[85vh] w-auto max-w-full object-contain bg-bg-secondary"
            />
          </div>
        </div>
      )}
    </div>
  );
}
