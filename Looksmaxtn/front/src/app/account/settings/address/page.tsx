"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthContext";
import { withAuthRequest } from "@/lib/authClient";

export default function AddressSettingsPage() {
  const { user, refreshUser } = useAuth();
  const [address, setAddress] = useState({
    street: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAddress({
      street: user?.address?.street || "",
      city: user?.address?.city || "",
      state: user?.address?.state || "",
      zip: user?.address?.zip || "",
      phone: user?.address?.phone || "",
    });
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/users/me/address", {
        ...withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(address),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to save address.");
      } else {
        setSuccess("Address updated successfully");
        await refreshUser();
      }
    } catch {
      setError("Network error");
    }

    setLoading(false);
  };

  return (
    <div className="max-w-md space-y-6">
      <Link href="/account/settings" className="text-xs text-text-secondary underline underline-offset-2">
        Back to Settings
      </Link>
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-6 text-text-secondary">
          Billing Address
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">{error}</div>}
          {success && <div className="border border-[#d8c9b8] bg-[#f1ede8] px-4 py-3 text-xs text-[#6b6055]">{success}</div>}
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Street Address</label>
            <input type="text" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} className="w-full border border-border-color bg-transparent px-4 py-3 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">City</label>
              <input type="text" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} className="w-full border border-border-color bg-transparent px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">State</label>
              <input type="text" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} className="w-full border border-border-color bg-transparent px-4 py-3 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">ZIP Code</label>
              <input type="text" value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} className="w-full border border-border-color bg-transparent px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Phone</label>
              <input type="tel" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} className="w-full border border-border-color bg-transparent px-4 py-3 text-sm" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="bg-foreground text-background px-6 py-3 text-xs font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50">
            {loading ? "Saving..." : "Save Address"}
          </button>
        </form>
      </div>
    </div>
  );
}
