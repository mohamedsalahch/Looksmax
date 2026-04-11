"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
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
    topSize: "",
    bottomSize: "",
    shoeSize: "",
    profileImage: "",
    gender: "",
  });
  const [bodyError, setBodyError] = useState("");
  const [bodySuccess, setBodySuccess] = useState("");
  const [bodyLoading, setBodyLoading] = useState(false);
  const [imageEnhancing, setImageEnhancing] = useState(false);
  const [enhancedImage, setEnhancedImage] = useState("");

  useEffect(() => {
    setBodyProfile({
      heightCm: user?.bodyProfile?.heightCm || "",
      weightKg: user?.bodyProfile?.weightKg || "",
      topSize: user?.bodyProfile?.topSize || "",
      bottomSize: user?.bodyProfile?.bottomSize || "",
      shoeSize: user?.bodyProfile?.shoeSize || "",
      profileImage: user?.bodyProfile?.profileImage || "",
      gender: normalizeGender(user?.bodyProfile?.gender),
    });
    setImageEnhancing(Boolean(user?.bodyProfile?.imageEnhancing));
    setEnhancedImage(user?.bodyProfile?.profileImageEnhanced || "");
  }, [user]);

  // Poll while enhancing
  useEffect(() => {
    if (!imageEnhancing) return;
    const interval = window.setInterval(() => {
      refreshUser();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [imageEnhancing, refreshUser]);

  const hasOriginal = Boolean(bodyProfile.profileImage);
  const hasEnhanced = Boolean(enhancedImage);
  // Show enhanced column only if there's an enhanced image OR one is being generated
  const showEnhanced = hasEnhanced || (hasOriginal && imageEnhancing);

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBodyError("");
    setImageEnhancing(true);

    const localPreview = URL.createObjectURL(file);
    setBodyProfile((prev) => ({ ...prev, profileImage: localPreview }));

    try {
      const formData = new FormData();
      formData.append("profileImage", file);

      const res = await fetch("/api/users/me/body-profile/photo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setBodyError(data.error || "Failed to upload photo.");
        setImageEnhancing(false);
        return;
      }

      setBodyProfile((prev) => ({
        ...prev,
        profileImage: data.profileImage || prev.profileImage,
      }));
    } catch {
      setBodyError("Failed to upload photo.");
      setImageEnhancing(false);
    }
  }, []);

  const handleDeleteImage = async (target: "original" | "enhanced") => {
    try {
      const res = await fetch(`/api/users/me/body-profile/photo?target=${target}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setBodyError("Failed to delete image.");
        return;
      }
      if (target === "original") {
        setBodyProfile((prev) => ({ ...prev, profileImage: "" }));
        setEnhancedImage("");
        setImageEnhancing(false);
      } else {
        setEnhancedImage("");
      }
      await refreshUser();
    } catch {
      setBodyError("Failed to delete image.");
    }
  };

  const handleBodyProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBodyError("");
    setBodySuccess("");
    setBodyLoading(true);

    try {
      const body = new FormData();
      body.append("heightCm", bodyProfile.heightCm);
      body.append("weightKg", bodyProfile.weightKg);
      body.append("topSize", bodyProfile.topSize);
      body.append("bottomSize", bodyProfile.bottomSize);
      body.append("shoeSize", bodyProfile.shoeSize);
      body.append("gender", bodyProfile.gender);
      body.append("existingProfileImage", bodyProfile.profileImage);

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
          topSize: data.user?.bodyProfile?.topSize || "",
          bottomSize: data.user?.bodyProfile?.bottomSize || "",
          shoeSize: data.user?.bodyProfile?.shoeSize || "",
          profileImage: data.user?.bodyProfile?.profileImage || "",
          gender: normalizeGender(data.user?.bodyProfile?.gender),
        });
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
        <form onSubmit={handleBodyProfileUpdate} className="max-w-3xl space-y-4">
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
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-start">
            <div className="space-y-3">
              <div className="flex gap-3">
                {/* Original */}
                <div className="w-[160px] space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary text-center">Original</p>
                  <div className="aspect-[4/5] border border-border-color bg-hover overflow-hidden relative group">
                    {hasOriginal ? (
                      <>
                        <img
                          src={bodyProfile.profileImage}
                          alt="Original photo"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteImage("original")}
                          className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-foreground/70 text-background text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          x
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-wider text-text-secondary">
                        Original
                      </div>
                    )}
                  </div>
                </div>

                {/* Enhanced — collapses smoothly */}
                <div
                  className="transition-all duration-300 ease-in-out overflow-hidden"
                  style={{
                    width: showEnhanced ? 160 : 0,
                    opacity: showEnhanced ? 1 : 0,
                    marginLeft: showEnhanced ? 12 : 0,
                  }}
                >
                  <div className="w-[160px] space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-text-secondary text-center whitespace-nowrap">
                      {imageEnhancing ? "Enhancing..." : "Enhanced"}
                    </p>
                    <div className="aspect-[4/5] border border-border-color bg-hover overflow-hidden relative group">
                      {hasEnhanced ? (
                        <>
                          <img
                            src={enhancedImage}
                            alt="Enhanced photo"
                            className={`w-full h-full object-cover transition-opacity duration-300 ${
                              imageEnhancing ? "blur-sm opacity-60" : ""
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteImage("enhanced")}
                            className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-foreground/70 text-background text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            x
                          </button>
                          {imageEnhancing && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-color border-t-foreground" />
                              <span className="text-[9px] uppercase tracking-wider text-text-secondary">Updating</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-color border-t-foreground" />
                            <span className="text-[9px] uppercase tracking-wider text-text-secondary">Processing</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <label
                className={`block py-2.5 text-xs font-medium tracking-wide uppercase text-center transition-all duration-300 cursor-pointer ${
                  imageEnhancing
                    ? "border border-border-color text-text-secondary cursor-not-allowed"
                    : "border border-border-color text-foreground hover:bg-hover"
                }`}
                style={{ width: showEnhanced ? 332 : 160 }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={imageEnhancing}
                  className="hidden"
                />
                Upload File
              </label>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Top Size
                  </label>
                  <select
                    value={bodyProfile.topSize}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, topSize: e.target.value })}
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm"
                  >
                    <option value="">Select</option>
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Bottom Size
                  </label>
                  <select
                    value={bodyProfile.bottomSize}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, bottomSize: e.target.value })}
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm"
                  >
                    <option value="">Select</option>
                    {[36, 38, 40, 42, 44, 46, 48].map((size) => (
                      <option key={size} value={String(size)}>{size}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Shoe Size
                  </label>
                  <select
                    value={bodyProfile.shoeSize}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, shoeSize: e.target.value })}
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm"
                  >
                    <option value="">Select</option>
                    {[38, 39, 40, 41, 42, 43, 44, 45, 46, 47].map((size) => (
                      <option key={size} value={String(size)}>{size}</option>
                    ))}
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
