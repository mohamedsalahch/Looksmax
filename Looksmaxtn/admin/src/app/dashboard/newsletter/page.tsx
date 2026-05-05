"use client";

import { useEffect, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

interface Subscriber {
  _id: string;
  email: string;
  subscribedAt: string;
  createdAt: string;
}

export default function NewsletterPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/newsletter", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setSubscribers(d.subscribers || []))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this subscriber?")) return;
    const res = await fetch("/api/newsletter", withAuthRequest({
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }));
    if (res.ok) setSubscribers((s) => s.filter((x) => x._id !== id));
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredSubscribers = normalizedSearch
    ? subscribers.filter((subscriber) =>
        subscriber.email.toLowerCase().includes(normalizedSearch)
      )
    : subscribers;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-wide">Newsletter Subscribers</h1>
        <span className="text-xs text-text-secondary bg-bg-secondary px-3 py-1 rounded w-fit">
          {subscribers.length} subscriber{subscribers.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search newsletter subscribers by email..."
          className="input-line"
        />
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : filteredSubscribers.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">
            {search ? "No subscribers match your search" : "No subscribers yet"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded">
          <table className="min-w-[520px] w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Subscribed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSubscribers.map((sub) => (
                <tr key={sub._id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-xs font-medium">{sub.email}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {new Date(sub.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(sub._id)}
                      className="text-[10px] text-danger hover:text-danger/80 transition-colors uppercase font-medium cursor-pointer"
                    >
                      Remove
                    </button>
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
