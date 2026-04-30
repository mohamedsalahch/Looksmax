"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import StoreDashboardShell, { type StoreSession } from "@/components/StoreDashboardShell";
import { withAuthRequest } from "@/lib/authClient";

interface ProductImage {
  url: string;
  isMain: boolean;
}

interface ProductDetail {
  _id: string;
  store?: string;
  name: string;
  price: number;
  stock: number;
  categories: string[];
  description: string;
  brand: string;
  reference: string;
  productType?: "fashion" | "perfume";
  fashionSubtype?: string | null;
  tag: string;
  isActive?: boolean;
  images?: ProductImage[];
}

export default function EditStoreProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [store, setStore] = useState<StoreSession | null>(null);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [categories, setCategories] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [reference, setReference] = useState("");
  const [productType, setProductType] = useState<"fashion" | "perfume">("fashion");
  const [fashionSubtype, setFashionSubtype] = useState("clothes");
  const [tag, setTag] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [images, setImages] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/products/${params.id}`, withAuthRequest())
      .then((response) => response.json())
      .then((data) => {
        const nextProduct = data.product as ProductDetail | undefined;
        if (!nextProduct) return;
        setProduct(nextProduct);
        setName(nextProduct.name || "");
        setPrice(String(nextProduct.price ?? ""));
        setStock(String(nextProduct.stock ?? 0));
        setCategories((nextProduct.categories || []).join(", "));
        setDescription(nextProduct.description || "");
        setBrand(nextProduct.brand || "");
        setReference(nextProduct.reference || "");
        setProductType(nextProduct.productType || "fashion");
        setFashionSubtype(nextProduct.fashionSubtype || "clothes");
        setTag(nextProduct.tag || "");
        setIsActive(nextProduct.isActive !== false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const body = new FormData();
      body.append("name", name.trim());
      body.append("price", price);
      body.append("stock", stock);
      body.append("categories", JSON.stringify(categories.split(",").map((value) => value.trim()).filter(Boolean)));
      body.append("description", description);
      body.append("brand", brand || store?.storeName || "");
      body.append("reference", reference);
      body.append("productType", productType);
      body.append("fashionSubtype", fashionSubtype);
      body.append("tag", tag);
      body.append("isActive", String(isActive));
      body.append("sizes", JSON.stringify([]));
      body.append("colors", JSON.stringify([]));
      body.append("existingImages", JSON.stringify(product?.images || []));
      Array.from(images || []).forEach((file) => body.append("images", file));

      const response = await fetch(`/api/products/${params.id}`, withAuthRequest({ method: "PUT", body }));
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to update product.");
        return;
      }

      router.push("/products");
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <StoreDashboardShell onStoreLoad={setStore}><p className="text-xs text-text-secondary animate-pulse">Loading product...</p></StoreDashboardShell>;
  }

  return (
    <StoreDashboardShell onStoreLoad={setStore}>
      <div className="mb-6">
        <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-text-secondary">Store</p>
        <h1 className="text-xl font-semibold tracking-wide text-foreground">Edit Product</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">{error}</div>}

        <section className="space-y-4 border border-border-color bg-surface/25 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Store</label>
              <input value={product?.store || store?.storeName || ""} readOnly className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground" />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Product Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground" />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Price</label>
              <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground" />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Stock</label>
              <input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} required className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground" />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Product Type</label>
              <select value={productType} onChange={(e) => setProductType(e.target.value as "fashion" | "perfume")} className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground">
                <option value="fashion">Fashion</option>
                <option value="perfume">Perfume</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Fashion Subtype</label>
              <select value={fashionSubtype} onChange={(e) => setFashionSubtype(e.target.value)} disabled={productType !== "fashion"} className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground disabled:opacity-60">
                <option value="clothes">Clothes</option>
                <option value="shoes">Shoes</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Brand</label>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground" />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Reference</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Categories</label>
              <input value={categories} onChange={(e) => setCategories(e.target.value)} className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground" />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Tag</label>
              <input value={tag} onChange={(e) => setTag(e.target.value)} className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground" />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="w-full border border-border-color bg-background px-4 py-2.5 text-sm text-foreground" />
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Existing Images</label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(product?.images || []).map((image) => (
                <div key={image.url} className="border border-border-color bg-background p-3">
                  <img src={image.url} alt={name} className="h-28 w-full object-contain" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">Add More Images</label>
            <input type="file" multiple accept="image/*" onChange={(e) => setImages(e.target.files)} className="block w-full text-sm text-text-secondary" />
          </div>

          <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-secondary">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        </section>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="bg-foreground px-5 py-3 text-xs font-semibold uppercase tracking-wide text-background transition-colors hover:bg-accent disabled:opacity-50">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link href="/products" className="text-xs font-medium uppercase tracking-wide text-text-secondary underline underline-offset-4">
            Cancel
          </Link>
        </div>
      </form>
    </StoreDashboardShell>
  );
}
