"use client";

import { useEffect, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

const storeTypes = [
  { value: "retail", label: "Retail Store" },
  { value: "thrift", label: "Thrift Store" },
] as const;

const categoryLabels: Record<string, string> = {
  clothes: "Clothes",
  fragrances: "Fragrances",
  accessories: "Accessories",
};

export default function StoreDetailsPage() {
  const [form, setForm] = useState({
    name: "",
    storeName: "",
    email: "",
    storeType: "retail" as "thrift" | "retail",
    address: "",
    phoneNumber: "",
    additionalInformation: "",
  });
  const [storeCategories, setStoreCategories] = useState<string[]>([]);
  const [storeApprovalStatus, setStoreApprovalStatus] = useState<"pending" | "approved" | "rejected" | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fieldClass =
    "w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm transition-colors placeholder:text-text-secondary/70 focus:border-foreground focus:outline-none";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch("/api/users/me/store", withAuthRequest())
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;

        const store = data.store || {};
        const user = data.user || {};
        setForm({
          name: store.ownerName || user.name || "",
          storeName: store.storeName || user.storeName || "",
          email: store.email || user.email || "",
          storeType: store.storeType || user.storeType || "retail",
          address: store.address || "",
          phoneNumber: store.phoneNumber || "",
          additionalInformation: store.additionalInformation || "",
        });
        setStoreCategories(Array.isArray(store.categories) ? store.categories : []);
        setStoreApprovalStatus(store.status || user.storeApprovalStatus || null);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load store details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const res = await fetch(
        "/api/users/me/store",
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Unable to update store details.");
      } else {
        setSuccess(
          data.storeApprovalChanged
            ? "Store details updated. Your store is now pending review."
            : "Store details saved."
        );
        setStoreCategories(Array.isArray(data.store?.categories) ? data.store.categories : []);
        setStoreApprovalStatus(data.user?.storeApprovalStatus || null);
      }
    } catch {
      setError("Network error");
    }

    setSaving(false);
  };

  if (loading) {
    return <p className="text-xs text-text-secondary animate-pulse">Loading store details...</p>;
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-12 text-right">
        <p className="text-xs uppercase tracking-[0.3em] text-text-secondary mb-3">Store Owner</p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-wide uppercase mb-4">
          Store Details
        </h1>
        <div className="w-16 h-px bg-foreground ml-auto mb-6" />
        <p className="text-sm text-text-secondary max-w-lg ml-auto leading-relaxed">
          Update your store profile. Any change sends the store back to pending review.
        </p>
      </div>

      <div className="mb-6 text-xs text-text-secondary uppercase tracking-[0.22em]">
        Current status: <span className="text-foreground">{storeApprovalStatus || "approved"}</span>
      </div>

      <div className="mb-8 border border-border-color bg-bg-secondary/40 px-4 py-4 text-xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 uppercase tracking-wider text-text-secondary">Selected Categories</p>
            <div className="flex flex-wrap gap-2">
              {storeCategories.length > 0 ? (
                storeCategories.map((category) => (
                  <span
                    key={category}
                    className="border border-border-color px-2 py-1 uppercase tracking-wider text-text-primary"
                  >
                    {categoryLabels[category] || category}
                  </span>
                ))
              ) : (
                <span className="text-text-secondary">Not provided</span>
              )}
            </div>
          </div>
          <div>
            <p className="mb-1 uppercase tracking-wider text-text-secondary">Selected Store Type</p>
            <p className="text-text-primary">
              {form.storeType === "thrift" ? "Thrift Store" : "Retail Store"}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 border border-border bg-bg-secondary px-4 py-3 text-xs text-text-secondary">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Owner Name
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={fieldClass}
              placeholder="Store owner name"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Store Name
            </label>
            <input
              type="text"
              required
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              className={fieldClass}
              placeholder="Your store name"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={fieldClass}
              placeholder="store@email.com"
              readOnly
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Phone Number
            </label>
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              className={fieldClass}
              placeholder="+216 00 000 000"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
            Store Type
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {storeTypes.map((type) => (
              <label
                key={type.value}
                className={`border px-4 py-3 text-xs uppercase tracking-wider cursor-pointer transition-colors ${
                  form.storeType === type.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-color text-text-secondary hover:text-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="storeType"
                  value={type.value}
                  checked={form.storeType === type.value}
                  onChange={(e) => setForm({ ...form, storeType: e.target.value as "thrift" | "retail" })}
                  className="sr-only"
                />
                {type.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
            Address
          </label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className={fieldClass}
            placeholder="Store address"
          />
        </div>

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
            Additional Information
          </label>
          <textarea
            value={form.additionalInformation}
            onChange={(e) => setForm({ ...form, additionalInformation: e.target.value })}
            rows={6}
            className={`${fieldClass} resize-none`}
            placeholder="Tell us more about your store, products, or brand..."
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-black text-white px-6 py-3 text-xs font-medium tracking-wide uppercase hover:bg-black transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Store Details"}
          </button>
        </div>
      </form>
    </div>
  );
}
