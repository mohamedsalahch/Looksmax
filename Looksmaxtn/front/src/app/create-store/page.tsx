"use client";

import { useState } from "react";

const categories = [
  { value: "clothes", label: "Clothes" },
  { value: "fragrances", label: "Fragrances" },
  { value: "accessories", label: "Accessories" },
] as const;

const initialForm = {
  name: "",
  storeName: "",
  email: "",
  categories: ["clothes"] as (typeof categories)[number]["value"][],
  address: "",
  phoneNumber: "",
  additionalInformation: "",
  instagramUrl: "",
  facebookUrl: "",
};

export default function CreateStorePage() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fieldClass =
    "w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm transition-colors placeholder:text-text-secondary/70 focus:border-foreground focus:outline-none";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/store-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus({ type: "success", text: data.message });
        setForm(initialForm);
      } else {
        setStatus({ type: "error", text: data.error || "Unable to submit your request." });
      }
    } catch {
      setStatus({ type: "error", text: "Network error. Please try again." });
    }

    setLoading(false);
  };

  return (
    <div className="pt-[80px] min-h-screen">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-16">
          <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-[0.3em] text-text-secondary mb-3">Partner With Us</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-wide uppercase mb-4">
            Create Own Store
          </h1>
          <div className="w-16 h-px bg-foreground mx-auto mb-6" />
          <p className="text-sm text-text-secondary max-w-lg mx-auto leading-relaxed" suppressHydrationWarning>
            Share your store details and categories. All fields are required except additional information.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-8">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2">Categories</h3>
              <p className="text-sm text-text-secondary">Clothes, fragrances, and accessories</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2">Review</h3>
              <p className="text-sm text-text-secondary">Admin approval is required before your store can be opened.</p>
            </div>
          </div>

          <div className="md:col-span-2">
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
                  />
                </div>
              </div>

                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
                    Categories
                  </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {categories.map((category) => (
                    <label
                      key={category.value}
                      className={`border px-4 py-3 text-xs uppercase tracking-wider cursor-pointer transition-colors ${
                        form.categories.includes(category.value)
                          ? "border-foreground bg-foreground text-background"
                          : "border-border-color text-text-secondary hover:text-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="categories"
                        value={category.value}
                        checked={form.categories.includes(category.value)}
                        onChange={(e) =>
                          setForm((current) => ({
                            ...current,
                            categories: e.target.checked
                              ? Array.from(new Set([...current.categories, category.value]))
                              : current.categories.filter((value) => value !== category.value),
                          }))
                        }
                        className="sr-only"
                      />
                      {category.label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-text-secondary" suppressHydrationWarning>
                  Select one or more store categories. This field is required.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Address
                  </label>
                  <input
                    type="text"
                    required
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className={fieldClass}
                    placeholder="Store address"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.phoneNumber}
                    onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                    className={fieldClass}
                    placeholder="+216 00 000 000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Instagram <span className="normal-case tracking-normal">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={form.instagramUrl}
                    onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
                    className={fieldClass}
                    placeholder="https://instagram.com/yourstore"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Facebook <span className="normal-case tracking-normal">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={form.facebookUrl}
                    onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })}
                    className={fieldClass}
                    placeholder="https://facebook.com/yourstore"
                  />
                </div>
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
                  placeholder="Tell us more about your products, brand, or store..."
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-foreground text-background py-3.5 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Submit Store Request"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
