"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

interface ModelAsset {
  _id: string;
  name: string;
  images: string[];
  frontImage: string;
  backImage: string;
  createdAt: string;
}

export default function ModelViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [model, setModel] = useState<ModelAsset | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/models/${id}`)
      .then((r) => r.json())
      .then((data) => setModel(data.model || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-xs text-text-secondary animate-pulse">Loading model...</p>;
  if (!model) return <p className="text-sm text-text-secondary">Model not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/models"
          className="text-xs text-text-secondary hover:text-text-primary transition-colors mb-2 inline-block"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold tracking-wide">{model.name}</h1>
        <p className="text-xs text-text-secondary mt-1">
          {model.images.length} image{model.images.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {model.images.map((image, index) => (
          <div key={`${image}-${index}`} className="bg-bg-card border border-border rounded overflow-hidden">
            <div className="aspect-[3/4] bg-bg-secondary">
              <img src={image} alt={`${model.name} ${index + 1}`} className="w-full h-full object-cover" />
            </div>
            <div className="px-3 py-2">
              <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                {model.frontImage === image ? "Front" : model.backImage === image ? "Back" : `Image ${index + 1}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
