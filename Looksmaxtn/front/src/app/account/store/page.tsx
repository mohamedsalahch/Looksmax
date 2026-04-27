"use client";

import { FormEvent, useEffect, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

type StoreStatus = "pending" | "approved" | "disabled";

interface Store {
  _id: string;
  name: string;
  slug: string;
  logo: string;
  category: string;
  status: StoreStatus;
}

interface OwnerProduct {
  _id: string;
  name: string;
  price: number;
  stock: number;
  isActive?: boolean;
  storeNameSnapshot?: string;
}

interface OwnerOrder {
  _id: string;
  totalPrice: number;
  orderStatus: string;
  createdAt: string;
  items?: Array<{ name: string; quantity: number; storeNameSnapshot?: string }>;
}

export default function AccountStorePage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<OwnerProduct[]>([]);
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeSubmitting, setStoreSubmitting] = useState(false);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [storeError, setStoreError] = useState("");
  const [productError, setProductError] = useState("");

  const approvedStore = stores.find((store) => store.status === "approved");

  const loadWorkspace = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/owner/stores", withAuthRequest()).then((response) => response.json()),
      fetch("/api/owner/products", withAuthRequest()).then((response) => response.json()),
      fetch("/api/owner/orders", withAuthRequest()).then((response) => response.json()),
    ])
      .then(([storesData, productsData, ordersData]) => {
        setStores(storesData.stores || []);
        setProducts(productsData.products || []);
        setOrders(ordersData.orders || []);
      })
      .catch(() => {
        setStores([]);
        setProducts([]);
        setOrders([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const createStore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStoreError("");
    setStoreSubmitting(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const response = await fetch("/api/owner/stores", withAuthRequest({ method: "POST", body: formData }));
      const data = await response.json();
      if (!response.ok) {
        setStoreError(data.error || "Unable to create store");
        return;
      }
      form.reset();
      loadWorkspace();
    } catch {
      setStoreError("Unable to create store");
    } finally {
      setStoreSubmitting(false);
    }
  };

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!approvedStore) return;
    setProductError("");
    setProductSubmitting(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      formData.set("storeId", approvedStore._id);
      formData.set("productType", "fashion");
      formData.set("fashionSubtype", "clothes");
      formData.set("categories", JSON.stringify([String(formData.get("category") || "clothing")]));
      formData.set("sizes", JSON.stringify(String(formData.get("sizes") || "").split(",").map((size) => size.trim()).filter(Boolean)));
      formData.set("colors", JSON.stringify(String(formData.get("colors") || "").split(",").map((color) => color.trim()).filter(Boolean)));

      const response = await fetch("/api/owner/products", withAuthRequest({ method: "POST", body: formData }));
      const data = await response.json();
      if (!response.ok) {
        setProductError(data.error || "Unable to create product");
        return;
      }
      form.reset();
      loadWorkspace();
    } catch {
      setProductError("Unable to create product");
    } finally {
      setProductSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-text-secondary animate-pulse">Loading store workspace...</p>;
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide">My Store</h2>
          <p className="mt-1 text-xs text-text-secondary">Create a marketplace store and wait for admin approval.</p>
        </div>

        {stores.length > 0 ? (
          <div className="space-y-3">
            {stores.map((store) => (
              <div key={store._id} className="flex items-center justify-between gap-4 border border-border-color bg-surface/40 p-4">
                <div className="flex items-center gap-3">
                  <img src={store.logo} alt={store.name} className="h-12 w-12 border border-border-color object-cover" />
                  <div>
                    <p className="text-sm font-medium">{store.name}</p>
                    <p className="text-xs text-text-secondary">{store.category} · {store.slug}</p>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-text-secondary">{store.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={createStore} className="grid gap-3 border border-border-color bg-surface/30 p-4">
            <input name="name" required placeholder="Store name" className="border border-border-color bg-background px-3 py-2 text-sm" />
            <input name="category" required placeholder="Store category" className="border border-border-color bg-background px-3 py-2 text-sm" />
            <input name="logo" required type="file" accept="image/*" className="border border-border-color bg-background px-3 py-2 text-sm" />
            {storeError && <p className="text-xs text-[#430C05]">{storeError}</p>}
            <button disabled={storeSubmitting} className="bg-foreground text-background px-4 py-3 text-xs font-semibold uppercase tracking-wide disabled:opacity-50">
              {storeSubmitting ? "Submitting..." : "Create Store"}
            </button>
          </form>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Products</h2>
          <p className="mt-1 text-xs text-text-secondary">Add products after your store is approved.</p>
        </div>

        {approvedStore ? (
          <form onSubmit={createProduct} className="mb-5 grid gap-3 border border-border-color bg-surface/30 p-4">
            <input name="name" required placeholder="Product name" className="border border-border-color bg-background px-3 py-2 text-sm" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="price" required type="number" min="0" step="0.01" placeholder="Price" className="border border-border-color bg-background px-3 py-2 text-sm" />
              <input name="fullStock" required type="number" min="0" placeholder="Full stock" className="border border-border-color bg-background px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="category" placeholder="Category" className="border border-border-color bg-background px-3 py-2 text-sm" />
              <input name="sizes" placeholder="Sizes, comma separated" className="border border-border-color bg-background px-3 py-2 text-sm" />
              <input name="colors" placeholder="Colors, comma separated" className="border border-border-color bg-background px-3 py-2 text-sm" />
            </div>
            <textarea name="description" placeholder="Description" rows={3} className="border border-border-color bg-background px-3 py-2 text-sm" />
            <input name="images" required type="file" accept="image/*" multiple className="border border-border-color bg-background px-3 py-2 text-sm" />
            {productError && <p className="text-xs text-[#430C05]">{productError}</p>}
            <button disabled={productSubmitting} className="bg-foreground text-background px-4 py-3 text-xs font-semibold uppercase tracking-wide disabled:opacity-50">
              {productSubmitting ? "Saving..." : "Add Product"}
            </button>
          </form>
        ) : (
          <p className="text-xs text-text-secondary">Your store must be approved before products can be added.</p>
        )}

        <div className="space-y-2">
          {products.map((product) => (
            <div key={product._id} className="flex items-center justify-between border-b border-border-color py-3">
              <div>
                <p className="text-sm font-medium">{product.name}</p>
                <p className="text-xs text-text-secondary">{product.stock} in stock · {product.price.toFixed(2)} TND</p>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-text-secondary">
                {product.isActive === false ? "inactive" : "active"}
              </span>
            </div>
          ))}
          {products.length === 0 && <p className="text-xs text-text-secondary">No products yet.</p>}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Store Orders</h2>
          <p className="mt-1 text-xs text-text-secondary">Admin still handles shipping and status updates.</p>
        </div>
        <div className="space-y-2">
          {orders.map((order) => (
            <div key={order._id} className="border border-border-color bg-surface/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium">#{order._id.slice(-8).toUpperCase()}</p>
                <span className="text-[10px] uppercase tracking-wider text-text-secondary">{order.orderStatus}</span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">{new Date(order.createdAt).toLocaleDateString()} · {order.totalPrice.toFixed(2)} TND</p>
              <p className="mt-2 text-xs text-text-secondary">
                {(order.items || []).map((item) => `${item.name} x${item.quantity}`).join(", ")}
              </p>
            </div>
          ))}
          {orders.length === 0 && <p className="text-xs text-text-secondary">No store orders yet.</p>}
        </div>
      </section>
    </div>
  );
}
