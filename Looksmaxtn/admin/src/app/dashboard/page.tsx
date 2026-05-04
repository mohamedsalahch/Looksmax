"use client";

import { useEffect, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

interface Stats {
  totalProducts: number;
  totalOrders: number;
  totalUsers: number;
  totalRevenue: number;
  pendingOrders: number;
  scope?: "admin" | "store";
  storeName?: string;
}

interface Credits {
  allowed: number;
  used: number;
  remaining: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/stats", withAuthRequest())
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load dashboard");

        setStats({
          totalProducts: Number(data.totalProducts || 0),
          totalOrders: Number(data.totalOrders || 0),
          totalUsers: Number(data.totalUsers || 0),
          totalRevenue: Number(data.totalRevenue || 0),
          pendingOrders: Number(data.pendingOrders || 0),
          scope: data.scope,
          storeName: data.storeName,
        });

        if (data.scope === "store") {
          fetch("/api/users/me/store-credits", withAuthRequest())
            .then(async (r) => {
              const creditData = await r.json();
              if (!r.ok) throw new Error(creditData.error || "Failed to load credits");
              setCredits({
                allowed: Number(creditData.allowed || 0),
                used: Number(creditData.used || 0),
                remaining: Number(creditData.remaining || 0),
              });
            })
            .catch(() => setCredits(null));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!stats) return <p className="text-xs text-text-secondary animate-pulse">Loading dashboard...</p>;

  const cards = [
    { label: "Total Revenue", value: `${stats.totalRevenue.toFixed(2)} TND`, icon: "💰", color: "text-[#6b6055]" },
    { label: "Total Orders", value: stats.totalOrders, icon: "🛒", color: "text-info" },
    { label: "Pending Orders", value: stats.pendingOrders, icon: "⏳", color: "text-warning" },
    { label: "Products", value: stats.totalProducts, icon: "📦", color: "text-accent" },
    ...(stats.scope === "store"
      ? [{ label: "Credits Remaining", value: credits ? credits.remaining : "Loading...", icon: "💳", color: "text-accent" }]
      : []),
    ...(stats.scope === "store"
      ? []
      : [{ label: "Users", value: stats.totalUsers, icon: "👥", color: "text-info" }]),
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-wide">
          {stats.scope === "store" && stats.storeName ? `${stats.storeName} Dashboard` : "Dashboard"}
        </h1>
        {stats.scope === "store" && (
          <p className="mt-1 text-xs text-text-secondary">Filtered to your store products and orders.</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="stat-card border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-[10px] text-text-secondary uppercase tracking-wider mt-1">{card.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
