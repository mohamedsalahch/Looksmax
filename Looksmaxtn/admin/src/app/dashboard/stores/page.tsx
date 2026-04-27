"use client";

import { useEffect, useMemo, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

type StoreStatus = "pending" | "approved" | "disabled";

interface StoreOwner {
  name?: string;
  email?: string;
}

interface Store {
  _id: string;
  name: string;
  slug: string;
  logo: string;
  category: string;
  status: StoreStatus;
  isMainStore?: boolean;
  owner?: StoreOwner;
  createdAt: string;
}

const statusStyles: Record<StoreStatus, string> = {
  pending: "bg-warning/10 text-warning",
  approved: "bg-[#f1ede8] text-[#6b6055]",
  disabled: "bg-danger/10 text-danger",
};

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  const loadStores = () => {
    fetch("/api/stores", withAuthRequest())
      .then((response) => response.json())
      .then((data) => setStores(data.stores || []))
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStores();
  }, []);

  const filteredStores = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return stores.filter((store) => {
      const matchesStatus = statusFilter === "all" || store.status === statusFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          store.name,
          store.slug,
          store.category,
          store.owner?.name || "",
          store.owner?.email || "",
        ].some((value) => value.toLowerCase().includes(normalizedSearch));

      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter, stores]);

  const updateStoreStatus = async (store: Store, action: "approve" | "disable") => {
    setUpdatingId(store._id);
    try {
      const response = await fetch(`/api/stores/${store._id}/${action}`, withAuthRequest({ method: "POST" }));
      const data = await response.json();
      if (!response.ok || !data.store) return;
      setStores((current) => current.map((entry) => (entry._id === store._id ? data.store : entry)));
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Stores</h1>
          <p className="mt-1 text-xs text-text-secondary">Review marketplace stores and control visibility.</p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by store, owner, category, or slug..."
          className="bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : filteredStores.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">No stores found</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded">
          <table className="min-w-[860px] w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredStores.map((store) => (
                <tr key={store._id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 overflow-hidden border border-border bg-bg-secondary">
                        {store.logo ? (
                          <img src={store.logo} alt={store.name} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div>
                        <p className="text-xs font-medium">{store.name}</p>
                        <p className="text-[10px] text-text-secondary">{store.slug}</p>
                        {store.isMainStore && (
                          <p className="mt-1 text-[10px] uppercase tracking-wider text-accent">Main store</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-primary">{store.owner?.name || "Unknown"}</p>
                    <p className="text-[10px] text-text-secondary">{store.owner?.email || ""}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary capitalize">{store.category}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-1 font-medium uppercase tracking-wider ${statusStyles[store.status]}`}>
                      {store.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {new Date(store.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {store.status !== "approved" && (
                        <button
                          type="button"
                          onClick={() => updateStoreStatus(store, "approve")}
                          disabled={updatingId === store._id}
                          className="text-[10px] text-info hover:text-info/80 transition-colors uppercase font-medium disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {store.status !== "disabled" && !store.isMainStore && (
                        <button
                          type="button"
                          onClick={() => updateStoreStatus(store, "disable")}
                          disabled={updatingId === store._id}
                          className="text-[10px] text-danger hover:text-danger/80 transition-colors uppercase font-medium disabled:opacity-50"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
