"use client";

import { useEffect, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

interface GeneratedImageAsset {
  _id: string;
  name?: string;
  prompt: string;
  sourceImages: string[];
  images: string[];
  status: "processing" | "completed" | "failed";
  createdAt: string;
  updatedAt?: string;
  createdBy?: { id: string; name: string; email: string } | null;
  updatedBy?: { id: string; name: string; email: string } | null;
}

function formatAuditActor(actor?: { id: string; name: string; email: string } | null) {
  if (!actor) return "—";
  return actor.name || actor.email || actor.id || "—";
}

function formatAuditDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function GenerateImagesPage() {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const loadGeneratedImages = () => {
    fetch("/api/generated-images", withAuthRequest())
      .then((r) => r.json())
      .then((data) => setGeneratedImages(data.generatedImages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadGeneratedImages();
  }, []);

  const resetForm = () => {
    setName("");
    setPrompt("");
    setImages([]);
    setError("");
    setShowForm(false);
  };

  useEffect(() => {
    const hasProcessing = generatedImages.some((img) => img.status === "processing");
    if (!hasProcessing && !saving) return;

    const timeoutId = setTimeout(() => {
      loadGeneratedImages();
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [generatedImages, saving]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim() || images.length === 0) {
      setError("Please add a name, a prompt, and at least one reference image.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body = new FormData();
      body.append("name", name);
      body.append("prompt", prompt);
      images.forEach((image) => body.append("images", image));

      const res = await fetch("/api/generated-images", withAuthRequest({ method: "POST", body }));
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to generate images.");
        setSaving(false);
        return;
      }

      setGeneratedImages((current) => [data.generatedImage, ...current]);
      resetForm();
    } catch {
      setError("Network error.");
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this generated image set?")) return;
    await fetch(`/api/generated-images/${id}`, withAuthRequest({ method: "DELETE" }));
    setGeneratedImages((current) => current.filter((item) => item._id !== id));
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredGeneratedImages = normalizedSearch
    ? generatedImages.filter((item) =>
        [item.name || "", item.prompt].some((value) => value.toLowerCase().includes(normalizedSearch))
      )
    : generatedImages;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Generate Images</h1>
          <p className="text-sm text-text-secondary mt-1">
            Upload one or more reference images, add a prompt, and save generated results for product import.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError("");
            setShowForm(true);
          }}
          className="bg-accent text-bg-primary px-4 py-2 text-xs font-semibold tracking-wide uppercase hover:bg-accent-hover transition-colors cursor-pointer"
        >
          + Add Generated Image
        </button>
      </div>

      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search generated images by name..."
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 bg-bg-card border border-border rounded p-5">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-xs px-4 py-3 rounded">
              {error}
            </div>
          )}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Generated image name"
            className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
          />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Describe the image you want to generate..."
            className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm resize-none"
          />
          <input
            id="generated-images-upload"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setImages(Array.from(e.target.files || []))}
            className="hidden"
          />
          <div
            onClick={() => document.getElementById("generated-images-upload")?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setImages(Array.from(e.dataTransfer.files || []));
            }}
            className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-border bg-bg-secondary px-4 py-6 text-center transition-colors hover:border-accent hover:bg-bg-hover"
          >
            <span className="text-sm font-medium text-text-primary">Drag or click to add source images</span>
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
                      alt={`Selected source ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="truncate text-[10px] text-text-secondary">{image.name}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-accent text-bg-primary px-6 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50"
            >
              {saving ? "Generating..." : "Generate Images"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="border border-border px-6 py-3 text-xs text-text-secondary uppercase tracking-wider hover:bg-bg-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading generated images...</p>
      ) : filteredGeneratedImages.length === 0 ? (
        <p className="text-sm text-text-secondary">No generated images yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredGeneratedImages.map((item) => (
            <div
              key={item._id}
              className={`bg-bg-card border border-border rounded overflow-hidden ${item.status === "processing" ? "opacity-75" : ""}`}
            >
              <div className="aspect-[3/4] bg-bg-secondary">
                {item.status === "processing" && item.images.length === 0 ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-text-secondary">
                    <div className="mb-3 h-8 w-8 rounded-full border-t-2 border-accent animate-spin" />
                    <span className="text-[10px] uppercase tracking-wider">Generating...</span>
                  </div>
                ) : (
                  <img
                    src={item.images[0] || item.sourceImages[0] || ""}
                    alt={item.name || "Generated image"}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{item.name || "Untitled"}</p>
                      {item.status === "processing" && (
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" title="Generating..." />
                      )}
                    </div>
                    <p className="line-clamp-2 text-[10px] text-text-secondary">{item.prompt}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(item._id)}
                    className="text-[10px] text-danger uppercase tracking-wider shrink-0"
                  >
                    Delete
                  </button>
                </div>
                <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                  {item.sourceImages.length} source image{item.sourceImages.length !== 1 ? "s" : ""} · {item.images.length} result{item.images.length !== 1 ? "s" : ""}
                  {item.status === "processing" && " · PROCESSING"}
                  {item.status === "failed" && " · FAILED"}
                </p>
                <div className="space-y-1 pt-1 text-[10px] text-text-secondary">
                  <p>Created at: {formatAuditDate(item.createdAt)}</p>
                  <p>Created by: {formatAuditActor(item.createdBy)}</p>
                  <p>Updated at: {formatAuditDate(item.updatedAt)}</p>
                  <p>Updated by: {formatAuditActor(item.updatedBy)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
