"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/providers/AuthContext";

function normalizeGender(value: string | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "male" || normalized === "man" || normalized === "men") {
    return "men";
  }
  if (normalized === "female" || normalized === "woman" || normalized === "women") {
    return "women";
  }
  return "";
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [bodyProfile, setBodyProfile] = useState({
    heightCm: "",
    weightKg: "",
    usualSize: "",
    profileImage: "",
    gender: "",
  });
  const [bodyProfileFile, setBodyProfileFile] = useState<File | null>(null);
  const [bodyError, setBodyError] = useState("");
  const [bodySuccess, setBodySuccess] = useState("");
  const [bodyLoading, setBodyLoading] = useState(false);

  useEffect(() => {
    setBodyProfile({
      heightCm: user?.bodyProfile?.heightCm || "",
      weightKg: user?.bodyProfile?.weightKg || "",
      usualSize: user?.bodyProfile?.usualSize || "",
      profileImage: user?.bodyProfile?.profileImage || "",
      gender: normalizeGender(user?.bodyProfile?.gender),
    });
  }, [user]);

  const bodyProfilePreview = useMemo(
    () => (bodyProfileFile ? URL.createObjectURL(bodyProfileFile) : bodyProfile.profileImage),
    [bodyProfileFile, bodyProfile.profileImage]
  );

  const handleBodyProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBodyError("");
    setBodySuccess("");
    setBodyLoading(true);

    try {
      const body = new FormData();
      body.append("heightCm", bodyProfile.heightCm);
      body.append("weightKg", bodyProfile.weightKg);
      body.append("usualSize", bodyProfile.usualSize);
      body.append("gender", bodyProfile.gender);
      body.append("existingProfileImage", bodyProfile.profileImage);
      if (bodyProfileFile) body.append("profileImage", bodyProfileFile);

      const res = await fetch("/api/users/me/body-profile", {
        method: "PUT",
        body,
      });
      const data = await res.json();

      if (!res.ok) {
        setBodyError(data.error || "Unable to save body profile.");
      } else {
        setBodySuccess("Body profile updated successfully");
        setBodyProfile({
          heightCm: data.user?.bodyProfile?.heightCm || "",
          weightKg: data.user?.bodyProfile?.weightKg || "",
          usualSize: data.user?.bodyProfile?.usualSize || "",
          profileImage: data.user?.bodyProfile?.profileImage || "",
          gender: normalizeGender(data.user?.bodyProfile?.gender),
        });
        setBodyProfileFile(null);
        await refreshUser();
      }
    } catch {
      setBodyError("Network error");
    }

    setBodyLoading(false);
  };

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/account/settings/address"
          className="border border-border-color p-5 hover:bg-hover transition-colors"
        >
          <p className="text-xs uppercase tracking-wider text-text-secondary">Billing Address</p>
          <h2 className="mt-2 text-lg font-medium">Manage Address</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Update your delivery and billing details separately from the rest of your account.
          </p>
        </Link>
        <Link
          href="/account/settings/password"
          className="border border-border-color p-5 hover:bg-hover transition-colors"
        >
          <p className="text-xs uppercase tracking-wider text-text-secondary">Password</p>
          <h2 className="mt-2 text-lg font-medium">Security Settings</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Change your password without mixing it with your address or outfit profile settings.
          </p>
        </Link>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-6 text-text-secondary">
          Outfit Studio Profile
        </h2>
        <form onSubmit={handleBodyProfileUpdate} className="max-w-2xl space-y-4">
          {bodyError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded">
              {bodyError}
            </div>
          )}
          {bodySuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-xs px-4 py-3 rounded">
              {bodySuccess}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-start">
            <div className="space-y-3">
              <div className="aspect-[4/5] border border-border-color bg-hover overflow-hidden">
                {bodyProfilePreview ? (
                  <img src={bodyProfilePreview} alt="Profile preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-wider text-text-secondary">
                    Profile Photo
                  </div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setBodyProfileFile(e.target.files?.[0] || null)}
                className="w-full border border-border-color bg-transparent px-4 py-3 text-xs"
              />
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Height (cm)
                  </label>
                  <input
                    type="text"
                    value={bodyProfile.heightCm}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, heightCm: e.target.value })}
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Weight (kg)
                  </label>
                  <input
                    type="text"
                    value={bodyProfile.weightKg}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, weightKg: e.target.value })}
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Usual Size
                  </label>
                  <input
                    type="text"
                    value={bodyProfile.usualSize}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, usualSize: e.target.value })}
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm"
                    placeholder="M / 42 / 100ml"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Gender
                  </label>
                  <select
                    value={bodyProfile.gender}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, gender: e.target.value })}
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm"
                  >
                    <option value="">Select</option>
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={bodyLoading}
                className="bg-foreground text-background px-6 py-3 text-xs font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
              >
                {bodyLoading ? "Saving..." : "Save Studio Profile"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
