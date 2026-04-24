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
  const [sharedMode, setSharedMode] = useState<"copied" | "">("");
  const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);
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
    document.body.classList.toggle("outfit-detail-zoom-open", zoomedImageIndex !== null);
    return () => {
      document.body.classList.remove("outfit-detail-zoom-open");
    };
  }, [zoomedImageIndex]);

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
      const { copied } = await shareOutfit(outfit.id);
      if (!copied) {
        setSharedMode("");
        return;
      }
      setSharedMode("copied");
      if (sharedResetTimerRef.current !== null) {
        window.clearTimeout(sharedResetTimerRef.current);
      }
      sharedResetTimerRef.current = window.setTimeout(() => {
        setSharedMode("");
        sharedResetTimerRef.current = null;
      }, 1800);
    } catch {
      setSharedMode("");
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
  const activeZoomedImage = zoomedImageIndex === null ? "" : images[zoomedImageIndex] || "";

  const showPreviousImage = () => {
    if (zoomedImageIndex === null || images.length <= 1) return;
    setZoomedImageIndex(zoomedImageIndex === 0 ? images.length - 1 : zoomedImageIndex - 1);
  };

  const showNextImage = () => {
    if (zoomedImageIndex === null || images.length <= 1) return;
    setZoomedImageIndex(zoomedImageIndex === images.length - 1 ? 0 : zoomedImageIndex + 1);
  };

  return (
    <div className="pt-[72px] min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide uppercase">{outfit.name}</h1>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing}
              aria-busy={sharing}
              className={`text-[10px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-foreground hover:decoration-foreground disabled:opacity-50 ${
                sharedMode ? "cursor-default" : "cursor-pointer"
              }`}
            >
              {sharedMode ? "Copied" : "Share"}
            </button>
            <Link
              href="/studio/outfits"
              className="inline-flex items-center text-[10px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-foreground hover:decoration-foreground"
            >
              Back to Outfits
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {images.map((image, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setZoomedImageIndex(index)}
              className="border border-border-color bg-hover p-4 text-left cursor-zoom-in"
              aria-label={`Zoom ${outfit.name} ${index === 0 ? "front" : "back"}`}
            >
              <img
                src={image}
                alt={`${outfit.name} ${index === 0 ? "front" : "back"}`}
                className="w-full max-h-[75vh] object-contain"
              />
            </button>
          ))}
        </div>
      </div>

      {zoomedImageIndex !== null && activeZoomedImage ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 py-8"
          onClick={() => setZoomedImageIndex(null)}
        >
          <div
            className="relative w-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomedImageIndex(null)}
              className="absolute right-0 top-0 z-10 border border-white/20 bg-black/60 px-4 py-3 text-xs uppercase tracking-[0.24em] text-white backdrop-blur-sm"
            >
              Close
            </button>
            <div className="overflow-hidden border border-white/15 bg-black/40 p-4 md:p-8">
              <img
                src={activeZoomedImage}
                alt={`${outfit.name} enlarged`}
                className="max-h-[85vh] w-full object-contain"
              />
            </div>
            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={showPreviousImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 border border-white/20 bg-black/60 px-4 py-4 text-lg text-white backdrop-blur-sm"
                  aria-label="Show previous outfit image"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={showNextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 border border-white/20 bg-black/60 px-4 py-4 text-lg text-white backdrop-blur-sm"
                  aria-label="Show next outfit image"
                >
                  →
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
