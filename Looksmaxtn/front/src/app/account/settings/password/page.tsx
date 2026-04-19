"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthContext";
import { withAuthRequest } from "@/lib/authClient";

export default function PasswordSettingsPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const isGoogleAccount = Boolean(user?.googleId);

  const blurActiveElement = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmNew) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/users/me/password", {
        ...withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: isGoogleAccount ? undefined : currentPassword,
            newPassword,
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to update password.");
      } else {
        setSuccess("Password updated successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNew("");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
    blurActiveElement();
  };

  return (
    <div className="max-w-md space-y-6">
      <Link href="/account/settings" className="text-xs text-text-secondary underline underline-offset-2">
        Back to Settings
      </Link>
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-6 text-text-secondary">
          Change Password
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">{error}</div>}
          {success && <div className="border border-[#d8c9b8] bg-[#f1ede8] px-4 py-3 text-xs text-[#6b6055]">{success}</div>}
          {!isGoogleAccount && (
            <div>
              <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Current Password</label>
              <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full border border-border-color bg-transparent px-4 py-3 text-sm" />
            </div>
          )}
          {isGoogleAccount && (
            <div className="border border-[#d8c9b8] bg-[#f1ede8] px-4 py-3 text-xs text-[#6b6055]">
              This account uses Google sign-in. You can create your first password without entering the current one.
            </div>
          )}
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">New Password</label>
            <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full border border-border-color bg-transparent px-4 py-3 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">Confirm New Password</label>
            <input type="password" required value={confirmNew} onChange={(e) => setConfirmNew(e.target.value)} className="w-full border border-border-color bg-transparent px-4 py-3 text-sm" />
          </div>
          <button type="submit" disabled={loading} className="bg-foreground text-background px-6 py-3 text-xs font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50">
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
