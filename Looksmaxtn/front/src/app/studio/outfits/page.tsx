"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/AuthContext";
import { redirectToLogin, withAuthRequest } from "@/lib/authClient";
import { shareOutfit } from "@/lib/share";
import {
  readSavedOutfitsSession,
  removeSavedOutfitSession,
  writeSavedOutfitsSession,
} from "@/lib/savedOutfitsSession";

interface SavedOutfitItem {
  id: string;
  name: string;
  images: {
    front?: string;
    back?: string;
  };
  outfitSnapshot?: Record<
    string,
    {
      status?: boolean;
      productId?: string;
      fashionSubtype?: string;
      size?: string;
    } | null
  >;
  isPublic: boolean;
  shareToken?: string;
  updatedAt: string;
}

function getAvailableOutfitImages(images?: { front?: string; back?: string }) {
  return [images?.front, images?.back].filter(
    (image): image is string => typeof image === "string" && image.length > 0
  );
}

export default function SavedOutfitsPage() {
  const { user, loading: authLoading } = useAuth();
  const [outfits, setOutfits] = useState<SavedOutfitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingOutfitId, setSharingOutfitId] = useState("");
  const [sharedOutfitId, setSharedOutfitId] = useState("");
  const [deletingOutfitId, setDeletingOutfitId] = useState("");
  const shareResetTimerRef = useRef<number | null>(null);

  const clearShareResetTimer = () => {
    if (shareResetTimerRef.current === null) return;
    window.clearTimeout(shareResetTimerRef.current);
    shareResetTimerRef.current = null;
  };

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    const nextUserId = user?.id || "";
    const cachedOutfits = nextUserId ? readSavedOutfitsSession(nextUserId) : null;

    if (cachedOutfits) {
      queueMicrotask(() => {
        if (cancelled) return;
        setOutfits(cachedOutfits);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (cancelled) return;
        setLoading(true);
      });
    }

    fetch("/api/outfits?ts=" + Date.now(), withAuthRequest({ cache: "no-store" }))
      .then((response) => {
        if (response.status === 401) {
          redirectToLogin("/studio/outfits");
          return null;
        }
        return response.json();
      })
      .then((data) => {
        if (!data) return;
        if (cancelled) return;
        const nextOutfits = data.outfits || [];
        setOutfits(nextOutfits);
        if (nextUserId) {
          writeSavedOutfitsSession(nextUserId, nextOutfits);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setOutfits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  useEffect(() => {
    return () => {
      if (shareResetTimerRef.current !== null) {
        window.clearTimeout(shareResetTimerRef.current);
      }
    };
  }, []);

  const handleShareOutfit = async (id: string) => {
    setSharingOutfitId(id);
    try {
      const { copied } = await shareOutfit(id);
      if (!copied) {
        setSharedOutfitId("");
        return;
      }
      clearShareResetTimer();
      setSharedOutfitId(id);
      shareResetTimerRef.current = window.setTimeout(() => {
        setSharedOutfitId("");
        shareResetTimerRef.current = null;
      }, 1800);
    } catch {
      setSharedOutfitId("");
    }
    setSharingOutfitId("");
  };

  const handleDeleteOutfit = async (id: string) => {
    setDeletingOutfitId(id);
    try {
      const response = await fetch(`/api/outfits/${id}`, withAuthRequest({ method: "DELETE" }));
      if (!response.ok) return;

      setOutfits((current) => current.filter((outfit) => outfit.id !== id));
      if (user?.id) {
        removeSavedOutfitSession(user.id, id);
      }
    } catch {
      // Keep the outfit visible if deletion fails.
    } finally {
      setDeletingOutfitId("");
    }
  };

  if (loading) {
    return (
      <div className="pt-[80px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Loading saved outfits...</p>
      </div>
    );
  }

  return (
    <div className="pt-[80px] min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Saved outfits</p>
          </div>
          {outfits.length > 0 && (
            <Link
              href="/studio"
              className="inline-flex items-center text-[10px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-foreground hover:decoration-foreground"
            >
              Back to Studio
            </Link>
          )}
        </div>

        {outfits.length === 0 ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
            <p className="text-sm text-text-secondary">No saved outfits yet.</p>
            <Link
              href="/studio"
              className="inline-flex items-center text-[10px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-foreground hover:decoration-foreground"
            >
              Back to Studio
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {outfits.map((outfit) => {
              const images = getAvailableOutfitImages(outfit.images);
              const views = Object.entries(outfit.outfitSnapshot || {})
                .filter(([, value]) => Boolean((value as { status?: boolean } | null)?.status))
                .map(([key]) => key);

              return (
                <div key={outfit.id} className="border border-border-color p-4 space-y-4">
                  <div className={images.length > 1 ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
                    {images.map((image, index) => (
                      <Link
                        key={`${outfit.id}-${index}`}
                        href={`/studio/outfits/${outfit.id}`}
                        className="block overflow-hidden"
                      >
                        <img
                          src={image}
                          alt={`${outfit.name} ${index === 0 ? "front" : "back"}`}
                          className="mx-auto h-44 w-full object-contain transition-opacity hover:opacity-90"
                        />
                      </Link>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-[#1a1a1a]">{outfit.name}</p>
                      </div>
                      <div className="flex items-center gap-6">
                        <button
                          type="button"
                          onClick={() => handleShareOutfit(outfit.id)}
                          disabled={sharingOutfitId === outfit.id}
                          aria-busy={sharingOutfitId === outfit.id}
                          className={`text-[10px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-foreground hover:decoration-foreground disabled:opacity-50 ${
                            sharedOutfitId === outfit.id ? "cursor-default" : "cursor-pointer"
                          }`}
                        >
                          {sharedOutfitId === outfit.id ? "Copied" : "Share"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteOutfit(outfit.id)}
                          disabled={deletingOutfitId === outfit.id}
                          aria-busy={deletingOutfitId === outfit.id}
                          className="text-[10px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-[#430C05] hover:decoration-[#430C05] disabled:opacity-50"
                        >
                          {deletingOutfitId === outfit.id ? "Deleting" : "Delete"}
                        </button>
                      </div>
                    </div>

                    {views.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {views.map((view) => (
                          <span
                            key={`${outfit.id}-${view}`}
                            className="border border-[#00000012] bg-[#f7f2e8] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#666]"
                          >
                            {view}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
