"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push("/");
    }
  };

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-10">
        <Link href="/">
          <h1 className="text-lg font-semibold tracking-[0.3em] uppercase text-foreground">
            LOOKSMAX
          </h1>
        </Link>
        <p className="text-xs text-text-secondary mt-2 tracking-wider uppercase">
          Sign in to your account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-border-color bg-transparent px-4 py-3 text-sm text-foreground focus:border-foreground transition-colors placeholder:text-text-secondary/50"
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="text-center text-xs text-text-secondary mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
