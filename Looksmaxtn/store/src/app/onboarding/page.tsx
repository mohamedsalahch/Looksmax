"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken, withAuthRequest } from "@/lib/authClient";
import StoreDashboardShell, { type StoreSession } from "@/components/StoreDashboardShell";

export default function StoreOnboardingPage() {
  const router = useRouter();
  const [store, setStore] = useState<StoreSession | null>(null);
  const [storeName, setStoreName] = useState("");
  const [logo, setLogo] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateStore = useCallback((updatedStore: StoreSession) => {
    setStore(updatedStore);
    setStoreName(updatedStore.storeName || "");
    setLogo(updatedStore.logo || "");
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", withAuthRequest())
      .then(async (response) => {
        if (!response.ok) {
          clearToken();
          router.replace("/");
          return null;
        }
        return response.json();
      })
      .then((data) => {
        if (!data?.store) return;
        setStore(data.store);
        setStoreName(data.store.storeName || "");
        setLogo(data.store.logo || "");
        setStep(data.store.onboardingCompleted ? 3 : 1);
      })
      .catch(() => {
        clearToken();
        router.replace("/");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const confirmStoreName = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/store-name", withAuthRequest({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName }),
      }));
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to save store name.");
        return;
      }
      setStore((current) => current ? { ...current, storeName } : current);
      setStep(2);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const saveLogo = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/logo", withAuthRequest({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo }),
      }));
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to save logo.");
        return;
      }
      setStore((current) => current ? { ...current, logo, onboardingCompleted: true } : current);
      setStep(3);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-sm text-[var(--muted)]">Loading...</main>;
  }

  return (
    <StoreDashboardShell onStoreLoad={updateStore}>
        <div className="mx-auto max-w-2xl">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Store Setup</p>
            <h1 className="mt-3 text-3xl font-semibold uppercase tracking-wide">
              {step === 3 ? `Welcome to ${store?.storeName || storeName}` : "First Sign In"}
            </h1>
          </div>

          <div className="mb-8 flex gap-2">
            {[1, 2, 3].map((item) => (
              <div key={item} className={`h-1 flex-1 ${item <= step ? "bg-black" : "bg-[var(--border)]"}`} />
            ))}
          </div>

          {error && <div className="mb-5 border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">{error}</div>}

          {step === 1 && (
            <section className="border border-[var(--border)] bg-white p-6">
              <h2 className="text-lg font-semibold uppercase tracking-wide mb-2">Confirm Store Name</h2>
              <p className="mb-6 text-sm text-[var(--muted)]">This name came from your store request. Confirm it or adjust it before continuing.</p>
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-black"
              />
              <button onClick={confirmStoreName} disabled={saving || !storeName.trim()} className="mt-5 bg-black px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white hover:bg-[#6b6258] disabled:opacity-50">
                {saving ? "Saving..." : "Confirm"}
              </button>
            </section>
          )}

          {step === 2 && (
            <section className="border border-[var(--border)] bg-white p-6">
              <h2 className="text-lg font-semibold uppercase tracking-wide mb-2">Upload Logo</h2>
              <p className="mb-6 text-sm text-[var(--muted)]">Add the logo customers will see for your store.</p>
              <input type="file" accept="image/*" onChange={(e) => handleLogoChange(e.target.files?.[0])} className="block w-full text-sm" />
              {logo && <img src={logo} alt="Store logo preview" className="mt-5 h-28 w-28 border border-[var(--border)] object-contain p-2" />}
              <button onClick={saveLogo} disabled={saving || !logo} className="mt-5 bg-black px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white hover:bg-[#6b6258] disabled:opacity-50">
                {saving ? "Saving..." : "Finish Setup"}
              </button>
            </section>
          )}

          {step === 3 && (
            <section className="border border-[var(--border)] bg-white p-8 text-center">
              {store?.logo && <img src={store.logo} alt={`${store.storeName} logo`} className="mx-auto mb-5 h-28 w-28 object-contain" />}
              <p className="text-sm text-[var(--muted)]">Your store setup is complete.</p>
              <h2 className="mt-2 text-2xl font-semibold">Welcome to {store?.storeName || storeName}</h2>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="mt-6 bg-black px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white hover:bg-[#6b6258]"
              >
                Open Dashboard
              </button>
            </section>
          )}
        </div>
    </StoreDashboardShell>
  );
}
