"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

interface ProductImage {
  url: string;
  isMain: boolean;
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
  images?: ProductImage[];
  tag?: string;
  brand: string;
  productType?: "fashion" | "perfume" | "clothing" | "shoes";
  cloneSourceName?: string;
  createdAt: string;
  updatedAt: string;
}

export default function ProductViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    fetch(`/api/products/${id}`)
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

  const images = product?.images || [];
  const mainImage = images[selectedImageIndex] || images.find((image) => image.isMain) || images[0];
  const categories = product?.categories || [];
  const sizes = product?.sizes || [];
  const colors = product?.colors || [];
  const details = product?.details || [];

  if (loading) return <p className="text-xs text-text-secondary animate-pulse">Loading product...</p>;
  if (!product) return <p className="text-sm text-text-secondary">Product not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/products"
            className="text-xs text-text-secondary hover:text-text-primary transition-colors mb-2 inline-block"
          >
            ← Back
          </Link>
          <h1 className="text-lg font-semibold">{product.name}</h1>
          <p className="text-xs text-text-secondary mt-1">
            {product.brand} · ID <span className="font-mono">{product._id}</span>
          </p>
        </div>
        <Link
          href={`/dashboard/products/${product._id}/edit`}
          className="bg-accent text-bg-primary px-4 py-2 text-xs font-semibold tracking-wide uppercase hover:bg-accent-hover transition-colors"
        >
          Edit Product
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,420px)] gap-6">
        <div className="space-y-4">
          <div className="bg-bg-card border border-border rounded overflow-hidden">
            {mainImage?.url ? (
              <img
                src={mainImage.url}
                alt={product.name}
                className="w-full aspect-[16/11] object-contain bg-bg-secondary"
              />
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
            <p className="text-2xl font-semibold">{product.price.toFixed(2)} TND</p>
            <div className="flex flex-wrap gap-2">
              {product.tag && (
                <span className="text-[10px] bg-accent/10 text-accent px-2 py-1 font-medium uppercase tracking-wider">
                  {product.tag}
                </span>
              )}
              {product.productType && (
                <span className="text-[10px] bg-bg-secondary text-text-secondary px-2 py-1 font-medium uppercase tracking-wider">
                  {product.productType}
                </span>
              )}
              <span className="text-[10px] bg-bg-secondary text-text-secondary px-2 py-1 font-medium uppercase tracking-wider">
                Stock {product.stock}
              </span>
            </div>
            {product.productType === "perfume" && product.cloneSourceName && (
              <p className="text-xs text-text-secondary">
                Clones <span className="text-text-primary">{product.cloneSourceName}</span>
              </p>
            )}
            {product.description && <p className="text-sm text-text-secondary leading-relaxed">{product.description}</p>}
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

          <div className="bg-bg-card border border-border rounded p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">Sizes</p>
              <p className="text-sm text-text-primary">{sizes.length > 0 ? sizes.join(", ") : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">Colors</p>
              <p className="text-sm text-text-primary">{colors.length > 0 ? colors.join(", ") : "—"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-bg-card border border-border rounded p-4">
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Details</p>
        {details.length > 0 ? (
          <ul className="space-y-2">
            {details.map((detail, index) => (
              <li key={`${detail}-${index}`} className="text-sm text-text-secondary">
                {detail}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">No extra product details.</p>
        )}
      </div>
    </div>
  );
}
