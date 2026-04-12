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
  cartCount?: number;
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

export default function ProductCardRow({ title = "Featured selection" }: { title?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = () => {
      fetch("/api/products?limit=4")
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setProducts(data.products || []);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    loadProducts();
    const interval = window.setInterval(loadProducts, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (loading || products.length === 0) return null;

  return (
    <section className="px-4 md:px-8 py-16">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-lg md:text-xl font-semibold tracking-wide uppercase mb-8 text-center">
          {title}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
          {products.map((product) => (
            <ProductCard
              key={product._id}
            id={product._id}
            name={product.name}
            categories={product.categories}
            price={product.price.toFixed(2)}
            stock={product.stock}
            cartCount={product.cartCount}
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
