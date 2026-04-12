"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email");
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!email || !token) {
      setError("The reset link is missing required data.");
    }
  }, [email, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email || !token) {
      setError("The reset link is missing required data.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "We could not reset your password.");
        return;
      }

      setMessage(data.message || "Password updated successfully.");
      window.setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch {
      setError("Network error while resetting your password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-10">
        <Link href="/">
          <h1 className="text-lg font-semibold tracking-[0.3em] uppercase text-foreground">
            LOOKSMAX
          </h1>
        </Link>
        <p className="text-xs text-text-secondary mt-2 tracking-wider uppercase">
          Reset password
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-[#f1ede8] border border-[#d8c9b8] text-[#6b6055] text-xs px-4 py-3 rounded">
            {message}
          </div>
        )}

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
            New Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border border-border-color bg-transparent px-4 py-3 text-sm text-foreground focus:border-foreground transition-colors placeholder:text-text-secondary/50"
            placeholder="Min. 6 characters"
          />
        </div>

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full border border-border-color bg-transparent px-4 py-3 text-sm text-foreground focus:border-foreground transition-colors placeholder:text-text-secondary/50"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-foreground text-background py-3.5 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>

      <p className="text-center text-xs text-text-secondary mt-6">
        <Link
          href="/login"
          className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
