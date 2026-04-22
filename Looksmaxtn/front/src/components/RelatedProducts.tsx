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
  categories?: string[];
  price: number;
  stock: number;
  sizeAvailability?: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null;
  cartCount?: number;
  reservedElsewhere?: boolean;
  ownedReservation?: boolean;
  tag?: string;
  sizes?: string[];
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

export default function RelatedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/products?limit=4", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setProducts(data.products || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className="border-t border-border-color mt-16 pt-10 pb-6">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="h-3.5 w-40 animate-pulse bg-border-color/50 mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[3/4] w-full animate-pulse bg-hover/60 border border-border-color" />
                <div className="h-2.5 w-3/4 animate-pulse bg-border-color/50" />
                <div className="h-2.5 w-1/2 animate-pulse bg-border-color/40" />
                <div className="mt-1 h-1 w-full animate-pulse bg-border-color/30" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section className="border-t border-border-color mt-16 pt-10 pb-6">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-6">
          You may also like
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-8">
          {products.map((product) => (
            <ProductCard
              key={product._id}
            id={product._id}
            name={product.name}
            categories={product.categories}
            price={product.price.toFixed(2)}
            stock={product.stock}
            sizeAvailability={product.sizeAvailability}
            cartCount={product.cartCount}
            reservedElsewhere={product.reservedElsewhere}
            ownedReservation={product.ownedReservation}
            tag={product.tag}
            sizes={product.sizes}
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
    </section>
  );
}
