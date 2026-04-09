"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

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
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
  };
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${id}`)
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
        return "text-success bg-success/10";
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
        <h1 className="text-lg font-semibold">{user.name}</h1>
        <p className="text-xs text-text-secondary">{user.email}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-bg-card border border-border rounded p-4">
          <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">User Details</p>
          <div className="space-y-2 text-xs">
            <p><span className="text-text-secondary">Role:</span> {user.role}</p>
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
                  <td className="px-4 py-3 text-xs font-medium">${order.totalPrice.toFixed(2)}</td>
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
