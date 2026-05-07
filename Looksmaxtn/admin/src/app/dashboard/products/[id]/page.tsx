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
  storeName?: string;
  storeType?: "thrift" | "retail" | null;
  conditionScore?: number | null;
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
  conditionScore?: number | null;
}

function getProductStatus(product: ProductDetail) {
  if (product.availabilityStatus === "sold") return { label: "Sold", className: "bg-neutral-200 text-neutral-700" };
  if (product.availabilityStatus === "reserved") return { label: "Reserved", className: "bg-warning/10 text-warning" };
  if (product.availabilityStatus === "out-of-stock") return { label: "Out of Stock", className: "bg-danger/10 text-danger" };
  if (product.availabilityStatus === "low-stock") return { label: "Low Stock", className: "bg-warning/10 text-warning" };
  if (product.availabilityStatus === "in-stock") return { label: "In Stock", className: "bg-bg-secondary text-text-secondary" };
  if (product.productType === "perfume") {
    if (product.stock <= 0) return { label: "Out of Stock", className: "bg-danger/10 text-danger" };
    if (product.stock <= 3) return { label: "Low Stock", className: "bg-warning/10 text-warning" };
    return { label: "In Stock", className: "bg-bg-secondary text-text-secondary" };
  }
  return product.stock > 0
    ? { label: "Available", className: "bg-bg-secondary text-text-secondary" }
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
    case "pending":  return { label: "Pending",  className: "bg-warning/10 text-warning" };
    case "rejected": return { label: "Rejected", className: "bg-danger/10 text-danger" };
    case "approved":
    default:         return { label: "Approved", className: "bg-bg-secondary text-text-secondary" };
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
  const [tagDraft, setTagDraft] = useState("");
  const [updatingTag, setUpdatingTag] = useState(false);

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
        setTagDraft(String(nextProduct?.tag || ""));
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
        current ? { ...current, approvalStatus: data.product.approvalStatus || approvalStatus } : current
      );
    } catch {
      // Leave the current state unchanged if the update fails.
    } finally {
      setUpdatingApproval(false);
    }
  };

  const handleTagSave = async () => {
    if (!product || updatingTag || userRole !== "admin") return;
    const nextTag = tagDraft.trim();
    if (nextTag === String(product.tag || "")) return;

    setUpdatingTag(true);
    try {
      const response = await fetch(
        `/api/products/${product._id}`,
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: nextTag }),
        })
      );
      const data = await response.json();
      if (!response.ok || !data.product) return;
      setProduct((current) => (current ? { ...current, tag: String(data.product.tag || "") } : current));
      setTagDraft(String(data.product.tag || ""));
    } catch {
      // Leave the current state unchanged if the update fails.
    } finally {
      setUpdatingTag(false);
    }
  };

  const images = product?.images || [];
  const mainImage = images[selectedImageIndex] || images.find((image) => image.isMain) || images[0];
  const categories = product?.categories || [];
  const details = product?.details || [];
  const isInactive = product?.isActive === false || product?.visibilityStatus === "inactive";
  const canModerateProduct = userRole === "admin";

  if (loading) return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-text-secondary animate-pulse">
      <span className="inline-block h-px w-8 bg-border" />
      Loading product
    </div>
  );
  if (!product) return <p className="text-sm text-text-secondary">Product not found.</p>;

  const status = getProductStatus(product);
  const inventory = getInventorySummary(product);
  const sizeEntries = Object.entries(product.sizeStock || {});
  const hasColorVariants = sizeEntries.some(([label]) => Boolean(formatVariantColor(label)));
  const approvalStatus = product.approvalStatus || "approved";
  const approvalBadge = getApprovalStatusBadge(approvalStatus);

  return (
    <div className="space-y-8">

      {/* ── Top action bar ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="label-meta mb-1">Product</p>
          <h1 className="text-xl sm:text-2xl font-semibold uppercase tracking-wide text-text-primary leading-tight">
            {product.name}
          </h1>
        </div>

        {userRole === "store_owner" ? (
          <Link
            href={`/dashboard/products/${product._id}/edit`}
            className="btn-primary shrink-0"
          >
            Edit
          </Link>
        ) : userRole === "admin" ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleApprovalUpdate("approved")}
              disabled={!canModerateProduct || updatingApproval || approvalStatus === "approved"}
              className="btn-secondary disabled:opacity-40"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => void handleApprovalUpdate("rejected")}
              disabled={!canModerateProduct || updatingApproval || approvalStatus === "rejected"}
              className="border border-danger/40 bg-danger/5 px-4 py-2.5 text-xs font-medium uppercase tracking-[0.2em] text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
            >
              Reject
            </button>
          </div>
        ) : null}
      </div>

      <div className="h-px bg-border" />

      {/* ── Main layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,400px)] gap-8 lg:gap-12">

        {/* Left — images */}
        <div className="space-y-3">
          <div className="relative border border-border overflow-hidden bg-bg-secondary">
            {mainImage?.url ? (
              <>
                <img
                  src={mainImage.url}
                  alt={product.name}
                  className="w-full aspect-[4/3] object-contain bg-bg-secondary"
                />
                <button
                  type="button"
                  onClick={() => setIsZoomOpen(true)}
                  className="absolute right-0 top-0 h-9 w-9 border-b border-l border-border bg-bg-primary/95 text-sm leading-none text-text-primary transition-colors hover:bg-bg-secondary"
                  aria-label="Enlarge product image"
                >
                  +
                </button>
              </>
            ) : (
              <div className="w-full aspect-[4/3] flex items-center justify-center text-xs text-text-secondary uppercase tracking-wider">
                No image
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {images.map((image, index) => (
                <button
                  key={`${image.url}-${index}`}
                  type="button"
                  onClick={() => setSelectedImageIndex(index)}
                  className={`overflow-hidden border bg-bg-card transition-colors ${
                    index === selectedImageIndex ? "border-text-primary" : "border-border hover:border-text-secondary"
                  }`}
                >
                  <img
                    src={image.url}
                    alt={`${product.name} ${index + 1}`}
                    className="h-16 w-full object-cover bg-bg-secondary"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right — details */}
        <div className="space-y-6">

          {/* Price + badges */}
          <div>
            <p className="text-3xl font-semibold tracking-tight text-text-primary">
              {product.price.toFixed(2)} <span className="text-lg font-normal text-text-secondary">TND</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${status.className}`}>
                {status.label}
              </span>
              <span className={`text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${isInactive ? "bg-neutral-200 text-neutral-700" : "bg-bg-secondary text-text-secondary"}`}>
                {isInactive ? "Inactive" : "Active"}
              </span>
              <span className={`text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${approvalBadge.className}`}>
                {approvalBadge.label}
              </span>
            </div>
          </div>

          {canModerateProduct && (
            <div className="space-y-2">
              <p className="label-meta">Tag</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <input
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  placeholder="No tag"
                  className="min-w-0 flex-1 border-0 border-b border-border bg-transparent px-1 py-2 text-sm text-text-primary placeholder:text-text-secondary/70 focus:border-text-primary focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => void handleTagSave()}
                  disabled={updatingTag || tagDraft.trim() === String(product.tag || "")}
                  className="btn-secondary disabled:opacity-40"
                >
                  {updatingTag ? "Saving..." : "Save Tag"}
                </button>
              </div>
            </div>
          )}

          <div className="h-px bg-border" />

          {/* Identity fields */}
          <div className="space-y-4">
            {[
              { label: "Brand",      value: product.brand },
              { label: "Reference",  value: product.reference || "—", mono: true },
              { label: "Product ID", value: product._id, mono: true, wrap: true },
            ].map(({ label, value, mono, wrap }) => (
              <div key={label} className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                <span className="label-meta shrink-0">{label}</span>
                <span className={`text-sm text-text-primary text-right ${mono ? "font-mono" : ""} ${wrap ? "break-all" : ""}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Clone source */}
          {product.productType === "perfume" && product.cloneSourceName && (
            <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
              <span className="label-meta shrink-0">Clone Source</span>
              <span className="text-sm text-text-primary text-right">{product.cloneSourceName}</span>
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div>
              <p className="label-meta mb-2">Description</p>
              <p className="text-sm text-text-secondary leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* Details list */}
          {details.length > 0 && (
            <div>
              <p className="label-meta mb-2">Details</p>
              <ul className="space-y-1">
                {details.map((detail, index) => (
                  <li key={`${detail}-${index}`} className="flex items-start gap-2 text-sm text-text-secondary">
                    <span className="mt-2 h-px w-3 bg-border shrink-0" />
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <p className="label-meta mb-2">Categories</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <span
                    key={category}
                    className="bg-text-primary text-bg-primary px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em]"
                  >
                    {category}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Inventory strip ── */}
      <div className="border-t border-border pt-8">
        <p className="label-meta mb-4">Inventory</p>

        {/* Stock totals */}
        <div className="border-t border-b border-border">
          <div className="grid grid-cols-3">
            {[
              { label: "Full Stock",  value: inventory.full },
              { label: "Available",   value: inventory.available },
              { label: "Sold",        value: inventory.sold },
            ].map(({ label, value }, i) => (
              <div
                key={label}
                className={`py-5 px-4 sm:px-6 flex flex-col gap-1 ${i < 2 ? "border-r border-border" : ""}`}
              >
                <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary">{value}</span>
                <span className="label-meta">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-size breakdown */}
        {sizeEntries.length > 0 && (
          <div className="mt-6">
            <p className="label-meta mb-3">{hasColorVariants ? "By Size & Color" : "By Size"}</p>
            <div>
              {/* Header row */}
              <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,5rem)] gap-x-4 border-b border-border pb-2 mb-1">
                <span className="label-meta">Variant</span>
                <span className="label-meta text-right hidden sm:block">Full</span>
                <span className="label-meta text-right hidden sm:block">Avail</span>
                <span className="label-meta text-right">Sold</span>
              </div>
              {sizeEntries.map(([size, entry]) => {
                const typedEntry = entry as SizeStockEntry;
                const rowLabel = formatVariantLabel(size);
                const rowColor = formatVariantColor(size);
                const hasColor = Boolean(rowColor);
                return (
                  <div
                    key={size}
                    className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(3,5rem)] gap-x-4 border-b border-border py-2.5 items-center hover:bg-bg-secondary/50 transition-colors px-1 -mx-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium uppercase tracking-wider text-text-primary truncate">{rowLabel}</span>
                      {hasColor && (
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <span className="h-3 w-3 border border-border/60" style={{ backgroundColor: rowColor }} />
                          <span className="text-[9px] uppercase tracking-wider text-text-secondary hidden sm:inline">{rowColor}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-text-secondary text-right hidden sm:block tabular-nums">
                      {Math.max(typedEntry.fullStock ?? 0, 0)}
                    </span>
                    <span className="text-xs text-text-secondary text-right hidden sm:block tabular-nums">
                      {Math.max(typedEntry.stock ?? 0, 0)}
                    </span>
                    <span className="text-xs text-text-secondary text-right tabular-nums">
                      {Math.max(typedEntry.soldQuantity ?? 0, 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <AuditMetaCard
        createdAt={product.createdAt}
        updatedAt={product.updatedAt}
        createdBy={product.createdBy}
        updatedBy={product.updatedBy}
      />

      {/* ── Zoom overlay ── */}
      {isZoomOpen && mainImage?.url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-6 py-10"
          onClick={() => setIsZoomOpen(false)}
        >
          <div className="relative max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsZoomOpen(false)}
              className="absolute right-0 top-0 z-10 h-9 w-9 border border-white/30 bg-black/35 text-sm text-white transition-colors hover:bg-black/55"
              aria-label="Close zoomed image"
            >
              ×
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
