"use client";

import { useState } from "react";

const initialForm = {
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  storeName: "",
  storeCategory: "",
  storeLocation: "",
  socialLink: "",
  message: "",
};

export default function CreateStorePage() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fieldClass = "w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm transition-colors placeholder:text-text-secondary/70 focus:border-foreground focus:outline-none";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/store-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus({ type: "success", text: "Store request sent successfully. Our team will review it and contact you soon." });
        setForm(initialForm);
      } else {
        setStatus({ type: "error", text: data.error || "Unable to send your store request." });
      }
    } catch {
      setStatus({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-[80px] min-h-screen">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-16">
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-[0.3em] text-text-secondary mb-3">Seller Request</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-wide uppercase mb-4">Create Store</h1>
          <div className="w-16 h-px bg-foreground mx-auto mb-6" />
          <p className="text-sm text-text-secondary max-w-lg mx-auto leading-relaxed">
            Share the owner and store details below. Our team will review the request and contact the owner with the next steps.
          </p>
        </div>

        {status && (
          <div
            className={`mb-6 border px-4 py-3 text-xs ${
              status.type === "success"
                ? "border-[#d8c9b8] bg-[#f1ede8] text-[#6b6055]"
                : "border-[#430C05] bg-[#faf3f2] text-[#430C05]"
            }`}
          >
            {status.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Owner Name</label>
              <input type="text" required value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className={fieldClass} placeholder="Owner full name" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Owner Email</label>
              <input type="email" required value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} className={fieldClass} placeholder="owner@email.com" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Owner Phone</label>
              <input type="tel" required value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} className={fieldClass} placeholder="+216 00 000 000" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Store Name</label>
              <input type="text" required value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} className={fieldClass} placeholder="Store name" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Store Category</label>
              <input type="text" required value={form.storeCategory} onChange={(e) => setForm({ ...form, storeCategory: e.target.value })} className={fieldClass} placeholder="Clothing, shoes, accessories..." />
            </div>
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Store Location</label>
              <input type="text" required value={form.storeLocation} onChange={(e) => setForm({ ...form, storeLocation: e.target.value })} className={fieldClass} placeholder="City, country" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Social Link or Website</label>
            <input type="url" value={form.socialLink} onChange={(e) => setForm({ ...form, socialLink: e.target.value })} className={fieldClass} placeholder="https://instagram.com/store" />
          </div>

          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Store Details</label>
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={6} className={`${fieldClass} resize-none`} placeholder="Tell us about the store, products, owner experience, and anything our team should know." />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-foreground text-background py-3.5 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50">
            {loading ? "Sending..." : "Submit Store Request"}
          </button>
        </form>
      </div>
    </div>
  );
}
