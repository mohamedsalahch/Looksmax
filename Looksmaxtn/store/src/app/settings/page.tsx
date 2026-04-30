"use client";

import { useState } from "react";
import StoreDashboardShell from "@/components/StoreDashboardShell";
import { withAuthRequest } from "@/lib/authClient";

const fieldClass =
  "w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm transition-colors placeholder:text-text-secondary/70 focus:border-foreground focus:outline-none";

export default function StoreSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword !== confirmNew) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const response = await fetch(
        "/api/account/password",
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword, newPassword }),
        })
      );
      const data = await response.json();
      if (!response.ok) {
        setPasswordError(data.error || "Unable to update password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNew("");
      setPasswordSuccess("Password updated successfully.");
    } catch {
      setPasswordError("Network error.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <StoreDashboardShell>
      <div className="mb-8">
        <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-text-secondary">Account</p>
        <h1 className="text-xl font-semibold tracking-wide text-foreground">Settings</h1>
      </div>

      <div>
        <section className="max-w-md space-y-6">
          <div>
            <h2 className="mb-6 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Change Password
            </h2>
            <form onSubmit={savePassword} className="space-y-4">
              {passwordError && <div className="border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">{passwordError}</div>}
              {passwordSuccess && <div className="border border-[#d8c9b8] bg-[#f1ede8] px-4 py-3 text-xs text-[#6b6055]">{passwordSuccess}</div>}

              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-secondary">Current Password</label>
                <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={fieldClass} required />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-secondary">New Password</label>
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={fieldClass} required minLength={6} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-secondary">Confirm New Password</label>
                <input type="password" value={confirmNew} onChange={(event) => setConfirmNew(event.target.value)} className={fieldClass} required minLength={6} />
              </div>

              <button
                type="submit"
                disabled={savingPassword}
                className="w-full bg-foreground py-3.5 text-sm font-medium uppercase tracking-wide text-background transition-colors hover:bg-accent disabled:opacity-50"
              >
                {savingPassword ? "Saving..." : "Update Password"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </StoreDashboardShell>
  );
}
