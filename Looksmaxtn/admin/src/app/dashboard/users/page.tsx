"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { withAuthRequest } from "@/lib/authClient";

interface User {
  _id: string; name: string; email: string; role: string; createdAt: string;
  isBlocked?: boolean;
  emailVerified?: boolean;
  storeName?: string;
  storeType?: "thrift" | "retail" | null;
  storeApprovalStatus?: "pending" | "approved" | "rejected" | null;
  address?: { street: string; city: string; state: string; zip: string; phone: string; };
}

type SortKey = "name" | "email" | "role" | "status" | "city" | "joined";
type SortDirection = "asc" | "desc";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("joined");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    fetch("/api/users", withAuthRequest()).then((r) => r.json()).then((d) => setUsers(d.users || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleToggleBlock = async (user: User) => {
    const nextBlocked = !user.isBlocked;
    const confirmed = confirm(
      nextBlocked
        ? `Block access for "${user.name}"?`
        : `Unblock access for "${user.name}"?`
    );
    if (!confirmed) return;

    const response = await fetch("/api/users", withAuthRequest({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user._id, isBlocked: nextBlocked }),
    }));

    const data = await response.json();
    if (!response.ok || !data.user) return;

    setUsers((current) =>
      current.map((entry) =>
        entry._id === user._id ? { ...entry, isBlocked: data.user.isBlocked } : entry
      )
    );
  };

  const handleStoreApproval = async (user: User, storeApprovalStatus: "pending" | "approved" | "rejected") => {
    const response = await fetch("/api/users", withAuthRequest({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user._id, storeApprovalStatus }),
    }));

    const data = await response.json();
    if (!response.ok || !data.user) return;

    setUsers((current) =>
      current.map((entry) =>
        entry._id === user._id ? { ...entry, storeApprovalStatus: data.user.storeApprovalStatus } : entry
      )
    );
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/users?id=${id}`, withAuthRequest({ method: "DELETE" }));
    setUsers((u) => u.filter((x) => x._id !== id));
  };

  const filteredUsers = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    return users.filter((u) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          u.name,
          u.email,
          u.role,
          u.storeName || "",
          u.storeType || "",
          u.storeApprovalStatus || "",
          u.address?.street || "",
          u.address?.city || "",
          u.address?.state || "",
          u.address?.zip || "",
          u.address?.phone || "",
        ].some((value) => value.toLowerCase().includes(normalizedSearch));

      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      const isBlocked = Boolean(u.isBlocked);
      const isVerified = u.emailVerified !== false;
      const accessState = isBlocked ? "blocked" : isVerified ? "verified" : "pending";
      const matchesAccess = accessFilter === "all" || accessState === accessFilter;

      return matchesSearch && matchesRole && matchesAccess;
    });
  }, [accessFilter, deferredSearch, roleFilter, users]);

  const sortedUsers = useMemo(() => {
    const items = [...filteredUsers];

    const getSortableValue = (user: User) => {
      switch (sortKey) {
        case "name":
          return user.name;
        case "email":
          return user.email;
        case "role":
          return user.role;
        case "status":
          return user.isBlocked
            ? "blocked"
            : user.role === "store_owner" && user.storeApprovalStatus && user.storeApprovalStatus !== "approved"
              ? `store ${user.storeApprovalStatus}`
              : user.emailVerified === false
                ? "pending verification"
                : "active";
        case "city":
          return user.address?.city || "";
        default:
          return user.createdAt;
      }
    };

    items.sort((a, b) => {
      const left = getSortableValue(a);
      const right = getSortableValue(b);

      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return items;
  }, [filteredUsers, sortDirection, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-[9px] text-text-secondary/60">↕</span>;
    return <span className="text-[9px] text-accent">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  const normalizedSearch = deferredSearch.trim();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-wide">Users</h1>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, city, phone, role, or status..."
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        >
          <option value="all">All roles</option>
          <option value="user">Users</option>
          <option value="admin">Admins</option>
        </select>
        <select
          value={accessFilter}
          onChange={(e) => setAccessFilter(e.target.value)}
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        >
          <option value="all">All access</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending verification</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : sortedUsers.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">
            {normalizedSearch || roleFilter !== "all" || accessFilter !== "all"
              ? "No users match your search and filters"
              : "No users found"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded">
          <table className="min-w-[920px] w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 cursor-pointer">
                    User {renderSortIndicator("name")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("email")} className="inline-flex items-center gap-1 cursor-pointer">
                    Email {renderSortIndicator("email")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("role")} className="inline-flex items-center gap-1 cursor-pointer">
                    Role {renderSortIndicator("role")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("status")} className="inline-flex items-center gap-1 cursor-pointer">
                    Access {renderSortIndicator("status")}
                  </button>
                </th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("city")} className="inline-flex items-center gap-1 cursor-pointer">
                    Address {renderSortIndicator("city")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("joined")} className="inline-flex items-center gap-1 cursor-pointer">
                    Joined {renderSortIndicator("joined")}
                  </button>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedUsers.map((u) => (
                <tr key={u._id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/users/${u._id}`}
                      className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                    >
                      {u.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-primary break-all">{u.email}</p>
                    <p className="text-[10px] text-text-secondary">
                      {u.isBlocked ? "Blocked" : u.emailVerified === false ? "Pending verification" : "Verified"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${
                      u.role === "admin" ? "text-accent bg-accent/10" : "text-info bg-info/10"
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${
                        u.isBlocked
                          ? "text-danger bg-danger/10"
                          : u.role === "store_owner" && u.storeApprovalStatus && u.storeApprovalStatus !== "approved"
                            ? "text-warning bg-warning/10"
                            : u.emailVerified === false
                            ? "text-warning bg-warning/10"
                            : "text-[#6b6055] bg-[#f1ede8]"
                      }`}
                    >
                      {u.isBlocked
                        ? "Blocked"
                        : u.role === "store_owner" && u.storeApprovalStatus && u.storeApprovalStatus !== "approved"
                          ? `Store ${u.storeApprovalStatus}`
                          : u.emailVerified === false
                            ? "Pending Verification"
                            : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {u.role === "store_owner"
                      ? `${u.storeName || "—"}${u.storeType ? ` · ${u.storeType}` : ""}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {u.address?.city ? `${u.address.city}, ${u.address.state}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/dashboard/users/${u._id}`}
                        className="text-[10px] text-info hover:text-info/80 transition-colors uppercase font-medium"
                      >
                        Details
                      </Link>
                      {u.role !== "admin" && (
                        <button
                          onClick={() => handleToggleBlock(u)}
                          className={`text-[10px] uppercase font-medium cursor-pointer ${
                            u.isBlocked ? "text-[#6b6055] hover:text-[#5a4f46]" : "text-warning hover:text-warning/80"
                          }`}
                        >
                          {u.isBlocked ? "Unblock" : "Block"}
                        </button>
                      )}
                      {u.role === "store_owner" && u.storeApprovalStatus !== "approved" && (
                        <button
                          onClick={() => handleStoreApproval(u, "approved")}
                          className="text-[10px] text-success hover:text-success/80 transition-colors uppercase font-medium cursor-pointer"
                        >
                          Approve store
                        </button>
                      )}
                      {u.role === "store_owner" && u.storeApprovalStatus === "approved" && (
                        <button
                          onClick={() => handleStoreApproval(u, "pending")}
                          className="text-[10px] text-warning hover:text-warning/80 transition-colors uppercase font-medium cursor-pointer"
                        >
                          Set pending
                        </button>
                      )}
                      {u.role !== "admin" && (
                        <button onClick={() => handleDelete(u._id, u.name)}
                          className="text-[10px] text-danger hover:text-danger/80 transition-colors uppercase font-medium cursor-pointer">
                          Delete
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
