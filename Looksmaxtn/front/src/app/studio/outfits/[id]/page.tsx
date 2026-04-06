"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    params.then(({ id }) => {
      fetch(`/api/outfits/${id}`)
        .then((response) => response.json())
        .then((data) => setOutfit(data.outfit || null))
        .catch(() => setOutfit(null))
        .finally(() => setLoading(false));
    });
  }, [params]);

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
          <Link
            href="/studio"
            className="border border-border-color px-4 py-2 text-[10px] uppercase tracking-wider text-text-secondary hover:text-foreground"
          >
            Back to Studio
          </Link>
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
