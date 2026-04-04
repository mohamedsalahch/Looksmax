"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useCart } from "@/context/CartContext";

interface ProductCardProps {
  id: number;
  name: string;
  price: string;
  tag?: string;
}

const SIZES = ["S", "M", "L", "XL"];

export default function ProductCard({ id, name, price, tag }: ProductCardProps) {
  const { addItem } = useCart();
  const [selectedSize, setSelectedSize] = useState("M");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent Link navigation
    e.stopPropagation();
    addItem({
      id: `${id}-${selectedSize}`, // Unique ID for different sizes
      name,
      price,
      brand: "LOOKSMAX", 
      size: selectedSize, 
      color: "Assorted", 
      maxStock: 1, // Assumption for thrift items
    });
    setIsDropdownOpen(false);
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropdownOpen((prev) => !prev);
  };

  const handleSizeSelect = (e: React.MouseEvent, size: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSize(size);
    setIsDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  return (
    <Link href={`/product/${id}`} className="group cursor-pointer block relative">
      <div className="relative aspect-[3/4] placeholder-img overflow-hidden product-image-wrapper">
        <div className="absolute inset-0 product-image" />
        <span className="relative z-10 text-[10px] tracking-widest opacity-50">
          PRODUCT
        </span>

        {/* Tag badge */}
        {tag && (
          <span className="absolute top-2 left-2 z-20 bg-foreground text-background text-[10px] px-2 py-0.5 font-medium tracking-wide">
            {tag}
          </span>
        )}

        {/* Quick Add Bar (appears on hover or when dropdown is open) */}
        <div 
          className={`absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out z-30 ${
            isDropdownOpen ? "translate-y-0" : "translate-y-full group-hover:translate-y-0"
          }`}
        >
          <div className="bg-background flex items-center h-10 border-t border-border-color">
            <div className="relative w-1/2 h-full" ref={dropdownRef}>
              {/* Trigger */}
              <div 
                onClick={toggleDropdown}
                className="w-full h-full flex items-center justify-between px-3 text-[10px] text-foreground font-medium uppercase tracking-wide border-r border-border-color hover:bg-hover transition-colors"
              >
                <span>Size {selectedSize}</span>
                <svg 
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}
                >
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </div>

              {/* Custom Dropdown Menu */}
              {isDropdownOpen && (
                <div 
                  className="absolute bottom-full left-0 w-[120%] bg-background border border-foreground z-40 flex flex-col mb-[-1px]"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  {SIZES.map((size) => (
                    <div 
                      key={size}
                      onClick={(e) => handleSizeSelect(e, size)}
                      className="px-3 py-2.5 text-[10px] text-foreground font-medium hover:bg-surface transition-colors cursor-pointer"
                    >
                      {size}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <button 
              onClick={handleQuickAdd}
              className="w-1/2 h-full bg-foreground text-background text-[10px] uppercase font-bold tracking-widest hover:bg-black transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="text-xs text-foreground truncate">{name}</p>
        <p className="text-xs text-text-secondary">${price}</p>
      </div>
    </Link>
  );
}
