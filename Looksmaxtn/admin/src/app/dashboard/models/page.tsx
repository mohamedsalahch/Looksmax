"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";
import { compressImageFile } from "@/lib/imageCompression";

type ModelGender = "male" | "female" | "unisex";

interface ModelAsset {
  _id: string;
  name: string;
  gender: ModelGender;
  images: string[];
  frontImage: string;
  backImage: string;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelAsset[]>([]);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<ModelGender>("unisex");
  const [images, setImages] = useState<File[]>([]);
  const [frontImageIndex, setFrontImageIndex] = useState<number | null>(null);
  const [backImageIndex, setBackImageIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const loadModels = () => {
    fetch("/api/models", withAuthRequest())
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadModels();
  }, []);

  const resetForm = () => {
    setName("");
    setGender("unisex");
    setImages([]);
    setFrontImageIndex(null);
    setBackImageIndex(null);
    setError("");
    setShowForm(false);
  };

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
      body.append("gender", gender);
      body.append("frontImageIndex", String(frontImageIndex));
      body.append("backImageIndex", String(backImageIndex));
      const compressedImages = await Promise.all(images.map((image) => compressImageFile(image)));
      compressedImages.forEach((image) => body.append("images", image));

      const res = await fetch("/api/models", withAuthRequest({ method: "POST", body }));
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to create model.");
        setSaving(false);
        return;
      }

      setModels((current) => [data.model, ...current]);
      resetForm();
    } catch {
      setError("Network error.");
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this model?")) return;
    await fetch(`/api/models/${id}`, withAuthRequest({ method: "DELETE" }));
    setModels((current) => current.filter((model) => model._id !== id));
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredModels = normalizedSearch
    ? models.filter((model) => model.name.toLowerCase().includes(normalizedSearch))
    : models;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Models</h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage the model images used for product generation.
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
          + Add Model
        </button>
      </div>

      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models by name..."
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="max-w-xl space-y-4 bg-bg-card border border-border rounded p-5">
          {error && (
            <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">
              {error}
            </div>
          )}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Model name"
            className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
          />
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as ModelGender)}
            className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
          >
            <option value="unisex">Unisex</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
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
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-accent text-bg-primary px-6 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add Model"}
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
        <p className="text-xs text-text-secondary animate-pulse">Loading models...</p>
      ) : filteredModels.length === 0 ? (
        <p className="text-sm text-text-secondary">No models added yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filteredModels.map((model) => (
            <div key={model._id} className="bg-bg-card border border-border rounded overflow-hidden">
              <Link href={`/dashboard/models/${model._id}`} className="block aspect-[3/4] bg-bg-secondary">
                <img src={model.frontImage || model.images?.[0] || ""} alt={model.name} className="w-full h-full object-cover" />
              </Link>
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{model.name}</p>
                  <span className="text-[9px] uppercase tracking-wider border border-border px-1.5 py-0.5 text-text-secondary">
                    {model.gender || "unisex"}
                  </span>
                </div>
                <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                  {model.images?.length || 0} image{(model.images?.length || 0) !== 1 ? "s" : ""}
                </p>
                <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                  Front / Back selected
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/dashboard/models/${model._id}`}
                    className="text-[10px] text-accent uppercase tracking-wider"
                  >
                    Edit
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
