"use client";

import { useEffect, useState } from "react";
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

interface Withdrawal {
  _id: string;
  amount: number;
  paymentMethod: string;
  paymentDetails: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  reviewedAt?: string | null;
  reviewNote?: string;
  createdAt: string;
}

interface BalanceSale {
  _id: string;
  order: string;
  product: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  gross: number;
  net: number;
  purchasedAt: string;
  creditedAt: string;
}

interface BalanceData {
  balance: number;
  pendingWithdrawals: number;
  available: number;
  transactions: BalanceTransaction[];
  withdrawals: Withdrawal[];
  sales: BalanceSale[];
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  d17: "D17",
  other: "Other",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "text-warning",
  approved: "text-success",
  rejected: "text-danger",
};

function formatMoney(value: number) {
  return `${value.toFixed(2)} TND`;
}

export default function BalancePage() {
  const router = useRouter();
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [note, setNote] = useState("");

  const loadBalance = async () => {
    const response = await fetch("/api/admin/users/me/balance", withAuthRequest());
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load balance");
    setData(payload);
  };

  useEffect(() => {
    fetch("/api/admin/auth/me", withAuthRequest())
      .then((r) => r.json())
      .then((payload) => {
        if (payload.user?.role !== "store_owner") {
          router.replace("/dashboard");
          return;
        }
        return loadBalance();
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [router]);

  const submitWithdrawal = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        "/api/admin/users/me/withdrawals",
        withAuthRequest({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(amount),
            paymentMethod,
            paymentDetails,
            note,
          }),
        })
      );
      const payload = await response.json();
      if (!response.ok) {
        setNotice({ type: "error", text: payload.error || "Unable to submit request" });
        return;
      }
      setData({
        balance: payload.balance,
        pendingWithdrawals: payload.pendingWithdrawals,
        available: payload.available,
        transactions: payload.transactions,
        withdrawals: payload.withdrawals,
        sales: payload.sales || [],
      });
      setAmount("");
      setPaymentDetails("");
      setNote("");
      setNotice({ type: "success", text: "Withdrawal request submitted." });
    } catch {
      setNotice({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold">Balance & Withdrawals</h1>
        <p className="text-xs text-text-secondary mt-1">
          Earnings from delivered orders are credited automatically (10% commission deducted).
          Request a withdrawal and the admin will review it.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : !data ? (
        <p className="text-xs text-text-secondary">Unable to load balance.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-bg-card border border-border rounded p-4 text-center">
              <p className="text-2xl font-semibold">{formatMoney(data.available)}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-1">Available</p>
            </div>
            <div className="bg-bg-card border border-border rounded p-4 text-center">
              <p className="text-2xl font-semibold">{formatMoney(data.pendingWithdrawals)}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-1">Pending</p>
            </div>
            <div className="bg-bg-card border border-border rounded p-4 text-center">
              <p className="text-2xl font-semibold">{formatMoney(data.balance)}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-1">Total Balance</p>
            </div>
          </div>

          <form
            onSubmit={submitWithdrawal}
            className="bg-bg-card border border-border rounded p-4 space-y-3"
          >
            <p className="font-medium text-text-primary text-[10px] uppercase tracking-wider">
              Request a withdrawal
            </p>

            {notice && (
              <p
                className={`text-xs ${
                  notice.type === "success" ? "text-success" : "text-danger"
                }`}
              >
                {notice.text}
              </p>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-text-secondary">Amount (TND)</label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="input-line w-full mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-text-secondary">Payment method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="input-line w-full mt-1"
                >
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="d17">D17</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-text-secondary">
                Payment details (RIB, phone for D17, etc.)
              </label>
              <textarea
                value={paymentDetails}
                onChange={(e) => setPaymentDetails(e.target.value)}
                rows={2}
                required
                className="input-line w-full mt-1"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-text-secondary">Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input-line w-full mt-1"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="border border-border px-4 py-2 text-[10px] uppercase tracking-wider text-text-primary hover:bg-bg-hover disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit request"}
            </button>
          </form>

          <div className="bg-bg-card border border-border rounded p-4 space-y-3">
            <p className="font-medium text-text-primary text-[10px] uppercase tracking-wider">
              Balance history
            </p>
            {data.sales.length === 0 ? (
              <p className="text-xs text-text-secondary">No credited sales yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.sales.map((sale) => (
                  <div key={sale._id} className="py-3 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-text-primary">{sale.productName}</p>
                        <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                          Qty {sale.quantity} · Bought {new Date(sale.purchasedAt).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-text-secondary">
                          Order #{sale.order.slice(-8).toUpperCase()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-text-primary">{formatMoney(sale.net)}</p>
                        <p className="text-[10px] text-text-secondary">
                          {formatMoney(sale.gross)} before commission
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-bg-card border border-border rounded p-4 space-y-3">
            <p className="font-medium text-text-primary text-[10px] uppercase tracking-wider">
              My withdrawal requests
            </p>
            {data.withdrawals.length === 0 ? (
              <p className="text-xs text-text-secondary">No withdrawal requests yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.withdrawals.map((withdrawal) => (
                  <div key={withdrawal._id} className="py-3 text-xs space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-text-primary">{formatMoney(withdrawal.amount)}</p>
                        <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                          {PAYMENT_METHOD_LABELS[withdrawal.paymentMethod] || withdrawal.paymentMethod} ·{" "}
                          {new Date(withdrawal.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] uppercase tracking-wider ${
                          STATUS_STYLES[withdrawal.status] || ""
                        }`}
                      >
                        {withdrawal.status}
                      </span>
                    </div>
                    <p className="text-text-secondary whitespace-pre-wrap">{withdrawal.paymentDetails}</p>
                    {withdrawal.note && (
                      <p className="text-text-secondary italic">Note: {withdrawal.note}</p>
                    )}
                    {withdrawal.reviewNote && (
                      <p className="text-text-secondary">
                        Admin: {withdrawal.reviewNote}
                      </p>
                    )}
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
