"use client";

import { useEffect, useState } from "react";
import ProductCard from "./ProductCard";

interface ProductImage {
  url: string;
  isMain: boolean;
}

interface Product {
  _id: string;
  name: string;
  price: number;
  stock: number;
  reservationExpiresAt?: string | null;
  tag?: string;
  images?: ProductImage[];
  conditionScore?: number | null;
  conditionStatus?: string | null;
  productType?: "fashion" | "perfume" | "clothing" | "shoes";
  fashionSubtype?: "clothes" | "shoes" | null;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
  cloneSourceName?: string;
  cloneSourceImage?: string;
}

function getMainImage(images?: ProductImage[]): string | undefined {
  if (!images || images.length === 0) return undefined;
  const main = images.find((i) => i.isMain);
  return main?.url || images[0]?.url;
}

export default function ProductGrid({ category }: { category?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = () => {
      const params = new URLSearchParams();
      if (category) params.set("category", category);

      fetch(`/api/products?${params}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setProducts(data.products || []);
          setTotal(data.total || 0);
        })
        .catch(() => {
          if (cancelled) return;
          setProducts([]);
          setTotal(0);
        })
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });
    };

    loadProducts();
    const interval = window.setInterval(loadProducts, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [category]);

  if (!loaded) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[3/4] bg-border-color rounded" />
              <div className="mt-2 h-3 bg-border-color rounded w-3/4" />
              <div className="mt-1 h-3 bg-border-color rounded w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-text-secondary">No products available in this category yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {total > 0 && (
        <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-4">
          {total} product{total !== 1 ? "s" : ""}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8">
        {products.map((product) => (
          <ProductCard
            key={product._id}
            id={product._id}
            name={product.name}
            price={product.price.toFixed(2)}
            stock={product.stock}
            reservationExpiresAt={product.reservationExpiresAt}
            tag={product.tag}
            image={getMainImage(product.images)}
            conditionScore={product.conditionScore}
            conditionStatus={product.conditionStatus}
            productType={product.productType}
            fashionSubtype={product.fashionSubtype}
            originPictures={product.originPictures}
            cloneSourceName={product.cloneSourceName}
            cloneSourceImage={product.cloneSourceImage}
          />
        ))}
      </div>
    </div>
  );
}
