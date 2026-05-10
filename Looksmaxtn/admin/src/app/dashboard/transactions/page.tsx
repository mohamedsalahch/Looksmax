"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { withAuthRequest } from "@/lib/authClient";

interface BalanceTransaction {
  _id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

interface BalanceData {
  balance: number;
  pendingWithdrawals: number;
  available: number;
  transactions: BalanceTransaction[];
}

const TYPE_LABELS: Record<string, string> = {
  earning: "Earning",
  withdrawal_pending: "Withdrawal requested",
  withdrawal_approved: "Withdrawal approved",
  withdrawal_rejected: "Withdrawal rejected",
  admin_adjustment: "Admin adjustment",
};

function formatMoney(value: number) {
  return `${value.toFixed(2)} TND`;
}

export default function TransactionsPage() {
  const router = useRouter();
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/admin/auth/me", withAuthRequest())
      .then((r) => r.json())
      .then(async (payload) => {
        if (payload.user?.role !== "store_owner") {
          router.replace("/dashboard");
          return;
        }
        const response = await fetch("/api/admin/users/me/balance", withAuthRequest());
        const body = await response.json();
        if (response.ok) setData(body);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [router]);

  const transactions = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.transactions;
    return data.transactions.filter((transaction) => transaction.type === filter);
  }, [data, filter]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold">Transactions</h1>
        <p className="text-xs text-text-secondary mt-1">
          Full history of earnings, withdrawals, and admin adjustments.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : !data ? (
        <p className="text-xs text-text-secondary">Unable to load transactions.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-bg-card border border-border rounded p-4 text-center">
              <p className="text-xl font-semibold">{formatMoney(data.available)}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-1">Available</p>
            </div>
            <div className="bg-bg-card border border-border rounded p-4 text-center">
              <p className="text-xl font-semibold">{formatMoney(data.pendingWithdrawals)}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-1">Pending</p>
            </div>
            <div className="bg-bg-card border border-border rounded p-4 text-center">
              <p className="text-xl font-semibold">{formatMoney(data.balance)}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-1">Total Balance</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
            {[
              { value: "all", label: "All" },
              { value: "earning", label: "Earnings" },
              { value: "withdrawal_approved", label: "Withdrawals" },
              { value: "withdrawal_pending", label: "Pending" },
              { value: "withdrawal_rejected", label: "Rejected" },
              { value: "admin_adjustment", label: "Adjustments" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`border px-3 py-1.5 transition-colors ${
                  filter === option.value
                    ? "border-text-primary text-text-primary"
                    : "border-border text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="bg-bg-card border border-border rounded">
            {transactions.length === 0 ? (
              <p className="text-xs text-text-secondary p-4">No transactions yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {transactions.map((transaction) => (
                  <div
                    key={transaction._id}
                    className="flex items-start justify-between gap-4 px-4 py-3 text-xs"
                  >
                    <div>
                      <p className="font-medium text-text-primary">
                        {TYPE_LABELS[transaction.type] || transaction.type}
                      </p>
                      <p className="text-text-secondary mt-1">{transaction.reason}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-text-secondary">
                        {new Date(transaction.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={
                          transaction.amount < 0
                            ? "text-danger"
                            : transaction.amount > 0
                            ? "text-success"
                            : "text-text-secondary"
                        }
                      >
                        {transaction.amount > 0 ? "+" : ""}
                        {transaction.amount === 0 ? "—" : formatMoney(transaction.amount)}
                      </p>
                      <p className="mt-1 text-[10px] text-text-secondary">
                        {formatMoney(transaction.balanceBefore)} →{" "}
                        {formatMoney(transaction.balanceAfter)}
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
