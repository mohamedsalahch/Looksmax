"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { withAuthRequest } from "@/lib/authClient";

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
  owner?: {
    _id: string;
    name: string;
    email: string;
    storeName: string;
    balance: number;
  } | null;
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

export default function AdminWithdrawalsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [reviewNoteById, setReviewNoteById] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = async (statusFilter: typeof filter) => {
    setLoading(true);
    try {
      const url = statusFilter === "all"
        ? "/api/admin/withdrawals"
        : `/api/admin/withdrawals?status=${statusFilter}`;
      const response = await fetch(url, withAuthRequest());
      const payload = await response.json();
      if (response.ok) {
        setWithdrawals(payload.withdrawals || []);
      } else {
        setWithdrawals([]);
      }
    } catch {
      setWithdrawals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/admin/auth/me", withAuthRequest())
      .then((r) => r.json())
      .then((payload) => {
        if (payload.user?.role !== "admin") {
          router.replace("/dashboard");
          return;
        }
        return load(filter);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const reviewWithdrawal = async (withdrawal: Withdrawal, action: "approve" | "reject") => {
    setBusyId(withdrawal._id);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/withdrawals/${withdrawal._id}`,
        withAuthRequest({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            reviewNote: reviewNoteById[withdrawal._id] || "",
          }),
        })
      );
      const payload = await response.json();
      if (!response.ok) {
        setNotice({ type: "error", text: payload.error || "Action failed" });
        return;
      }
      setNotice({
        type: "success",
        text: action === "approve" ? "Withdrawal approved." : "Withdrawal rejected.",
      });
      void load(filter);
    } catch {
      setNotice({ type: "error", text: "Network error. Please try again." });
    } finally {
      setBusyId("");
    }
  };

  const counts = useMemo(() => {
    const total = withdrawals.length;
    const pending = withdrawals.filter((withdrawal) => withdrawal.status === "pending").length;
    return { total, pending };
  }, [withdrawals]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold">Withdrawal Requests</h1>
        <p className="text-xs text-text-secondary mt-1">
          Review and approve or reject withdrawal requests from store owners.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
        {(["pending", "approved", "rejected", "all"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`border px-3 py-1.5 transition-colors ${
              filter === option
                ? "border-text-primary text-text-primary"
                : "border-border text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {option}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-text-secondary self-center">
          Showing {counts.total} · {counts.pending} pending
        </span>
      </div>

      {notice && (
        <p className={`text-xs ${notice.type === "success" ? "text-success" : "text-danger"}`}>
          {notice.text}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : withdrawals.length === 0 ? (
        <p className="text-xs text-text-secondary">No withdrawal requests for this filter.</p>
      ) : (
        <div className="space-y-3">
          {withdrawals.map((withdrawal) => (
            <div
              key={withdrawal._id}
              className="bg-bg-card border border-border rounded p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-text-primary">
                    {withdrawal.owner?.storeName || withdrawal.owner?.name || "Unknown owner"}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                    {withdrawal.owner?.email}
                  </p>
                  {withdrawal.owner && (
                    <p className="text-[10px] text-text-secondary mt-1">
                      Current balance: {formatMoney(withdrawal.owner.balance)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{formatMoney(withdrawal.amount)}</p>
                  <p
                    className={`text-[10px] uppercase tracking-wider ${
                      STATUS_STYLES[withdrawal.status] || ""
                    }`}
                  >
                    {withdrawal.status}
                  </p>
                  <p className="text-[10px] text-text-secondary mt-1">
                    {new Date(withdrawal.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="text-xs space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                  {PAYMENT_METHOD_LABELS[withdrawal.paymentMethod] || withdrawal.paymentMethod}
                </p>
                <p className="text-text-primary whitespace-pre-wrap">{withdrawal.paymentDetails}</p>
                {withdrawal.note && (
                  <p className="text-text-secondary italic">Note: {withdrawal.note}</p>
                )}
                {withdrawal.reviewNote && (
                  <p className="text-text-secondary">Admin note: {withdrawal.reviewNote}</p>
                )}
                {withdrawal.reviewedAt && (
                  <p className="text-[10px] text-text-secondary">
                    Reviewed {new Date(withdrawal.reviewedAt).toLocaleString()}
                  </p>
                )}
              </div>

              {withdrawal.status === "pending" && (
                <div className="space-y-2 border-t border-border pt-3">
                  <input
                    type="text"
                    value={reviewNoteById[withdrawal._id] || ""}
                    onChange={(event) =>
                      setReviewNoteById((current) => ({
                        ...current,
                        [withdrawal._id]: event.target.value,
                      }))
                    }
                    placeholder="Review note (optional)"
                    className="input-line w-full"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === withdrawal._id}
                      onClick={() => reviewWithdrawal(withdrawal, "approve")}
                      className="border border-border px-3 py-2 text-[10px] uppercase tracking-wider text-success hover:bg-bg-hover disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === withdrawal._id}
                      onClick={() => reviewWithdrawal(withdrawal, "reject")}
                      className="border border-border px-3 py-2 text-[10px] uppercase tracking-wider text-danger hover:bg-bg-hover disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
