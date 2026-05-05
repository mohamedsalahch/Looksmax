"use client";

import { useEffect, useMemo, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";
import { compressImageFile } from "@/lib/imageCompression";

interface AuditActor {
  id: string;
  name: string;
  email: string;
}

interface GeneratedImageAsset {
  _id: string;
  name?: string;
  prompt: string;
  promptId?: string;
  promptTitle?: string;
  promptDescription?: string;
  sourceImages: string[];
  images: string[];
  status: "processing" | "completed" | "failed";
  errorMessage?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: AuditActor | null;
  updatedBy?: AuditActor | null;
}

interface GeneratedImagePrompt {
  _id: string;
  title: string;
  description: string;
}

type PromptMode = "saved" | "custom";

function formatAuditActor(actor?: AuditActor | null) {
  if (!actor) return "-";
  return actor.name || actor.email || actor.id || "-";
}

function formatAuditDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function previewPromptDescription(description: string) {
  const normalized = description.trim();
  if (normalized.length <= 100) return normalized;
  return `${normalized.slice(0, 100)}...`;
}

export default function GenerateImagesPage() {
  const [name, setName] = useState("");
  const [promptMode, setPromptMode] = useState<PromptMode>("saved");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [customPromptDescription, setCustomPromptDescription] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageAsset[]>([]);
  const [prompts, setPrompts] = useState<GeneratedImagePrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [promptSearch, setPromptSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [viewImage, setViewImage] = useState<{ url: string; title: string } | null>(null);

  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt._id === selectedPromptId) || null,
    [prompts, selectedPromptId]
  );

  const filteredPrompts = useMemo(() => {
    const normalized = promptSearch.trim().toLowerCase();
    if (!normalized) return prompts;
    return prompts.filter((prompt) =>
      [prompt.title, prompt.description].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [promptSearch, prompts]);

  const loadGeneratedImages = () => {
    fetch("/api/generated-images", withAuthRequest())
      .then((r) => r.json())
      .then((data) => setGeneratedImages(data.generatedImages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadPrompts = () => {
    fetch("/api/generated-image-prompts", withAuthRequest())
      .then((r) => r.json())
      .then((data) => {
        const nextPrompts = data.prompts || [];
        setPrompts(nextPrompts);
        setSelectedPromptId((current) => current || nextPrompts[0]?._id || "");
      })
      .catch(() => {})
      .finally(() => setPromptsLoading(false));
  };

  useEffect(() => {
    loadGeneratedImages();
    loadPrompts();
  }, []);

  useEffect(() => {
    const hasProcessing = generatedImages.some((img) => img.status === "processing");
    if (!hasProcessing && !saving) return;

    const timeoutId = setTimeout(() => {
      loadGeneratedImages();
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [generatedImages, saving]);

  useEffect(() => {
    if (!viewImage) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewImage(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [viewImage]);

  const resetForm = () => {
    setName("");
    setImages([]);
    setError("");
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const promptTitle = promptMode === "saved" ? selectedPrompt?.title || "" : "One-off prompt";
    const promptDescription = promptMode === "saved" ? selectedPrompt?.description || "" : customPromptDescription;
    const prompt = promptMode === "saved" ? `${promptTitle}\n\n${promptDescription}` : promptDescription.trim();

    if (!name.trim() || !prompt || images.length === 0) {
      setError("Please add a name, choose or write a prompt, and add at least one reference image.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body = new FormData();
      body.append("name", name);
      body.append("prompt", prompt);
      body.append("promptTitle", promptTitle);
      body.append("promptDescription", promptDescription);
      if (promptMode === "saved" && selectedPromptId) body.append("promptId", selectedPromptId);
      const compressedImages = await Promise.all(images.map((image) => compressImageFile(image)));
      compressedImages.forEach((image) => body.append("images", image));

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
        [item.name || "", item.promptTitle || "", item.promptDescription || "", item.prompt].some((value) =>
          value.toLowerCase().includes(normalizedSearch)
        )
      )
    : generatedImages;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Generate Images</h1>
          <p className="text-sm text-text-secondary mt-1">
            Choose a saved prompt or write a one-off prompt for this generation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError("");
            setShowForm(true);
          }}
          className="bg-text-primary text-bg-primary px-4 py-2 text-xs font-semibold tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer"
        >
          + Add Generated Image
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search generated images by name or prompt..."
        className="input-line"
      />

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4 bg-bg-card border border-border rounded p-5">
          {error && (
            <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">
              {error}
            </div>
          )}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Generated image name"
            className="input-line"
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPromptMode("saved")}
                  className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-wider border ${
                    promptMode === "saved" ? "border-accent bg-bg-hover text-text-primary" : "border-border text-text-secondary"
                  }`}
                >
                  Saved Prompt
                </button>
                <button
                  type="button"
                  onClick={() => setPromptMode("custom")}
                  className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-wider border ${
                    promptMode === "custom" ? "border-accent bg-bg-hover text-text-primary" : "border-border text-text-secondary"
                  }`}
                >
                  Own Prompt
                </button>
              </div>

              {promptMode === "saved" ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={promptSearch}
                    onChange={(e) => setPromptSearch(e.target.value)}
                    placeholder="Search saved prompts..."
                    className="input-line"
                  />
                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                    {promptsLoading ? (
                      <p className="text-xs text-text-secondary animate-pulse">Loading prompts...</p>
                    ) : filteredPrompts.length === 0 ? (
                      <p className="text-sm text-text-secondary">No saved prompts found.</p>
                    ) : (
                      filteredPrompts.map((prompt) => (
                        <button
                          key={prompt._id}
                          type="button"
                          onClick={() => setSelectedPromptId(prompt._id)}
                          className={`block w-full rounded border p-3 text-left ${
                            prompt._id === selectedPromptId ? "border-accent bg-bg-hover" : "border-border bg-bg-secondary"
                          }`}
                        >
                          <span className="block text-sm font-medium text-text-primary">{prompt.title}</span>
                          <span className="mt-1 block text-xs text-text-secondary">
                            {previewPromptDescription(prompt.description)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={customPromptDescription}
                    onChange={(e) => setCustomPromptDescription(e.target.value)}
                    rows={8}
                    placeholder="Prompt description used only for this generation..."
                    className="input-line resize-none"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">

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
            </div>
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
              className="bg-text-primary text-bg-primary px-6 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50"
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredGeneratedImages.map((item) => (
            <div
              key={item._id}
              className={`bg-bg-card border border-border rounded overflow-hidden ${item.status === "processing" ? "opacity-75" : ""}`}
            >
              <div className="aspect-[4/3] bg-bg-secondary">
                {item.status === "processing" && item.images.length === 0 ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-text-secondary">
                    <div className="mb-3 h-8 w-8 rounded-full border-t-2 border-accent animate-spin" />
                    <span className="text-[10px] uppercase tracking-wider">Generating...</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setViewImage({
                        url: item.images[0] || item.sourceImages[0] || "",
                        title: item.name || "Generated image",
                      })
                    }
                    className="block h-full w-full cursor-zoom-in"
                    aria-label={`View ${item.name || "generated image"} full size`}
                  >
                    <img
                      src={item.images[0] || item.sourceImages[0] || ""}
                      alt={item.name || "Generated image"}
                      className="w-full h-full object-cover"
                    />
                  </button>
                )}
              </div>
              <div className="p-2.5 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium truncate">{item.name || "Untitled"}</p>
                      {item.status === "processing" && (
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" title="Generating..." />
                      )}
                    </div>
                    <p className="line-clamp-1 text-[10px] font-semibold uppercase tracking-wider text-text-primary">
                      {item.promptTitle || "One-off prompt"}
                    </p>
                    <p className="line-clamp-1 text-[10px] text-text-secondary">
                      {item.promptDescription || item.prompt}
                    </p>
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
                  {item.sourceImages.length} source image{item.sourceImages.length !== 1 ? "s" : ""} Â· {item.images.length} result{item.images.length !== 1 ? "s" : ""}
                  {item.status === "processing" && " Â· PROCESSING"}
                  {item.status === "failed" && ` Â· FAILED${item.errorMessage ? ` - ${item.errorMessage}` : ""}`}
                </p>
                <div className="space-y-0.5 pt-0.5 text-[9px] text-text-secondary">
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

      {viewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={viewImage.title}
          onClick={() => setViewImage(null)}
        >
          <div className="relative max-h-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setViewImage(null)}
              className="absolute right-0 top-0 z-10 bg-bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-primary"
            >
              Close
            </button>
            <img
              src={viewImage.url}
              alt={viewImage.title}
              className="max-h-[90vh] max-w-[92vw] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
