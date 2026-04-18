"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { shareOutfit } from "@/lib/share";
import { redirectToLogin } from "@/lib/authClient";

interface SavedOutfitDetail {
  id: string;
  name: string;
  images: {
    front?: string;
    back?: string;
  };
  isPublic: boolean;
  shareToken?: string;
  updatedAt: string;
}

export default function SavedOutfitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [outfit, setOutfit] = useState<SavedOutfitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const sharedResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      fetch(`/api/outfits/${id}`)
        .then((response) => {
          if (response.status === 401) {
            redirectToLogin(`/studio/outfits/${id}`);
            return null;
          }
          return response.json();
        })
        .then((data) => {
          if (!data) return;
          setOutfit(data.outfit || null);
        })
        .catch(() => setOutfit(null))
        .finally(() => setLoading(false));
    });
  }, [params]);

  useEffect(() => {
    return () => {
      if (sharedResetTimerRef.current !== null) {
        window.clearTimeout(sharedResetTimerRef.current);
      }
    };
  }, []);

  const handleShare = async () => {
    if (!outfit) return;

    setSharing(true);
    try {
      await shareOutfit(outfit.id);
      setShared(true);
      if (sharedResetTimerRef.current !== null) {
        window.clearTimeout(sharedResetTimerRef.current);
      }
      sharedResetTimerRef.current = window.setTimeout(() => {
        setShared(false);
        sharedResetTimerRef.current = null;
      }, 1800);
    } catch {
      setShared(false);
    }
    setSharing(false);
  };

  if (loading) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Loading outfit...</p>
      </div>
    );
  }

  if (!outfit) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <p className="text-sm text-text-secondary">Outfit not found.</p>
      </div>
    );
  }

  const images = [outfit.images.front, outfit.images.back].filter(Boolean);

  return (
    <div className="pt-[72px] min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">
              Saved Outfit
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-wide uppercase">{outfit.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing}
              aria-busy={sharing}
              className={`inline-flex min-w-[84px] justify-center border border-border-color px-4 py-2 text-[10px] uppercase tracking-wider text-text-secondary hover:text-foreground disabled:opacity-50 ${
                shared ? "cursor-default" : "cursor-pointer"
              }`}
            >
              {shared ? "Copied" : "Share"}
            </button>
            <Link
              href="/studio/outfits"
              className="border border-border-color px-4 py-2 text-[10px] uppercase tracking-wider text-text-secondary hover:text-foreground"
            >
              Back to Outfits
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {images.map((image, index) => (
            <div key={index} className="border border-border-color bg-hover p-4">
              <img
                src={image}
                alt={`${outfit.name} ${index === 0 ? "front" : "back"}`}
                className="w-full max-h-[75vh] object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
