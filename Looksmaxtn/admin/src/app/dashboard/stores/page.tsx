"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { withAuthRequest } from "@/lib/authClient";

type StoreStatus = "pending" | "approved" | "rejected";

interface StoreApplication {
  _id: string;
  name: string;
  storeName: string;
  email: string;
  category: "clothes" | "fragrances" | "accessories";
  categories?: ("clothes" | "fragrances" | "accessories")[];
  storeType?: "thrift" | "retail" | string;
  address: string;
  phoneNumber: string;
  additionalInformation?: string;
  status: StoreStatus;
  reviewedAt?: string | null;
  createdAt: string;
  credits?: { allowed: number; used: number } | null;
}

const categoryLabels: Record<StoreApplication["category"], string> = {
  clothes: "Clothes",
  fragrances: "Fragrances",
  accessories: "Accessories",
};

const statusClass: Record<StoreStatus, string> = {
  pending: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-danger/10 text-danger",
};

export default function StoresPage() {
  const searchParams = useSearchParams();
  const focusStoreId = searchParams.get("storeId");
  const [stores, setStores] = useState<StoreApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StoreStatus | "all">("all");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const formatCategories = (store: StoreApplication) => {
    const values = Array.from(new Set([...(store.categories || []), store.category].filter(Boolean)));
    return values.map((category) => categoryLabels[category as StoreApplication["category"]]).join(", ");
  };

  const formatValue = (value: string | null | undefined) => (value && value.trim() ? value : "Not provided");
  const formatStoreType = (value?: string | null) => {
    if (!value) return "Retail Store";
    if (value === "thrift") return "Thrift Store";
    if (value === "retail") return "Retail Store";
    return value;
  };

  useEffect(() => {
    fetch("/api/store-applications", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setStores(d.stores || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!focusStoreId || loading) return;
    if (!stores.some((store) => store._id === focusStoreId)) return;

    setExpanded(focusStoreId);
    window.setTimeout(() => {
      document.getElementById(`store-${focusStoreId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }, [focusStoreId, loading, stores]);

  const updateStoreStatus = async (store: StoreApplication, status: "approved" | "rejected") => {
    const action = status === "approved" ? "approve" : "reject";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this store request?`)) return;

    setBusyId(store._id);
    setNotice(null);

    try {
      const res = await fetch(
        "/api/store-applications",
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: store._id, status }),
        })
      );
      const data = await res.json();

      if (!res.ok) {
        setNotice({ type: "error", text: data.error || "Unable to update store request." });
        return;
      }

      setStores((current) => current.map((item) => (item._id === store._id ? data.store : item)));
      setNotice({
        type: data.emailWarning ? "error" : "success",
        text: data.emailWarning || `Store request ${status}. Email sent to ${store.email}.`,
      });
    } catch {
      setNotice({ type: "error", text: "Network error. Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (store: StoreApplication) => {
    if (!confirm("Delete this store request?")) return;
    setBusyId(store._id);
    setNotice(null);

    try {
      const res = await fetch(
        "/api/store-applications",
        withAuthRequest({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: store._id }),
        })
      );

      if (!res.ok) {
        const data = await res.json();
        setNotice({ type: "error", text: data.error || "Unable to delete store request." });
        return;
      }

      setStores((current) => current.filter((item) => item._id !== store._id));
      const data = await res.json().catch(() => null);
      setNotice({
        type: "success",
        text: data?.message || "Store request deleted. Its products are now hidden from the storefront.",
      });
    } catch {
      setNotice({ type: "error", text: "Network error. Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(
    () => ({
      total: stores.length,
      pending: stores.filter((store) => store.status === "pending").length,
      approved: stores.filter((store) => store.status === "approved").length,
      rejected: stores.filter((store) => store.status === "rejected").length,
    }),
    [stores]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const filteredStores = stores.filter((store) => {
    const matchesStatus = filter === "all" || store.status === filter;
    const matchesSearch =
      !normalizedSearch ||
      [store.name, store.storeName, store.email, store.address, store.phoneNumber, store.additionalInformation || ""].some(
        (value) => value.toLowerCase().includes(normalizedSearch)
      );

    return matchesStatus && matchesSearch;
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-wide">Stores</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-warning bg-warning/10 px-3 py-1 rounded font-medium">
            {counts.pending} pending
          </span>
          <span className="text-xs text-text-secondary bg-bg-secondary px-3 py-1 rounded">
            {counts.total} total
          </span>
        </div>
      </div>

      {notice && (
        <div
          className={`mb-6 border px-4 py-3 text-xs ${
            notice.type === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search stores by store name, owner, email, address, phone, or information..."
          className="input-line"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as StoreStatus | "all")}
          className="bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-text-primary transition-colors"
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
            {search || filter !== "all" ? "No store requests match your filters" : "No store requests yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredStores.map((store) => (
            <div key={store._id} id={`store-${store._id}`} className="border border-border bg-bg-secondary/30 rounded">
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left cursor-pointer"
                onClick={() => setExpanded(expanded === store._id ? null : store._id)}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium">{store.storeName || store.name}</p>
                    <span className={`rounded px-2 py-0.5 text-[10px] uppercase ${statusClass[store.status]}`}>
                      {store.status}
                    </span>
                    <span className="rounded bg-bg-primary px-2 py-0.5 text-[10px] text-text-secondary">
                      {formatCategories(store)}
                    </span>
                    {store.storeType && (
                      <span className="rounded bg-bg-primary px-2 py-0.5 text-[10px] text-text-secondary uppercase">
                        {store.storeType}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-text-secondary truncate">
                    {store.name} - {store.email} - {store.phoneNumber}
                  </p>
                </div>
                <span className="text-[10px] text-text-secondary shrink-0 ml-4">
                  {new Date(store.createdAt).toLocaleDateString()}
                </span>
              </button>

              {expanded === store._id && (
                <div className="px-4 pb-4 border-t border-border">
                  <div className="grid grid-cols-1 gap-3 pt-3 text-xs md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary">Owner</p>
                      <p className="text-text-primary">{formatValue(store.name)}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary">Store Name</p>
                      <p className="text-text-primary">{formatValue(store.storeName)}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary">Email</p>
                      <p className="text-text-primary">{formatValue(store.email)}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary">Store Type</p>
                      <p className="text-text-primary">{formatStoreType(store.storeType)}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary">Selected Categories</p>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set([...(store.categories || []), store.category].filter(Boolean))).map((category) => (
                          <span
                            key={category}
                            className="rounded bg-bg-primary px-2 py-0.5 text-[10px] text-text-primary uppercase"
                          >
                            {categoryLabels[category as StoreApplication["category"]]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary">Phone Number</p>
                      <p className="text-text-primary">{formatValue(store.phoneNumber)}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary">Address</p>
                      <p className="text-text-primary">{formatValue(store.address)}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary">Additional Information</p>
                        <p className="whitespace-pre-wrap text-text-primary">
                          {store.additionalInformation?.trim() ? store.additionalInformation : "Not provided"}
                        </p>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary">Submitted</p>
                      <p className="text-text-primary">{new Date(store.createdAt).toLocaleString()}</p>
                    </div>
                    {store.reviewedAt && (
                      <div>
                        <p className="mb-1 text-[10px] uppercase tracking-wider text-text-secondary">Reviewed</p>
                        <p className="text-text-primary">{new Date(store.reviewedAt).toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  {store.credits && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <p className="mb-2 text-[10px] uppercase tracking-wider text-text-secondary">AI Credits</p>
                      <div className="flex flex-wrap gap-6 text-xs">
                        <p>
                          <span className="text-text-secondary">Added: </span>
                          <span className="font-medium">{store.credits.allowed}</span>
                        </p>
                        <p>
                          <span className="text-text-secondary">Used: </span>
                          <span className="font-medium">{store.credits.used}</span>
                        </p>
                        <p>
                          <span className="text-text-secondary">Remaining: </span>
                          <span className="font-medium">{Math.max(0, store.credits.allowed - store.credits.used)}</span>
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-border">
                    <button
                      onClick={() => updateStoreStatus(store, "approved")}
                      disabled={busyId === store._id || store.status === "approved"}
                      className="text-[10px] text-success hover:text-success/80 transition-colors uppercase font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => updateStoreStatus(store, "rejected")}
                      disabled={busyId === store._id || store.status === "rejected"}
                      className="text-[10px] text-danger hover:text-danger/80 transition-colors uppercase font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleDelete(store)}
                      disabled={busyId === store._id}
                      className="text-[10px] text-danger hover:text-danger/80 transition-colors uppercase font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Delete
                    </button>
                    <a
                      href={`mailto:${store.email}?subject=Re: LOOKSMAX store request`}
                      className="text-[10px] text-accent hover:text-accent/80 transition-colors uppercase font-medium"
                    >
                      Reply via Email
                    </a>
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
