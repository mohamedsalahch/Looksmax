"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ModelAsset {
  _id: string;
  name: string;
  images: string[];
  frontImage: string;
  backImage: string;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelAsset[]>([]);
  const [name, setName] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [frontImageIndex, setFrontImageIndex] = useState<number | null>(null);
  const [backImageIndex, setBackImageIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadModels = () => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || images.length === 0) {
      setError("Please provide a model name and at least one image.");
      return;
    }

    if (frontImageIndex === null || backImageIndex === null) {
      setError("Please choose both the front and back model images.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body = new FormData();
      body.append("name", name);
      body.append("frontImageIndex", String(frontImageIndex));
      body.append("backImageIndex", String(backImageIndex));
      images.forEach((image) => body.append("images", image));

      const res = await fetch("/api/models", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to create model.");
        setSaving(false);
        return;
      }

      setModels((current) => [data.model, ...current]);
      setName("");
      setImages([]);
      setFrontImageIndex(null);
      setBackImageIndex(null);
    } catch {
      setError("Network error.");
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this model?")) return;
    await fetch(`/api/models/${id}`, { method: "DELETE" });
    setModels((current) => current.filter((model) => model._id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-wide">Models</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage the model images used for product generation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-4 bg-bg-card border border-border rounded p-5">
        {error && <p className="text-xs text-danger">{error}</p>}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Model name"
          className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
        />
        <input
          id="model-images-upload"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setImages(Array.from(e.target.files || []))}
          className="hidden"
        />
        <div
          onClick={() => document.getElementById("model-images-upload")?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setImages(Array.from(e.dataTransfer.files || []));
          }}
          className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-border bg-bg-secondary px-4 py-6 text-center transition-colors hover:border-accent hover:bg-bg-hover"
        >
          <span className="text-sm font-medium text-text-primary">Drag or click to add model images</span>
          <span className="text-[10px] uppercase tracking-wider text-text-secondary">
            Select files or drop one or more images
          </span>
        </div>
        {images.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {images.map((image, index) => (
              <div key={`${image.name}-${index}`} className="space-y-2">
                <div className="aspect-[4/5] overflow-hidden rounded border border-border bg-bg-secondary">
                  <img
                    src={URL.createObjectURL(image)}
                    alt={`Selected model ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFrontImageIndex(index)}
                    className={`px-2 py-1 text-[10px] uppercase tracking-wider border ${
                      frontImageIndex === index
                        ? "border-accent text-accent"
                        : "border-border text-text-secondary"
                    }`}
                  >
                    Front
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackImageIndex(index)}
                    className={`px-2 py-1 text-[10px] uppercase tracking-wider border ${
                      backImageIndex === index
                        ? "border-accent text-accent"
                        : "border-border text-text-secondary"
                    }`}
                  >
                    Back
                  </button>
                </div>
                <p className="truncate text-[10px] text-text-secondary">{image.name}</p>
              </div>
            ))}
          </div>
        )}
        <button
          type="submit"
          disabled={saving}
          className="bg-accent text-bg-primary px-6 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add Model"}
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading models...</p>
      ) : models.length === 0 ? (
        <p className="text-sm text-text-secondary">No models added yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {models.map((model) => (
            <div key={model._id} className="bg-bg-card border border-border rounded overflow-hidden">
              <div className="aspect-[3/4] bg-bg-secondary">
                <img src={model.frontImage || model.images?.[0] || ""} alt={model.name} className="w-full h-full object-cover" />
              </div>
              <div className="p-3 space-y-2">
                <p className="text-sm font-medium">{model.name}</p>
                <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                  {model.images?.length || 0} image{(model.images?.length || 0) !== 1 ? "s" : ""}
                </p>
                <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                  Front / Back selected
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/dashboard/models/${model._id}`}
                    className="inline-block text-[10px] text-accent uppercase tracking-wider"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(model._id)}
                    className="text-[10px] text-danger uppercase tracking-wider"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
