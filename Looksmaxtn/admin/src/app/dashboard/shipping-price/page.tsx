"use client";

import { useEffect, useState, type FormEvent } from "react";
import { withAuthRequest } from "@/lib/authClient";

interface AuditActor {
  id: string;
  name: string;
  email: string;
}

interface ShippingSettings {
  shippingCost: number;
  freeShippingThreshold: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: AuditActor | null;
  updatedBy?: AuditActor | null;
}

function formatAuditActor(actor?: AuditActor | null) {
  if (!actor) return "-";
  return actor.name || actor.email || actor.id || "-";
}

function formatAuditDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function ShippingPricePage() {
  const [shippingCost, setShippingCost] = useState("0");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("0");
  const [settings, setSettings] = useState<ShippingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadSettings = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/shipping-settings", withAuthRequest());
      const data = (await res.json()) as { settings?: ShippingSettings; error?: string };

      if (!res.ok || !data.settings) {
        setError(data.error || "Unable to load shipping settings.");
        return;
      }

      setSettings(data.settings);
      setShippingCost(String(data.settings.shippingCost ?? 0));
      setFreeShippingThreshold(String(data.settings.freeShippingThreshold ?? 0));
    } catch {
      setError("Unable to load shipping settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    const nextShippingCost = Number(shippingCost);
    const nextFreeShippingThreshold = Number(freeShippingThreshold);

    if (!Number.isFinite(nextShippingCost) || nextShippingCost < 0) {
      setError("Shipping cost must be zero or more.");
      setSaving(false);
      return;
    }

    if (!Number.isFinite(nextFreeShippingThreshold) || nextFreeShippingThreshold < 0) {
      setError("Free shipping threshold must be zero or more.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(
        "/api/shipping-settings",
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shippingCost: nextShippingCost,
            freeShippingThreshold: nextFreeShippingThreshold,
          }),
        })
      );
      const data = (await res.json()) as { settings?: ShippingSettings; error?: string };

      if (!res.ok || !data.settings) {
        setError(data.error || "Unable to save shipping settings.");
        return;
      }

      setSettings(data.settings);
      setShippingCost(String(data.settings.shippingCost ?? 0));
      setFreeShippingThreshold(String(data.settings.freeShippingThreshold ?? 0));
      setSuccess("Shipping settings saved.");
    } catch {
      setError("Unable to save shipping settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-wide">Shipping Price</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Choose the delivery fee and the order amount where shipping becomes free.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,560px)_minmax(320px,1fr)]">
        <form onSubmit={handleSubmit} className="space-y-5 rounded border border-border bg-bg-card p-5">
          {loading ? (
            <p className="text-xs uppercase tracking-wider text-text-secondary">Loading shipping settings...</p>
          ) : (
            <>
              {error && (
                <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">
                  {error}
                </div>
              )}
              {success && (
                <div className="border border-emerald-700 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                  {success}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-text-secondary">
                  Shipping cost (TND)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingCost}
                  onChange={(event) => setShippingCost(event.target.value)}
                  className="input-line text-text-primary"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-text-secondary">
                  Free shipping from (TND)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={freeShippingThreshold}
                  onChange={(event) => setFreeShippingThreshold(event.target.value)}
                  className="input-line text-text-primary"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="bg-accent px-6 py-3 text-xs font-semibold uppercase tracking-wide text-bg-primary disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Shipping Price"}
              </button>
            </>
          )}
        </form>

        <div className="space-y-4">
          <div className="rounded border border-border bg-bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-text-secondary">Current Rule</p>
            <p className="mt-3 text-sm text-text-primary">
              Orders below {Number(freeShippingThreshold || 0).toFixed(2)} TND pay{" "}
              {Number(shippingCost || 0).toFixed(2)} TND shipping.
            </p>
            <p className="mt-2 text-sm text-text-primary">
              Orders from {Number(freeShippingThreshold || 0).toFixed(2)} TND and above ship free.
            </p>
            {Number(freeShippingThreshold || 0) === 0 && (
              <p className="mt-3 text-xs text-text-secondary">
                A free shipping threshold of 0 means shipping is always free.
              </p>
            )}
          </div>

          {settings && (
            <div className="rounded border border-border bg-bg-card p-5">
              <p className="text-xs uppercase tracking-wider text-text-secondary">Traceability</p>
              <div className="mt-3 space-y-1 text-xs text-text-secondary">
                <p>Created at: {formatAuditDate(settings.createdAt)}</p>
                <p>Created by: {formatAuditActor(settings.createdBy)}</p>
                <p>Updated at: {formatAuditDate(settings.updatedAt)}</p>
                <p>Updated by: {formatAuditActor(settings.updatedBy)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
