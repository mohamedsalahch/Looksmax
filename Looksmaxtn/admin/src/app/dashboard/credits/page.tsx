"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { withAuthRequest } from "@/lib/authClient";

interface Credits {
  allowed: number;
  used: number;
  remaining: number;
}

export default function CreditsPage() {
  const router = useRouter();
  const [credits, setCredits] = useState<Credits | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyAmount, setBuyAmount] = useState(10);
  const [buyCode, setBuyCode] = useState("");
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState("");
  const [buySuccess, setBuySuccess] = useState("");

  const loadCredits = async () => {
    const response = await fetch("/api/users/me/store-credits", withAuthRequest());
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to load credits");
    }
    setCredits(data);
  };

  useEffect(() => {
    fetch("/api/auth/me", withAuthRequest())
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role !== "store_owner") {
          router.replace("/dashboard");
          return;
        }
        return loadCredits();
      })
      .catch(() => setCredits(null))
      .finally(() => setLoading(false));
  }, [router]);

  const handleBuyCredits = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBuyError("");
    setBuySuccess("");

    if (!Number.isInteger(buyAmount) || buyAmount <= 0) {
      setBuyError("Enter a valid credit amount.");
      return;
    }

    setBuyLoading(true);
    try {
      const response = await fetch(
        "/api/users/me/store-credits",
        withAuthRequest({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: buyAmount, code: buyCode }),
        })
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to buy credits");
      }

      setCredits(data);
      setBuySuccess(`Added ${buyAmount} credits.`);
      setBuyCode("");
    } catch (error) {
      setBuyError(error instanceof Error ? error.message : "Unable to buy credits");
    } finally {
      setBuyLoading(false);
    }
  };

  const usedPct = credits ? Math.min(100, Math.round((credits.used / credits.allowed) * 100)) : 0;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-lg font-semibold">AI Credits</h1>
        <p className="text-xs text-text-secondary mt-1">
          Credits are consumed when you enhance product images or generate model pictures.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : !credits ? (
        <p className="text-xs text-text-secondary">Unable to load credits.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-bg-card border border-border rounded p-4 text-center">
              <p className="text-2xl font-semibold">{credits.remaining}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-1">Remaining</p>
            </div>
            <div className="bg-bg-card border border-border rounded p-4 text-center">
              <p className="text-2xl font-semibold">{credits.used}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-1">Used</p>
            </div>
            <div className="bg-bg-card border border-border rounded p-4 text-center">
              <p className="text-2xl font-semibold">{credits.allowed}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-1">Total Added</p>
            </div>
          </div>

          <div className="bg-bg-card border border-border rounded p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Usage</span>
              <span className="font-medium">
                {credits.used} / {credits.allowed}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  credits.remaining === 0 ? "bg-danger" : usedPct > 75 ? "bg-warning" : "bg-accent"
                }`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            {credits.remaining === 0 && (
              <p className="text-[10px] text-danger">
                You have no credits left. Contact the admin to get more.
              </p>
            )}
          </div>

          <div className="bg-bg-card border border-border rounded p-4 space-y-2 text-xs text-text-secondary">
            <p className="font-medium text-text-primary text-[10px] uppercase tracking-wider mb-2">How credits work</p>
            <p>- Each <span className="text-text-primary">product image enhancement</span> uses 1 credit.</p>
            <p>- Each <span className="text-text-primary">model picture generation</span> uses 1 credit.</p>
            <p>- Credits are added by the admin. Contact support to request more.</p>
          </div>

          <form className="bg-bg-card border border-border rounded p-4 space-y-4" onSubmit={handleBuyCredits}>
            <div>
              <p className="font-medium text-text-primary text-[10px] uppercase tracking-wider mb-2">Buy Credits</p>
              <p className="text-xs text-text-secondary">
                Enter the purchase code to unlock additional credits for your store.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wider text-text-secondary">Amount</span>
                <input
                  type="number"
                  min={1}
                  value={buyAmount}
                  onChange={(event) => setBuyAmount(Number(event.target.value))}
                  className="w-full rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wider text-text-secondary">Code</span>
                <input
                  type="password"
                  value={buyCode}
                  onChange={(event) => setBuyCode(event.target.value)}
                  placeholder="Enter code"
                  className="w-full rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>

            {buyError && <p className="text-xs text-danger">{buyError}</p>}
            {buySuccess && <p className="text-xs text-accent">{buySuccess}</p>}

            <button
              type="submit"
              disabled={buyLoading}
              className="inline-flex items-center justify-center rounded bg-accent px-4 py-2 text-xs font-medium text-bg-primary transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {buyLoading ? "Processing..." : "Buy Credits"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
