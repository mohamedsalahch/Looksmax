"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";

export default function ProductInfo({
  product,
}: {
  product: {
    id?: string;
    name: string;
    price: string;
    brand: string;
    size: string;
    color: string;
    stock: number;
    description: string;
    details: string[];
  };
}) {
  const [addedToCart, setAddedToCart] = useState(false);
  const { addItem } = useCart();

  const handleAddToCart = () => {
    addItem({
      id: product.id || "unknown",
      name: product.name,
      price: product.price,
      brand: product.brand,
      size: product.size,
      color: product.color,
      maxStock: product.stock,
    });
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Brand */}
      <p className="text-xs text-text-secondary uppercase tracking-widest">
        {product.brand}
      </p>

      {/* Name */}
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
        {product.name}
      </h1>

      {/* Price */}
      <p className="text-xl font-medium">${product.price}</p>

      {/* Divider */}
      <div className="border-t border-border-color" />

      {/* Color */}
      <div>
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">
          Color
        </p>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-accent border border-border-color" />
          <span className="text-sm">{product.color}</span>
        </div>
      </div>

      {/* Size */}
      <div>
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">
          Size
        </p>
        <div className="inline-block border border-foreground px-4 py-2 text-sm font-medium">
          {product.size}
        </div>
      </div>

      {/* Stock */}
      <div className="flex items-center gap-2">
        {product.stock > 0 ? (
          <>
            <div className="w-2 h-2 rounded-full bg-green-600" />
            <span className="text-xs text-text-secondary">
              {product.stock === 1
                ? "Last one — only 1 in stock"
                : `${product.stock} in stock`}
            </span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs text-text-secondary">Sold out</span>
          </>
        )}
      </div>

      {/* Add to Cart */}
      <button
        onClick={handleAddToCart}
        disabled={product.stock === 0}
        className={`w-full py-3.5 text-sm font-medium tracking-wide uppercase transition-all duration-300 cursor-pointer ${
          product.stock === 0
            ? "bg-border-color text-text-secondary cursor-not-allowed"
            : addedToCart
            ? "bg-green-700 text-white"
            : "bg-foreground text-background hover:bg-accent"
        }`}
      >
        {product.stock === 0
          ? "Sold Out"
          : addedToCart
          ? "✓ Added to Cart"
          : "Add to Cart"}
      </button>

      {/* Divider */}
      <div className="border-t border-border-color" />

      {/* Description */}
      <div>
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">
          Description
        </p>
        <p className="text-sm leading-relaxed text-foreground/80">
          {product.description}
        </p>
      </div>

      {/* Details */}
      <div>
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">
          Details
        </p>
        <ul className="space-y-1.5">
          {product.details.map((detail, i) => (
            <li key={i} className="text-sm text-foreground/70 flex items-start gap-2">
              <span className="text-text-secondary mt-0.5">·</span>
              {detail}
            </li>
          ))}
        </ul>
      </div>

      {/* Shipping info */}
      <div className="border-t border-border-color pt-4 space-y-3">
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-secondary">
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span className="text-xs text-text-secondary">Free shipping on orders over $100</span>
        </div>
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-secondary">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          <span className="text-xs text-text-secondary">14-day return policy</span>
        </div>
      </div>
    </div>
  );
}
