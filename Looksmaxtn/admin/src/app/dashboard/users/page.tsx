"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface User {
  _id: string; name: string; email: string; role: string; createdAt: string;
  isBlocked?: boolean;
  address?: { street: string; city: string; state: string; zip: string; phone: string; };
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleToggleBlock = async (user: User) => {
    const nextBlocked = !user.isBlocked;
    const confirmed = confirm(
      nextBlocked
        ? `Block access for "${user.name}"?`
        : `Unblock access for "${user.name}"?`
    );
    if (!confirmed) return;

    const response = await fetch("/api/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user._id, isBlocked: nextBlocked }),
    });

    const data = await response.json();
    if (!response.ok || !data.user) return;

    setUsers((current) =>
      current.map((entry) =>
        entry._id === user._id ? { ...entry, isBlocked: data.user.isBlocked } : entry
      )
    );
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/users?id=${id}`, { method: "DELETE" });
    setUsers((u) => u.filter((x) => x._id !== id));
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = normalizedSearch
    ? users.filter((u) =>
        [
          u.name,
          u.email,
          u.role,
          u.address?.street || "",
          u.address?.city || "",
          u.address?.state || "",
          u.address?.zip || "",
          u.address?.phone || "",
        ].some((value) => value.toLowerCase().includes(normalizedSearch))
      )
    : users;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-wide mb-6">Users</h1>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by name, email, city, phone, or role..."
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        />
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : filteredUsers.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">
            {search ? "No users match your search" : "No users found"}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.map((u) => (
                <tr key={u._id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/users/${u._id}`}
                      className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                    >
                      {u.name}
                    </Link>
                    <p className="text-[10px] text-text-secondary">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${
                      u.role === "admin" ? "text-accent bg-accent/10" : "text-info bg-info/10"
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${
                        u.isBlocked ? "text-danger bg-danger/10" : "text-success bg-success/10"
                      }`}
                    >
                      {u.isBlocked ? "Blocked" : "Active"}
                    </span>
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
                            u.isBlocked ? "text-success hover:text-success/80" : "text-warning hover:text-warning/80"
                          }`}
                        >
                          {u.isBlocked ? "Unblock" : "Block"}
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
