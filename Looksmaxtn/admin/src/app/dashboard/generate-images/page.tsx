"use client";

import { useEffect, useState } from "react";

interface GeneratedImageAsset {
  _id: string;
  prompt: string;
  sourceImages: string[];
  images: string[];
  status: "processing" | "completed" | "failed";
  createdAt: string;
}

export default function GenerateImagesPage() {
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadGeneratedImages = () => {
    fetch("/api/generated-images")
      .then((r) => r.json())
      .then((data) => setGeneratedImages(data.generatedImages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadGeneratedImages();
  }, []);

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
    if (!prompt.trim() || images.length === 0) {
      setError("Please add a prompt and at least one reference image.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body = new FormData();
      body.append("prompt", prompt);
      images.forEach((image) => body.append("images", image));

      const res = await fetch("/api/generated-images", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to generate images.");
        setSaving(false);
        return;
      }

      setGeneratedImages((current) => [data.generatedImage, ...current]);
      setPrompt("");
      setImages([]);
    } catch {
      setError("Network error.");
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this generated image set?")) return;
    await fetch(`/api/generated-images/${id}`, { method: "DELETE" });
    setGeneratedImages((current) => current.filter((item) => item._id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-wide">Generate Images</h1>
        <p className="text-sm text-text-secondary mt-1">
          Upload one or more reference images, add a prompt, and save generated results for product import.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 bg-bg-card border border-border rounded p-5">
        {error && <p className="text-xs text-danger">{error}</p>}
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
        <button
          type="submit"
          disabled={saving}
          className="bg-accent text-bg-primary px-6 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50"
        >
          {saving ? "Generating..." : "Generate Images"}
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading generated images...</p>
      ) : generatedImages.length === 0 ? (
        <p className="text-sm text-text-secondary">No generated images yet.</p>
      ) : (
        <div className="space-y-5">
          {generatedImages.map((item) => (
            <div key={item._id} className={`bg-bg-card border border-border rounded p-4 space-y-4 ${item.status === "processing" ? "opacity-75" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{item.prompt}</p>
                    {item.status === "processing" && (
                      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" title="Generating..." />
                    )}
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                    {item.sourceImages.length} source image{item.sourceImages.length !== 1 ? "s" : ""} · {item.images.length} result{item.images.length !== 1 ? "s" : ""}
                    {item.status === "processing" && " · PROCESSING..."}
                    {item.status === "failed" && " · FAILED"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item._id)}
                  className="text-[10px] text-danger uppercase tracking-wider"
                >
                  Delete
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Results</p>
                {item.status === "processing" && item.images.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center rounded border border-dashed border-border bg-bg-secondary text-text-secondary w-full">
                    <div className="w-8 h-8 rounded-full border-t-2 border-accent animate-spin mb-2" />
                    <span className="text-[10px] uppercase tracking-wider">AI is generating images...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {item.images.map((image, index) => (
                      <div key={`${item._id}-${index}`} className="aspect-[4/5] overflow-hidden rounded border border-border bg-bg-secondary">
                        <img src={image} alt={`Generated ${index + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
