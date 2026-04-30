"use client";

import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

interface StoreRequest {
  _id: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  storeName: string;
  storeCategory: string;
  storeLocation: string;
  socialLink?: string;
  message?: string;
  status: "pending" | "approved" | "rejected";
  approvedAt?: string | null;
  rejectedAt?: string | null;
  createdAt: string;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export default function StoresPage() {
  const [stores, setStores] = useState<StoreRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    fetch("/api/stores", withAuthRequest())
      .then((response) => response.json())
      .then((data) => setStores(data.stores || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pendingCount = stores.filter((store) => store.status === "pending").length;
  const approvedCount = stores.filter((store) => store.status === "approved").length;
  const rejectedCount = stores.filter((store) => store.status === "rejected").length;

  const filteredStores = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    return stores.filter((store) => {
      const matchesStatus = statusFilter === "all" || store.status === statusFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          store.ownerName,
          store.ownerEmail,
          store.ownerPhone,
          store.storeName,
          store.storeCategory,
          store.storeLocation,
          store.socialLink || "",
          store.message || "",
          store.status,
        ].some((value) => value.toLowerCase().includes(normalizedSearch));

      return matchesStatus && matchesSearch;
    });
  }, [deferredSearch, statusFilter, stores]);

  const handleApprove = async (store: StoreRequest) => {
    if (store.status === "approved") return;
    if (!confirm(`Approve "${store.storeName}"?`)) return;

    const response = await fetch("/api/stores", withAuthRequest({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: store._id, action: "approve" }),
    }));
    const data = await response.json();
    if (!response.ok || !data.store) {
      alert(data.error || "Failed to approve store.");
      return;
    }

    setStores((current) =>
      current.map((entry) => (entry._id === store._id ? data.store : entry))
    );
  };

  const handleReject = async (store: StoreRequest) => {
    if (store.status === "rejected") return;
    if (!confirm(`Reject "${store.storeName}"? The owner will receive a rejection email.`)) return;

    const response = await fetch("/api/stores", withAuthRequest({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: store._id, action: "reject" }),
    }));
    const data = await response.json();
    if (!response.ok || !data.store) {
      alert(data.error || "Failed to reject store.");
      return;
    }

    setStores((current) =>
      current.map((entry) => (entry._id === store._id ? data.store : entry))
    );
  };

  const handleDelete = async (store: StoreRequest) => {
    if (!confirm(`Delete store request "${store.storeName}"? This cannot be undone.`)) return;

    const response = await fetch(`/api/stores?id=${store._id}`, withAuthRequest({ method: "DELETE" }));
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error || "Failed to delete store request.");
      return;
    }

    setStores((current) => current.filter((entry) => entry._id !== store._id));
    if (expandedStoreId === store._id) setExpandedStoreId(null);
  };

  const normalizedSearch = deferredSearch.trim();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-wide">Stores</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-warning bg-warning/10 px-3 py-1 rounded font-medium">
            {pendingCount} pending
          </span>
          <span className="text-xs text-[#6b6055] bg-[#f1ede8] px-3 py-1 rounded font-medium">
            {approvedCount} approved
          </span>
          <span className="text-xs text-danger bg-danger/10 px-3 py-1 rounded font-medium">
            {rejectedCount} rejected
          </span>
          <span className="text-xs text-text-secondary bg-bg-secondary px-3 py-1 rounded">
            {stores.length} total
          </span>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by store, owner, email, phone, category, location, or details..."
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : filteredStores.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">
            {normalizedSearch || statusFilter !== "all" ? "No stores match your search and filters" : "No stores created yet"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded">
          <table className="min-w-[980px] w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredStores.map((store) => {
                const isExpanded = expandedStoreId === store._id;
                const isApproved = store.status === "approved";
                const isRejected = store.status === "rejected";

                return (
                  <Fragment key={store._id}>
                    <tr className="hover:bg-bg-hover transition-colors">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedStoreId(isExpanded ? null : store._id)}
                          className="text-left text-xs font-medium text-accent hover:text-accent-hover transition-colors cursor-pointer"
                        >
                          {store.storeName}
                        </button>
                        {store.socialLink && (
                          <a
                            href={store.socialLink}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-[10px] text-text-secondary hover:text-text-primary transition-colors break-all"
                          >
                            {store.socialLink}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-text-primary">{store.ownerName}</p>
                        <p className="text-[10px] text-text-secondary break-all">{store.ownerEmail}</p>
                        <p className="text-[10px] text-text-secondary">{store.ownerPhone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">{store.storeCategory}</td>
                      <td className="px-4 py-3 text-xs text-text-secondary">{store.storeLocation}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${
                            isApproved
                              ? "text-[#6b6055] bg-[#f1ede8]"
                              : isRejected
                                ? "text-danger bg-danger/10"
                                : "text-warning bg-warning/10"
                          }`}
                        >
                          {isApproved ? "Approved" : isRejected ? "Rejected" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {new Date(store.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setExpandedStoreId(isExpanded ? null : store._id)}
                            className="text-[10px] text-info hover:text-info/80 transition-colors uppercase font-medium cursor-pointer"
                          >
                            Details
                          </button>
                          {!isApproved && !isRejected && (
                            <button
                              type="button"
                              onClick={() => handleApprove(store)}
                              className="text-[10px] text-[#6b6055] hover:text-[#5a4f46] transition-colors uppercase font-medium cursor-pointer"
                            >
                              Approve
                            </button>
                          )}
                          {!isRejected && !isApproved && (
                            <button
                              type="button"
                              onClick={() => handleReject(store)}
                              className="text-[10px] text-warning hover:text-warning/80 transition-colors uppercase font-medium cursor-pointer"
                            >
                              Reject
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(store)}
                            className="text-[10px] text-danger hover:text-danger/80 transition-colors uppercase font-medium cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-bg-secondary/40">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid gap-4 text-xs md:grid-cols-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">Owner</p>
                              <p className="text-text-primary">{store.ownerName}</p>
                              <p className="text-text-secondary break-all">{store.ownerEmail}</p>
                              <p className="text-text-secondary">{store.ownerPhone}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">Store</p>
                              <p className="text-text-primary">{store.storeName}</p>
                              <p className="text-text-secondary">{store.storeCategory}</p>
                              <p className="text-text-secondary">{store.storeLocation}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">Approval</p>
                              <p className="text-text-primary">{isApproved ? "Approved" : isRejected ? "Rejected" : "Pending"}</p>
                              <p className="text-text-secondary">
                                {store.approvedAt
                                  ? `Approved ${new Date(store.approvedAt).toLocaleString()}`
                                  : store.rejectedAt
                                    ? `Rejected ${new Date(store.rejectedAt).toLocaleString()}`
                                    : "Not approved yet"}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 border-t border-border pt-4">
                            <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">Details</p>
                            <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
                              {store.message || "No additional details provided."}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
