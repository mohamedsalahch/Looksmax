"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { withAuthRequest } from "@/lib/authClient";

interface CreditTransaction {
  _id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
  createdBy?: { name?: string; email?: string } | null;
}

interface Credits {
  allowed: number;
  used: number;
  remaining: number;
  transactions?: CreditTransaction[];
}

export default function CreditsPage() {
  const router = useRouter();
  const [credits, setCredits] = useState<Credits | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCredits = async () => {
    const response = await fetch("/api/admin/users/me/store-credits", withAuthRequest());
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to load credits");
    }
    setCredits(data);
  };

  useEffect(() => {
    fetch("/api/admin/auth/me", withAuthRequest())
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

  const usedPct = credits ? Math.min(100, Math.round((credits.used / credits.allowed) * 100)) : 0;
  const transactions = credits?.transactions || [];

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
                  credits.remaining === 0 ? "bg-danger" : usedPct > 75 ? "bg-warning" : "bg-text-primary"
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

          <div className="bg-bg-card border border-border rounded p-4 space-y-4">
            <div>
              <p className="font-medium text-text-primary text-[10px] uppercase tracking-wider mb-2">Balance History</p>
              <p className="text-xs text-text-secondary">
                Credits added by the admin and credits consumed by generation are listed here.
              </p>
            </div>

            {transactions.length === 0 ? (
              <p className="text-xs text-text-secondary">No credit history yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {transactions.map((transaction) => (
                  <div key={transaction._id} className="flex items-start justify-between gap-4 py-3 text-xs">
                    <div>
                      <p className="font-medium text-text-primary">{transaction.reason || "Credit update"}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-text-secondary">
                        {new Date(transaction.createdAt).toLocaleString()}
                        {transaction.createdBy?.name ? ` · ${transaction.createdBy.name}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={transaction.amount < 0 ? "text-danger" : "text-success"}>
                        {transaction.amount > 0 ? "+" : ""}{transaction.amount}
                      </p>
                      <p className="mt-1 text-[10px] text-text-secondary">
                        {transaction.balanceBefore} → {transaction.balanceAfter}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
