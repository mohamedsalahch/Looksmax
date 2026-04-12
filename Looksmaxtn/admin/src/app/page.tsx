"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { storeAuthToken } from "@/lib/authClient";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setLoading(false); return; }
      if (data.token) storeAuthToken(data.token);
      router.push("/dashboard");
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-lg font-semibold tracking-[0.3em] uppercase text-text-primary">
            LOOKSMAX
          </h1>
          <p className="text-xs text-accent mt-1 tracking-wider uppercase font-medium">
            Admin Dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-xs px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary focus:border-accent transition-colors"
              placeholder="admin@looksmax.com"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary focus:border-accent transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-bg-primary py-3.5 text-sm font-semibold tracking-wide uppercase hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
