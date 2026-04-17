"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";
import { shareOutfit } from "@/lib/share";

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
  const [outfits, setOutfits] = useState<SavedOutfitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingOutfitId, setSharingOutfitId] = useState("");
  const [sharedOutfitId, setSharedOutfitId] = useState("");
  const shareResetTimerRef = useRef<number | null>(null);

  const clearShareResetTimer = () => {
    if (shareResetTimerRef.current === null) return;
    window.clearTimeout(shareResetTimerRef.current);
    shareResetTimerRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;

    fetch("/api/outfits?ts=" + Date.now(), withAuthRequest({ cache: "no-store" }))
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setOutfits(data.outfits || []);
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
  }, []);

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
      clearShareResetTimer();
      setSharedOutfitId(id);
      shareResetTimerRef.current = window.setTimeout(() => {
        setSharedOutfitId("");
        shareResetTimerRef.current = null;
      }, copied ? 2000 : 4000);
    } catch {
      setSharedOutfitId("");
    }
    setSharingOutfitId("");
  };

  if (loading) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Loading saved outfits...</p>
      </div>
    );
  }

  return (
    <div className="pt-[72px] min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Saved outfits</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-wide uppercase">All Saved Outfits</h1>
          </div>
          <Link
            href="/studio"
            className="border border-border-color px-4 py-2 text-[10px] uppercase tracking-wider text-text-secondary hover:text-foreground"
          >
            Back to Studio
          </Link>
        </div>

        {outfits.length === 0 ? (
          <div className="border border-border-color border-dashed bg-background px-6 py-12 text-center text-sm text-text-secondary">
            No saved outfits yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {outfits.map((outfit) => {
              const images = getAvailableOutfitImages(outfit.images);
              const views = Object.entries(outfit.outfitSnapshot || {})
                .filter(([, value]) => Boolean((value as { status?: boolean } | null)?.status))
                .map(([key]) => key);

              return (
                <div key={outfit.id} className="border border-border-color bg-[#ede1ce] p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {images.map((image, index) => (
                      <Link
                        key={`${outfit.id}-${index}`}
                        href={`/studio/outfits/${outfit.id}`}
                        className="block overflow-hidden bg-[#e8dccb]"
                      >
                        <img
                          src={image}
                          alt={`${outfit.name} ${index === 0 ? "front" : "back"}`}
                          className="h-44 w-full object-contain"
                        />
                      </Link>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-[#1a1a1a]">{outfit.name}</p>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-[#666]">
                          Updated {new Date(outfit.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/studio/outfits/${outfit.id}`}
                          className="border border-[#00000012] bg-transparent px-3.5 py-2 text-[11px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e]"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleShareOutfit(outfit.id)}
                          disabled={sharingOutfitId === outfit.id}
                          className="border border-[#00000012] bg-transparent px-3.5 py-2 text-[11px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e] disabled:opacity-50"
                        >
                          {sharingOutfitId === outfit.id
                            ? "Sharing..."
                            : sharedOutfitId === outfit.id
                              ? "Copied"
                              : "Share"}
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
