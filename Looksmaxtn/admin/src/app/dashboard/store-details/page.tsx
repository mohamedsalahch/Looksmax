"use client";

import { useEffect, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

const categoryLabels: Record<string, string> = {
  clothes: "Clothes",
  fragrances: "Fragrances",
  accessories: "Accessories",
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending:  { label: "Pending Review", color: "var(--warning)" },
  approved: { label: "Approved",       color: "var(--success)" },
  rejected: { label: "Rejected",       color: "var(--danger)"  },
};

export default function StoreDetailsPage() {
  const [form, setForm] = useState({
    name: "",
    storeName: "",
    email: "",
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch("/api/admin/users/me/store", withAuthRequest())
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const store = data.store || {};
        const user = data.user || {};
        setForm({
          name: store.ownerName || user.name || "",
          storeName: store.storeName || user.storeName || "",
          email: store.email || user.email || "",
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

    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const res = await fetch(
        "/api/admin/users/me/store",
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
    return (
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-text-secondary animate-pulse">
        <span className="inline-block h-px w-8 bg-border" />
        Loading store details
      </div>
    );
  }

  const statusKey = storeApprovalStatus ?? "approved";
  const status = statusConfig[statusKey] ?? statusConfig.approved;

  return (
    <div className="max-w-2xl space-y-10">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <p className="label-meta">Store Owner</p>
          <h1 className="text-3xl font-semibold uppercase tracking-wide text-text-primary">
            Store Details
          </h1>
        </div>

        {/* Status badge */}
        <div
          className="mt-1 border px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-medium"
          style={{ borderColor: status.color, color: status.color }}
        >
          {status.label}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* ── Categories info card ── */}
      <div className="card">
        <p className="label-meta mb-3">Selected Categories</p>
        <div className="flex flex-wrap gap-2">
          {storeCategories.length > 0 ? (
            storeCategories.map((cat) => (
              <span
                key={cat}
                className="bg-text-primary text-bg-primary px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] font-medium"
              >
                {categoryLabels[cat] || cat}
              </span>
            ))
          ) : (
            <span className="text-xs text-text-secondary">Not provided</span>
          )}
        </div>
      </div>

      {/* ── Feedback banners ── */}
      {error && (
        <div className="border border-danger/40 bg-danger/5 px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="border border-success/40 bg-success/5 px-4 py-3 text-xs text-success">
          {success}
        </div>
      )}

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Row 1: owner + store name */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="label-meta block mb-2">Owner Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-line"
              placeholder="Store owner name"
            />
          </div>
          <div>
            <label className="label-meta block mb-2">Store Name</label>
            <input
              type="text"
              required
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              className="input-line"
              placeholder="Your store name"
            />
          </div>
        </div>

        {/* Row 2: email + phone */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="label-meta block mb-2">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-line opacity-60 cursor-not-allowed"
              placeholder="store@email.com"
              readOnly
            />
          </div>
          <div>
            <label className="label-meta block mb-2">Phone Number</label>
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              className="input-line"
              placeholder="+216 00 000 000"
            />
          </div>
        </div>

        {/* Row 3: address */}
        <div>
          <label className="label-meta block mb-2">Address</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="input-line"
            placeholder="Store address"
          />
        </div>

        {/* Row 4: additional info */}
        <div>
          <label className="label-meta block mb-2">Additional Information</label>
          <textarea
            value={form.additionalInformation}
            onChange={(e) => setForm({ ...form, additionalInformation: e.target.value })}
            rows={5}
            className="input-line resize-none"
            placeholder="Tell us more about your store, products, or brand..."
          />
        </div>

        <div className="h-px bg-border" />

        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">
            Changes trigger a new review cycle
          </p>
          <button type="submit" disabled={saving} className="btn-primary min-w-[160px]">
            {saving ? "Saving..." : "Save Details"}
          </button>
        </div>
      </form>
    </div>
  );
}
