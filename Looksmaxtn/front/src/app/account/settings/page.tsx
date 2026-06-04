"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthContext";
import { withAuthRequest } from "@/lib/authClient";
import { compressImageFile } from "@/lib/imageCompression";
import { subscribeToBodyProfile } from "@/lib/storeEvents";

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
  const router = useRouter();
  type ValidationField = "photo" | "heightCm" | "weightKg" | "gender" | "topSize" | "bottomSize" | "shoeSize";
  const [bodyProfile, setBodyProfile] = useState({
    heightCm: "",
    weightKg: "",
    topSize: "",
    bottomSize: "",
    shoeSize: "",
    profileImage: "",
    profileImageUploadCount: 0,
    outfitGenerationCount: 0,
    gender: "",
    profileImageRequiresGeneration: false,
  });
  const [outfitStudioStats, setOutfitStudioStats] = useState({
    totalTries: 5,
    triesUsed: 0,
    triesRemaining: 5,
    isAdmin: false,
  });
  const [bodyError, setBodyError] = useState("");
  const [bodySuccess, setBodySuccess] = useState("");
  const [bodyLoading, setBodyLoading] = useState(false);
  const [imageEnhancing, setImageEnhancing] = useState(false);
  const [enhancedImage, setEnhancedImage] = useState("");
  const [enhanceError, setEnhanceError] = useState("");
  const [validationField, setValidationField] = useState<ValidationField | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<"original" | "enhanced" | null>(null);
  const heightRef = useRef<HTMLInputElement | null>(null);
  const weightRef = useRef<HTMLInputElement | null>(null);
  const genderRef = useRef<HTMLSelectElement | null>(null);
  const topSizeRef = useRef<HTMLSelectElement | null>(null);
  const bottomSizeRef = useRef<HTMLSelectElement | null>(null);
  const shoeSizeRef = useRef<HTMLSelectElement | null>(null);
  const enhanceAbortRef = useRef<AbortController | null>(null);
  const enhanceCancelledRef = useRef(false);
  const handledEnhanceErrorRef = useRef("");
  const uploadInFlightRef = useRef(false);
  const formHydratedRef = useRef(false);
  const openZoom = useCallback((src: string, alt: string) => {
    setZoomedImage({ src, alt });
  }, []);
  const requiredLabelClass = "block text-xs text-text-secondary uppercase tracking-wider mb-1.5";
  const requiredFieldErrorClass = "mt-1 text-[10px] uppercase tracking-[0.14em] text-[#430C05]";
  const fieldClass = "w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm transition-colors placeholder:text-text-secondary/70 focus:border-foreground focus:outline-none";
  const invalidFieldClass = "border-0 border-b border-[#430C05] ring-0";

  const resetPhotoUploadForRetry = useCallback(() => {
    setImageEnhancing(false);
    setEnhancedImage("");
    setBodyProfile((prev) => ({
      ...prev,
      profileImage: "",
      profileImageRequiresGeneration: false,
    }));
  }, []);

  const getFirstMissingFocusableField = useCallback((): ValidationField | null => {
    if (!String(bodyProfile.heightCm || "").trim()) {
      return "heightCm";
    }
    if (!String(bodyProfile.weightKg || "").trim()) {
      return "weightKg";
    }
    if (!String(bodyProfile.gender || "").trim()) {
      return "gender";
    }
    if (!String(bodyProfile.topSize || "").trim()) {
      return "topSize";
    }
    if (!String(bodyProfile.bottomSize || "").trim()) {
      return "bottomSize";
    }
    if (!String(bodyProfile.shoeSize || "").trim()) {
      return "shoeSize";
    }
    return null;
  }, [
    bodyProfile.bottomSize,
    bodyProfile.gender,
    bodyProfile.heightCm,
    bodyProfile.shoeSize,
    bodyProfile.topSize,
    bodyProfile.weightKg,
  ]);

  useEffect(() => {
    void refreshUser();
    void fetch("/api/users/me/outfit-studio", withAuthRequest({ method: "GET" }))
      .then((res) => res.json())
      .then((data) => {
        setOutfitStudioStats({
          totalTries: data.totalTries ?? 5,
          triesUsed: data.triesUsed ?? 0,
          triesRemaining: data.triesRemaining ?? 5,
          isAdmin: data.isAdmin || false,
        });
      })
      .catch(() => {
        setOutfitStudioStats({ totalTries: 5, triesUsed: 0, triesRemaining: 5, isAdmin: false });
      });
  }, [refreshUser]);

  useEffect(() => {
    if (uploadInFlightRef.current) return;
    const wasEnhancing = imageEnhancing;
    const nextEnhancing = Boolean(user?.bodyProfile?.imageEnhancing);
    const nextEnhancedImage = user?.bodyProfile?.profileImageEnhanced || "";
    const validationError = user?.bodyProfile?.profileImageValidationError || "";
    const cancelledPendingEnhancement = enhanceCancelledRef.current && nextEnhancing && !nextEnhancedImage;

    setBodyProfile((prev) => {
      // Hydrate the user-editable fields from the saved profile only on first load.
      // On later refreshes (e.g. the periodic refreshUser while a photo is enhancing)
      // keep whatever the user has typed but not yet saved, so their inputs aren't reset.
      const editable = formHydratedRef.current
        ? {
            heightCm: prev.heightCm,
            weightKg: prev.weightKg,
            topSize: prev.topSize,
            bottomSize: prev.bottomSize,
            shoeSize: prev.shoeSize,
            gender: prev.gender,
          }
        : {
            heightCm: user?.bodyProfile?.heightCm || "",
            weightKg: user?.bodyProfile?.weightKg || "",
            topSize: user?.bodyProfile?.topSize || "",
            bottomSize: user?.bodyProfile?.bottomSize || "",
            shoeSize: user?.bodyProfile?.shoeSize || "",
            gender: normalizeGender(user?.bodyProfile?.gender),
          };

      return {
        ...editable,
        profileImage: cancelledPendingEnhancement ? "" : user?.bodyProfile?.profileImage || "",
        profileImageUploadCount: Number(user?.bodyProfile?.profileImageUploadCount || 0),
        outfitGenerationCount: Number(user?.bodyProfile?.outfitGenerationCount || 0),
        profileImageRequiresGeneration: cancelledPendingEnhancement
          ? false
          : Boolean(user?.bodyProfile?.profileImageRequiresGeneration),
      };
    });
    if (user?.id) {
      formHydratedRef.current = true;
    }
    if (cancelledPendingEnhancement) {
      setImageEnhancing(false);
    } else {
      setImageEnhancing(nextEnhancing);
      if (!nextEnhancing) {
        enhanceCancelledRef.current = false;
      }
    }
    setEnhancedImage(nextEnhancedImage);
    if (nextEnhancedImage) {
      enhanceCancelledRef.current = false;
    }

    // Show validation error from LLM if present
    if (validationError) {
      if (handledEnhanceErrorRef.current !== validationError) {
        handledEnhanceErrorRef.current = validationError;
        void fetch("/api/users/me/body-profile/photo?target=original", {
          ...withAuthRequest({ method: "DELETE" }),
        }).finally(() => {
          void refreshUser();
        });
      }
      setEnhanceError(validationError);
      resetPhotoUploadForRetry();
    } else if (wasEnhancing && !nextEnhancing && !nextEnhancedImage) {
      handledEnhanceErrorRef.current = "";
      setEnhanceError("Photo enhancement failed. Please try uploading again.");
      resetPhotoUploadForRetry();
    } else if (!validationError) {
      handledEnhanceErrorRef.current = "";
    }
  }, [refreshUser, resetPhotoUploadForRetry, user]);

  // Refresh from SSE while enhancing
  useEffect(() => {
    if (!imageEnhancing) return;
    const unsubscribe = subscribeToBodyProfile(() => {
      refreshUser();
    });
    // Polling fallback: SSE events aren't buffered/replayed, so a "completed"/"failed"
    // event dropped during a reconnect (slow or flaky internet) would otherwise leave
    // the spinner stuck forever. Periodically re-fetch so the state self-heals.
    const interval = window.setInterval(() => {
      refreshUser();
    }, 4000);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [imageEnhancing, refreshUser]);

  const hasOriginal = Boolean(bodyProfile.profileImage);
  const hasEnhanced = Boolean(enhancedImage);
  const originalTileInteractive = hasOriginal;
  const enhancedTileInteractive = hasEnhanced;
  const showGenerateButton = hasOriginal && !hasEnhanced && !imageEnhancing;
  const uploadLimit = 100;
  const uploadsUsed = Math.min(Number(bodyProfile.profileImageUploadCount || 0), uploadLimit);
  const remainingUploads = Math.max(uploadLimit - uploadsUsed, 0);
  const remainingGenerations = outfitStudioStats.isAdmin ? Infinity : outfitStudioStats.triesRemaining;
  // Show enhanced column only if there's an enhanced image OR one is being generated
  const showEnhanced = hasEnhanced || (hasOriginal && imageEnhancing);
  // Hide original once enhanced is ready
  const showOriginal = !hasEnhanced || imageEnhancing;
  const showUploadControls = !hasOriginal && !hasEnhanced;
  const showDeleteControls = hasEnhanced && !imageEnhancing;
  const showImageGap = showOriginal && showEnhanced;
  const photoActionWidthClass = showOriginal && showEnhanced ? "w-[332px]" : "w-[160px]";

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBodyError("");
    setEnhanceError("");
    setEnhancedImage("");
    setValidationField(null);
    setImageEnhancing(true);
    enhanceCancelledRef.current = false;
    handledEnhanceErrorRef.current = "";
    uploadInFlightRef.current = true;

    const localPreview = URL.createObjectURL(file);
    setBodyProfile((prev) => ({ ...prev, profileImage: localPreview }));

    try {
      const compressedFile = await compressImageFile(file);
      const formData = new FormData();
      formData.append("profileImage", compressedFile);

      const res = await fetch("/api/users/me/body-profile/photo", {
        ...withAuthRequest({
          method: "POST",
          body: formData,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setBodyError(data.error || "Failed to upload photo.");
        resetPhotoUploadForRetry();
        return;
      }

      setBodyProfile((prev) => ({
        ...prev,
        profileImage: data.profileImage || prev.profileImage,
        profileImageUploadCount: Number(data.profileImageUploadCount ?? prev.profileImageUploadCount),
        profileImageRequiresGeneration: Boolean(
          data.profileImageRequiresGeneration ?? prev.profileImageRequiresGeneration
        ),
      }));
      setImageEnhancing(Boolean(data.imageEnhancing));
    } catch {
      setBodyError("Failed to upload photo.");
      resetPhotoUploadForRetry();
    } finally {
      uploadInFlightRef.current = false;
    }
  }, [resetPhotoUploadForRetry]);

  const handleGeneratePhoto = useCallback(async () => {
    if (!hasOriginal || hasEnhanced || imageEnhancing) return;

    setBodyError("");
    setEnhanceError("");
    setImageEnhancing(true);
    enhanceCancelledRef.current = false;

    const controller = new AbortController();
    enhanceAbortRef.current?.abort();
    enhanceAbortRef.current = controller;

    try {
      const res = await fetch("/api/users/me/body-profile/enhance", {
        ...withAuthRequest({ method: "POST", signal: controller.signal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImageEnhancing(false);
        setBodyError(data.error || "Failed to generate enhanced photo.");
        resetPhotoUploadForRetry();
        if (enhanceAbortRef.current === controller) {
          enhanceAbortRef.current = null;
        }
        return;
      }

      setBodyProfile((prev) => ({
        ...prev,
        profileImageRequiresGeneration: true,
      }));
      await refreshUser();
    } catch {
      if (!controller.signal.aborted) {
        setBodyError("Failed to generate enhanced photo.");
        resetPhotoUploadForRetry();
      }
    } finally {
      if (enhanceAbortRef.current === controller) {
        enhanceAbortRef.current = null;
      }
    }
  }, [hasEnhanced, hasOriginal, imageEnhancing, refreshUser, resetPhotoUploadForRetry]);

  const handleCancelGeneratePhoto = useCallback(() => {
    enhanceCancelledRef.current = true;
    enhanceAbortRef.current?.abort();
    enhanceAbortRef.current = null;
    setImageEnhancing(false);
    setEnhancedImage("");
    setEnhanceError("");
    setBodyError("");
    setValidationField(null);
    setBodyProfile((prev) => ({
      ...prev,
      profileImage: "",
      profileImageRequiresGeneration: false,
    }));

    const discardUploadedPhoto = async () => {
      if (!bodyProfile.profileImage) return;

      try {
        await fetch("/api/users/me/body-profile/photo?target=original", {
          ...withAuthRequest({ method: "DELETE" }),
        });
      } catch {
        // Ignore cancellation cleanup failures.
      } finally {
        setBodyProfile((prev) => ({
          ...prev,
          profileImage: "",
          profileImageRequiresGeneration: false,
        }));
        await refreshUser();
      }
    };

    void discardUploadedPhoto();
  }, [bodyProfile.profileImage, refreshUser]);

  const handleDeletePhoto = useCallback(async (target: "original" | "enhanced") => {
    setDeletingPhoto(target);
    setBodyError("");
    try {
      const res = await fetch(`/api/users/me/body-profile/photo?target=${target}`, {
        ...withAuthRequest({ method: "DELETE" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBodyError(data.error || "Failed to delete photo.");
      } else {
        setBodyProfile((prev) => ({
          ...prev,
          profileImage: "",
          profileImageRequiresGeneration: false,
        }));
        setEnhancedImage("");
        setImageEnhancing(false);
        await refreshUser();
      }
    } catch {
      setBodyError("Failed to delete photo.");
    }
    setDeletingPhoto(null);
  }, [refreshUser]);

  const handleBodyProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBodyError("");
    setBodySuccess("");

    if (!String(enhancedImage || "").trim()) {
      setValidationField("photo");
      setBodyError(
        bodyProfile.profileImage
          ? "Enhanced profile picture is required before saving."
          : "Upload and enhance a profile picture before saving."
      );
      return;
    }

    const requiredFields = [
      bodyProfile.heightCm,
      bodyProfile.weightKg,
      bodyProfile.gender,
      bodyProfile.topSize,
      bodyProfile.bottomSize,
      bodyProfile.shoeSize,
    ];
    if (requiredFields.some((value) => !String(value || "").trim())) {
      const missingFocusableField = getFirstMissingFocusableField();
      setValidationField(missingFocusableField);
      setBodyError("Please fill in the required field.");
      if (missingFocusableField === "heightCm") {
        heightRef.current?.focus();
      } else if (missingFocusableField === "weightKg") {
        weightRef.current?.focus();
      } else if (missingFocusableField === "gender") {
        genderRef.current?.focus();
      } else if (missingFocusableField === "topSize") {
        topSizeRef.current?.focus();
      } else if (missingFocusableField === "bottomSize") {
        bottomSizeRef.current?.focus();
      } else if (missingFocusableField === "shoeSize") {
        shoeSizeRef.current?.focus();
      }
      return;
    }

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
        ...withAuthRequest({
          method: "PUT",
          body,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setBodyError(data.error || "Unable to save body profile.");
      } else {
        setValidationField(null);
        setBodyProfile({
          heightCm: data.user?.bodyProfile?.heightCm || "",
          weightKg: data.user?.bodyProfile?.weightKg || "",
          topSize: data.user?.bodyProfile?.topSize || "",
          bottomSize: data.user?.bodyProfile?.bottomSize || "",
          shoeSize: data.user?.bodyProfile?.shoeSize || "",
          profileImage: data.user?.bodyProfile?.profileImage || "",
          profileImageUploadCount: Number(data.user?.bodyProfile?.profileImageUploadCount || 0),
          outfitGenerationCount: Number(data.user?.bodyProfile?.outfitGenerationCount || 0),
          gender: normalizeGender(data.user?.bodyProfile?.gender),
          profileImageRequiresGeneration: Boolean(
            data.user?.bodyProfile?.profileImageRequiresGeneration
          ),
        });
        setValidationField(null);
        await refreshUser();
        router.replace("/studio");
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
        {enhanceError && (
          <div className="mb-4 text-xs text-[#8B3A2F]">
            {enhanceError}
          </div>
        )}
        <form onSubmit={handleBodyProfileUpdate} noValidate className="max-w-3xl space-y-4">
            {bodySuccess && (
            <div className="border border-[#d8c9b8] bg-[#f1ede8] px-4 py-3 text-xs text-[#6b6055]">
              {bodySuccess}
            </div>
          )}
          <div className="relative">
            {imageEnhancing && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={handleCancelGeneratePhoto}
                  aria-label="Cancel enhancement"
                  className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center bg-foreground text-sm text-background transition-colors hover:bg-accent"
                >
                  ×
                </button>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-color border-t-foreground" />
                <span className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">Enhancing photo...</span>
              </div>
            )}
          <div className={`grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-start transition-all duration-300 ${imageEnhancing ? "pointer-events-none select-none blur-[2px] opacity-60" : ""}`}>
            <div className="flex flex-col items-center gap-3">
              <div className={`flex ${photoActionWidthClass} justify-start`}>
                {/* Original — hidden once enhanced photo is ready */}
                {showOriginal && (
                <div className="w-[160px] space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary text-center">
                    Profile Photo <span className="text-[#430C05]">*</span>
                  </p>
                  <div
                    className={`aspect-[4/5] border border-border-color bg-hover overflow-hidden relative group ${
                      originalTileInteractive ? "cursor-zoom-in" : ""
                    }`}
                    {...(originalTileInteractive
                      ? {
                          role: "button" as const,
                          tabIndex: 0,
                          onClick: () => openZoom(bodyProfile.profileImage, "Original photo"),
                          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openZoom(bodyProfile.profileImage, "Original photo");
                            }
                          },
                          "aria-label": "Zoom original photo",
                          title: "Tap to zoom",
                        }
                      : {})}
                  >
                    {hasOriginal ? (
                      <div className="h-full w-full">
                        <span className="absolute left-2 top-2 z-10 bg-background/85 px-2 py-1 text-[9px] uppercase tracking-wider text-text-secondary">
                          Original
                        </span>
                        <img
                          src={bodyProfile.profileImage}
                          alt="Original photo"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openZoom(bodyProfile.profileImage, "Original photo");
                          }}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center bg-black text-base text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Zoom original photo"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-text-secondary">
                        <span className="absolute left-2 top-2 bg-background/85 px-2 py-1 text-[9px] uppercase tracking-wider text-text-secondary">
                          Original
                        </span>
                        <span>No image yet</span>
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* Enhanced — collapses smoothly */}
                <div
                  className="transition-all duration-300 ease-in-out overflow-hidden"
                  style={{
                    width: showEnhanced ? 160 : 0,
                    opacity: showEnhanced ? 1 : 0,
                    marginLeft: showImageGap ? 12 : 0,
                  }}
                >
                  <div className="w-[160px] space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-text-secondary text-center whitespace-nowrap">
                      {imageEnhancing ? "Enhancing..." : "Enhanced"}
                    </p>
                    <div
                      className={`aspect-[4/5] border border-border-color bg-hover overflow-hidden relative group ${
                        enhancedTileInteractive ? "cursor-zoom-in" : ""
                      }`}
                      {...(enhancedTileInteractive
                        ? {
                            role: "button" as const,
                            tabIndex: 0,
                            onClick: () => openZoom(enhancedImage, "Enhanced photo"),
                            onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openZoom(enhancedImage, "Enhanced photo");
                              }
                            },
                            "aria-label": "Zoom enhanced photo",
                            title: "Tap to zoom",
                          }
                        : {})}
                    >
                      {hasEnhanced ? (
                        <div className="h-full w-full">
                          <img
                            src={enhancedImage}
                            alt="Enhanced photo"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openZoom(enhancedImage, "Enhanced photo");
                            }}
                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center bg-black text-base text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Zoom enhanced photo"
                          >
                            +
                          </button>
                        </div>
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

              <div className={`flex ${photoActionWidthClass} flex-col gap-2`}>
                {showGenerateButton && (
                  <button
                    type="button"
                    onClick={handleGeneratePhoto}
                    disabled={remainingGenerations <= 0}
                    className="w-full bg-foreground px-6 py-3 text-xs font-medium tracking-wide uppercase text-background transition-colors hover:bg-accent cursor-pointer disabled:opacity-50"
                    aria-label="Enhance photo"
                  >
                    Enhance photo
                  </button>
                )}
                {showDeleteControls && (
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto("enhanced")}
                    disabled={deletingPhoto !== null}
                    className="w-full bg-foreground px-6 py-3 text-xs font-medium tracking-wide uppercase text-background transition-colors hover:bg-accent cursor-pointer disabled:opacity-50"
                    aria-label="Delete photo"
                  >
                    {deletingPhoto !== null ? "Deleting..." : "Delete photo"}
                  </button>
                )}
                {validationField === "photo" && !showUploadControls && bodyError && (
                  <p className={requiredFieldErrorClass}>{bodyError}</p>
                )}
              </div>

              {showUploadControls && (
                <>
                  <div className={`${photoActionWidthClass} space-y-1.5`}>
                    <label
                      className={`flex items-center justify-center py-2.5 text-xs font-medium tracking-wide uppercase text-center transition-all duration-300 outline-none ${
                        imageEnhancing || remainingUploads <= 0
                          ? "w-full bg-foreground px-6 py-3 text-xs font-medium tracking-wide uppercase text-background transition-colors hover:bg-accent cursor-pointer disabled:opacity-50 pointer-events-none"
                          : `w-full bg-foreground px-6 py-3 text-xs font-medium tracking-wide uppercase text-background transition-colors hover:bg-accent cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                              validationField === "photo" ? invalidFieldClass : "border-border-color"
                            }`
                      }`}
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
                    {validationField === "photo" && bodyError && (
                      <p className={requiredFieldErrorClass}>{bodyError}</p>
                    )}
                  </div>

                  <p className="text-[10px] uppercase tracking-[0.18em] text-text-secondary text-center">
                    {remainingUploads > 0
                      ? `${remainingUploads} upload${remainingUploads === 1 ? "" : "s"} left`
                      : "Upload limit reached"}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-text-secondary text-center">
                    {outfitStudioStats.isAdmin
                      ? "Unlimited generations"
                      : remainingGenerations > 0
                        ? `${remainingGenerations} generation${remainingGenerations === 1 ? "" : "s"} left`
                        : "Generation limit reached"}
                  </p>
                </>
              )}

            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={requiredLabelClass}>
                    Height (cm) <span className="text-[#430C05]">*</span>
                  </label>
                  <input
                    type="text"
                    value={bodyProfile.heightCm}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, heightCm: e.target.value })}
                    required
                    ref={heightRef}
                    placeholder="e.g. 180"
                    className={`${fieldClass} ${
                      validationField === "heightCm" ? invalidFieldClass : ""
                    }`}
                  />
                  {validationField === "heightCm" && bodyError && (
                    <p className={requiredFieldErrorClass}>{bodyError}</p>
                  )}
                </div>
                <div>
                  <label className={requiredLabelClass}>
                    Weight (kg) <span className="text-[#430C05]">*</span>
                  </label>
                  <input
                    type="text"
                    value={bodyProfile.weightKg}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, weightKg: e.target.value })}
                    required
                    ref={weightRef}
                    placeholder="e.g. 75"
                    className={`${fieldClass} ${
                      validationField === "weightKg" ? invalidFieldClass : ""
                    }`}
                  />
                  {validationField === "weightKg" && bodyError && (
                    <p className={requiredFieldErrorClass}>{bodyError}</p>
                  )}
                </div>
                <div>
                  <label className={requiredLabelClass}>
                    Gender <span className="text-[#430C05]">*</span>
                  </label>
                  <select
                    value={bodyProfile.gender}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, gender: e.target.value })}
                    required
                    ref={genderRef}
                    className={`${fieldClass} ${
                      validationField === "gender" ? invalidFieldClass : ""
                    }`}
                  >
                    <option value="">Select gender</option>
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                  </select>
                  {validationField === "gender" && bodyError && (
                    <p className={requiredFieldErrorClass}>{bodyError}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={requiredLabelClass}>
                    Top Size <span className="text-[#430C05]">*</span>
                  </label>
                  <select
                    value={bodyProfile.topSize}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, topSize: e.target.value })}
                    required
                    ref={topSizeRef}
                    className={`${fieldClass} ${
                      validationField === "topSize" ? invalidFieldClass : ""
                    }`}
                  >
                    <option value="">Select size</option>
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                  </select>
                  {validationField === "topSize" && bodyError && (
                    <p className={requiredFieldErrorClass}>{bodyError}</p>
                  )}
                </div>
                <div>
                  <label className={requiredLabelClass}>
                    Bottom Size <span className="text-[#430C05]">*</span>
                  </label>
                  <select
                    value={bodyProfile.bottomSize}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, bottomSize: e.target.value })}
                    required
                    ref={bottomSizeRef}
                    className={`${fieldClass} ${
                      validationField === "bottomSize" ? invalidFieldClass : ""
                    }`}
                  >
                    <option value="">Select size</option>
                    {[36, 38, 40, 42, 44, 46, 48].map((size) => (
                      <option key={size} value={String(size)}>{size}</option>
                    ))}
                  </select>
                  {validationField === "bottomSize" && bodyError && (
                    <p className={requiredFieldErrorClass}>{bodyError}</p>
                  )}
                </div>
                <div>
                  <label className={requiredLabelClass}>
                    Shoe Size <span className="text-[#430C05]">*</span>
                  </label>
                  <select
                    value={bodyProfile.shoeSize}
                    onChange={(e) => setBodyProfile({ ...bodyProfile, shoeSize: e.target.value })}
                    required
                    ref={shoeSizeRef}
                    className={`${fieldClass} ${
                      validationField === "shoeSize" ? invalidFieldClass : ""
                    }`}
                  >
                    <option value="">Select size</option>
                    {[38, 39, 40, 41, 42, 43, 44, 45, 46, 47].map((size) => (
                      <option key={size} value={String(size)}>{size}</option>
                    ))}
                  </select>
                  {validationField === "shoeSize" && bodyError && (
                    <p className={requiredFieldErrorClass}>{bodyError}</p>
                  )}
                </div>
              </div>
              <div className="flex w-full flex-col gap-3 md:items-end">
                {bodyError && !validationField && (
                  <div className="border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">
                    {bodyError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={bodyLoading || imageEnhancing}
                  className="bg-foreground px-6 py-3 text-xs font-medium tracking-wide uppercase text-background transition-colors hover:bg-accent cursor-pointer disabled:opacity-50"
                >
                  {bodyLoading ? "Saving..." : "Save Studio Profile"}
                </button>
              </div>
            </div>
          </div>
          </div>
        </form>
      </div>

      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8"
          onClick={() => setZoomedImage(null)}
        >
          <div
            className="relative w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute right-0 top-0 z-10 border border-white/20 bg-black/60 px-4 py-3 text-xs uppercase tracking-[0.24em] text-white backdrop-blur-sm"
            >
              Close
            </button>
            <div className="overflow-hidden border border-white/15 bg-black/40 p-4 md:p-8">
              <img
                src={zoomedImage.src}
                alt={zoomedImage.alt}
                className="max-h-[85vh] w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
