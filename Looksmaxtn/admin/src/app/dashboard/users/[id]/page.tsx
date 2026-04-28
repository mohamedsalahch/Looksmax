"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { withAuthRequest } from "@/lib/authClient";

interface UserOrder {
  _id: string;
  totalPrice: number;
  orderStatus: string;
  createdAt: string;
  items: { quantity: number }[];
  shippingAddress?: {
    fullName: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
  };
}

interface UserDetail {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  isBlocked?: boolean;
  emailVerified?: boolean;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
      phone: string;
  };
  bodyProfile?: {
    heightCm?: string;
    weightKg?: string;
    usualSize?: string;
    profileImage?: string;
    gender?: string;
  };
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const handleToggleBlock = async () => {
    if (!user || user.role === "admin") return;
    const nextBlocked = !user.isBlocked;
    const confirmed = confirm(
      nextBlocked ? `Block access for "${user.name}"?` : `Unblock access for "${user.name}"?`
    );
    if (!confirmed) return;

    const response = await fetch(`/api/users/${user._id}`, withAuthRequest({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isBlocked: nextBlocked }),
    }));
    const data = await response.json();
    if (!response.ok || !data.user) return;
    setUser((current) => (current ? { ...current, isBlocked: data.user.isBlocked } : current));
  };

  useEffect(() => {
    fetch(`/api/users/${id}`, withAuthRequest())
      .then((r) => r.json())
      .then((data) => {
        setUser(data.user || null);
        setOrders(data.orders || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const statusColor = (status: string) => {
    switch (status) {
      case "canceled":
        return "text-danger bg-danger/10";
      case "returned":
        return "text-warning bg-warning/10";
      case "delivered":
        return "text-[#6b6055] bg-[#f1ede8]";
      case "shipping":
        return "text-info bg-info/10";
      case "confirmed":
        return "text-accent bg-accent/10";
      default:
        return "text-warning bg-warning/10";
    }
  };

  if (loading) return <p className="text-xs text-text-secondary animate-pulse">Loading...</p>;
  if (!user) return <p className="text-sm text-text-secondary">User not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/users"
          className="text-xs text-text-secondary hover:text-text-primary transition-colors mb-2 inline-block"
        >
          ← Back
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">{user.name}</h1>
            <p className="text-xs text-text-secondary">{user.email}</p>
          </div>
          {user.role !== "admin" && (
            <button
              type="button"
              onClick={handleToggleBlock}
              className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-wider cursor-pointer ${
                user.isBlocked
                  ? "bg-[#f1ede8] text-[#6b6055]"
                  : "bg-danger/10 text-danger"
              }`}
            >
              {user.isBlocked ? "Unblock User" : "Block User"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-bg-card border border-border rounded p-4">
          <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">User Details</p>
          <div className="space-y-2 text-xs">
            <p><span className="text-text-secondary">Role:</span> {user.role}</p>
            <p><span className="text-text-secondary">Access:</span> {user.isBlocked ? "Blocked" : user.emailVerified === false ? "Pending Verification" : "Active"}</p>
            <p><span className="text-text-secondary">Verification:</span> {user.emailVerified === false ? "Unverified" : "Verified"}</p>
            <p><span className="text-text-secondary">User ID:</span> <span className="font-mono">{user._id}</span></p>
            <p><span className="text-text-secondary">Joined:</span> {new Date(user.createdAt).toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded p-4">
          <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Saved Address</p>
          {user.address?.street || user.address?.city || user.address?.phone ? (
            <div className="space-y-1 text-xs">
              <p>{user.name}</p>
              {user.address.street && <p className="text-text-secondary">{user.address.street}</p>}
              <p className="text-text-secondary">
                {[user.address.city, user.address.state, user.address.zip].filter(Boolean).join(", ")}
              </p>
              {user.address.phone && <p className="text-text-secondary">{user.address.phone}</p>}
            </div>
          ) : (
            <p className="text-xs text-text-secondary">No saved address on the user profile.</p>
          )}
        </div>
      </div>

      <div className="bg-bg-card border border-border rounded p-4">
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Outfit Studio Profile</p>
        {user.bodyProfile?.heightCm ||
        user.bodyProfile?.weightKg ||
        user.bodyProfile?.usualSize ||
        user.bodyProfile?.gender ||
        user.bodyProfile?.profileImage ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              {user.bodyProfile?.profileImage ? (
                <div className="aspect-[4/5] overflow-hidden rounded border border-border bg-bg-secondary">
                  <img
                    src={user.bodyProfile.profileImage}
                    alt={`${user.name} profile`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-[4/5] flex items-center justify-center rounded border border-dashed border-border bg-bg-secondary text-[10px] uppercase tracking-wider text-text-secondary">
                  No profile image
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <p><span className="text-text-secondary">Height:</span> {user.bodyProfile?.heightCm || "—"}</p>
              <p><span className="text-text-secondary">Weight:</span> {user.bodyProfile?.weightKg || "—"}</p>
              <p><span className="text-text-secondary">Usual Size:</span> {user.bodyProfile?.usualSize || "—"}</p>
              <p><span className="text-text-secondary">Gender:</span> {user.bodyProfile?.gender || "—"}</p>
              <p className="md:col-span-2 break-all">
                <span className="text-text-secondary">Profile Image URL:</span> {user.bodyProfile?.profileImage || "—"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-secondary">No Outfit Studio profile saved for this user.</p>
        )}
      </div>

      <div className="bg-bg-card border border-border rounded overflow-hidden">
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-text-secondary uppercase tracking-wider">User Orders</p>
            <p className="text-[10px] text-text-secondary mt-1">
              Review order shipping addresses for this user.
            </p>
          </div>
          <span className="text-xs text-text-secondary bg-bg-secondary px-3 py-1 rounded">
            {orders.length} order{orders.length !== 1 ? "s" : ""}
          </span>
        </div>

        {orders.length === 0 ? (
          <div className="p-6">
            <p className="text-sm text-text-secondary">This user has no orders yet.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Shipping Address</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => (
                <tr key={order._id} className="hover:bg-bg-hover transition-colors align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/orders/${order._id}`}
                      className="text-xs font-mono text-accent hover:text-accent-hover transition-colors"
                    >
                      #{order._id.slice(-8).toUpperCase()}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {order.shippingAddress ? (
                      <div className="space-y-1">
                        <p className="text-text-primary">{order.shippingAddress.fullName}</p>
                        <p>{order.shippingAddress.street}</p>
                        <p>
                          {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
                        </p>
                        <p>{order.shippingAddress.phone}</p>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {order.items.reduce((total, item) => total + item.quantity, 0)}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">{order.totalPrice.toFixed(2)} TND</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 font-medium uppercase tracking-wider ${statusColor(order.orderStatus)}`}>
                      {order.orderStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
