"use client";

import { useEffect, useState, type FormEvent } from "react";
import { withAuthRequest } from "@/lib/authClient";

type Coupon = {
  _id: string;
  code: string;
  description?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minimumOrderAmount?: number;
  maxUses?: number | null;
  usageCount?: number;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
};

type CouponFormState = {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minimumOrderAmount: string;
  maxUses: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const initialFormState: CouponFormState = {
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  minimumOrderAmount: "",
  maxUses: "",
  startsAt: "",
  endsAt: "",
  isActive: true,
};

function formatCouponValue(coupon: Coupon) {
  return coupon.discountType === "percentage"
    ? `${coupon.discountValue}%`
    : `${coupon.discountValue.toFixed(2)} TND`;
}

function formatDate(value?: string | null) {
  if (!value) return "Always";
  return new Date(value).toLocaleString();
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<CouponFormState>(initialFormState);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/coupons", withAuthRequest());
      const data = (await res.json()) as { coupons?: Coupon[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to load coupons");
        return;
      }
      setCoupons(data.coupons || []);
    } catch {
      setError("Failed to load coupons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCoupons();
  }, []);

  const resetFeedback = () => {
    setError("");
    setSuccess("");
  };

  const handleCreateCoupon = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    resetFeedback();
    setSubmitting(true);

    try {
      const body = {
        code: form.code,
        description: form.description,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minimumOrderAmount: form.minimumOrderAmount ? Number(form.minimumOrderAmount) : 0,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        isActive: form.isActive,
      };

      const res = await fetch(
        "/api/coupons",
        withAuthRequest({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );

      const data = (await res.json()) as { coupon?: Coupon; error?: string };
      if (!res.ok || !data.coupon) {
        setError(data.error || "Failed to create coupon");
        return;
      }

      setCoupons((current) => [data.coupon!, ...current]);
      setForm(initialFormState);
      setSuccess("Coupon created");
    } catch {
      setError("Failed to create coupon");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    setTogglingId(coupon._id);
    resetFeedback();

    try {
      const res = await fetch(
        `/api/coupons/${coupon._id}`,
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !coupon.isActive }),
        })
      );
      const data = (await res.json()) as { coupon?: Coupon; error?: string };

      if (!res.ok || !data.coupon) {
        setError(data.error || "Failed to update coupon");
        return;
      }

      setCoupons((current) => current.map((entry) => (entry._id === coupon._id ? data.coupon! : entry)));
    } catch {
      setError("Failed to update coupon");
    } finally {
      setTogglingId("");
    }
  };

  const handleDeleteCoupon = async (coupon: Coupon) => {
    if (!confirm(`Delete coupon ${coupon.code}?`)) return;

    setDeletingId(coupon._id);
    resetFeedback();

    try {
      const res = await fetch(`/api/coupons/${coupon._id}`, withAuthRequest({ method: "DELETE" }));
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to delete coupon");
        return;
      }

      setCoupons((current) => current.filter((entry) => entry._id !== coupon._id));
    } catch {
      setError("Failed to delete coupon");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Coupons</h1>
          <p className="text-xs text-text-secondary mt-1">Create and activate discount codes for checkout.</p>
        </div>
      </div>

      {(error || success) && (
        <div className={`border px-4 py-3 text-xs ${error ? "border-[#BD3100] bg-[#faf3f2] text-[#BD3100]" : "border-[#6b6055] bg-[#f1ede8] text-[#6b6055]"}`}>
          {error || success}
        </div>
      )}

      <form onSubmit={handleCreateCoupon} className="grid gap-4 rounded border border-border bg-bg-card p-5 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-text-secondary">Code</label>
          <input
            value={form.code}
            onChange={(e) => setForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))}
            className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm uppercase"
            placeholder="SAVE10"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-text-secondary">Type</label>
          <select
            value={form.discountType}
            onChange={(e) => setForm((current) => ({ ...current, discountType: e.target.value as "percentage" | "fixed" }))}
            className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm"
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-text-secondary">
            Discount value
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.discountValue}
            onChange={(e) => setForm((current) => ({ ...current, discountValue: e.target.value }))}
            className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm"
            placeholder={form.discountType === "percentage" ? "10" : "25.00"}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-text-secondary">
            Minimum order
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.minimumOrderAmount}
            onChange={(e) => setForm((current) => ({ ...current, minimumOrderAmount: e.target.value }))}
            className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm"
            placeholder="0"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-text-secondary">
            Max uses
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={form.maxUses}
            onChange={(e) => setForm((current) => ({ ...current, maxUses: e.target.value }))}
            className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm"
            placeholder="Unlimited"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-text-secondary">
            Starts at
          </label>
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm((current) => ({ ...current, startsAt: e.target.value }))}
            className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-text-secondary">
            Ends at
          </label>
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm((current) => ({ ...current, endsAt: e.target.value }))}
            className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-text-secondary">
            Description
          </label>
          <input
            value={form.description}
            onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
            className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm"
            placeholder="Seasonal promotion"
          />
        </div>
        <div className="flex items-end justify-between gap-3">
          <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-secondary">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((current) => ({ ...current, isActive: e.target.checked }))}
            />
            Active
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="border border-foreground bg-foreground px-5 py-3 text-xs font-medium uppercase tracking-wide text-background transition-colors hover:bg-accent disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Coupon"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : coupons.length === 0 ? (
        <div className="rounded border border-border border-dashed p-8 text-center">
          <p className="text-sm text-text-secondary">No coupons created yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-border bg-bg-card">
          <table className="min-w-[900px] w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] uppercase tracking-wider text-text-secondary">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Rules</th>
                <th className="px-4 py-3">Uses</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon._id} className="border-t border-border">
                  <td className="px-4 py-4">
                    <div className="text-sm font-medium">{coupon.code}</div>
                    <div className="text-xs text-text-secondary">{coupon.description || "No description"}</div>
                  </td>
                  <td className="px-4 py-4 text-sm">{formatCouponValue(coupon)}</td>
                  <td className="px-4 py-4 text-xs text-text-secondary">
                    <div>Min: {coupon.minimumOrderAmount ? `${coupon.minimumOrderAmount.toFixed(2)} TND` : "None"}</div>
                    <div>Valid: {formatDate(coupon.startsAt)} - {formatDate(coupon.endsAt)}</div>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    {coupon.usageCount ?? 0}
                    {typeof coupon.maxUses === "number" ? ` / ${coupon.maxUses}` : " / Unlimited"}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2.5 py-1 text-[10px] uppercase tracking-wider ${coupon.isActive ? "bg-[#f1ede8] text-[#6b6055]" : "bg-neutral-200 text-neutral-700"}`}>
                      {coupon.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(coupon)}
                        disabled={togglingId === coupon._id}
                        className="border border-border px-3 py-2 text-[10px] uppercase tracking-wider text-text-secondary transition-colors hover:text-text-primary hover:bg-bg-hover disabled:opacity-50"
                      >
                        {togglingId === coupon._id ? "Saving..." : coupon.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCoupon(coupon)}
                        disabled={deletingId === coupon._id}
                        className="border border-rose-300 px-3 py-2 text-[10px] uppercase tracking-wider text-rose-300 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
                      >
                        {deletingId === coupon._id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
