"use client";

import AuditMetaCard from "@/components/AuditMetaCard";
import Link from "next/link";
import { use, useEffect, useState } from "react";

type ModelGender = "male" | "female" | "child";

interface ModelAsset {
  _id: string;
  name: string;
  gender: ModelGender;
  images: string[];
  frontImage: string;
  backImage: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: { id: string; name: string; email: string } | null;
  updatedBy?: { id: string; name: string; email: string } | null;
}

function normalizeModelGender(gender?: string | null): ModelGender {
  return gender === "male" || gender === "female" || gender === "child" ? gender : "child";
}

export default function ModelViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [model, setModel] = useState<ModelAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<ModelGender>("male");
  const [frontImage, setFrontImage] = useState("");
  const [backImage, setBackImage] = useState("");

  useEffect(() => {
    fetch(`/api/models/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const nextModel = data.model || null;
        setModel(nextModel);
        if (nextModel) {
          setName(nextModel.name);
          setGender(normalizeModelGender(nextModel.gender));
          setFrontImage(nextModel.frontImage);
          setBackImage(nextModel.backImage);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/models/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, gender, frontImage, backImage }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Unable to update model.");
        setSaving(false);
        return;
      }

      setModel(data.model);
      setName(data.model.name);
      setGender(normalizeModelGender(data.model.gender));
      setFrontImage(data.model.frontImage);
      setBackImage(data.model.backImage);
      setEditing(false);
    } catch {
      setError("Network error.");
    }

    setSaving(false);
  };

  if (loading) return <p className="text-xs text-text-secondary animate-pulse">Loading model...</p>;
  if (!model) return <p className="text-sm text-text-secondary">Model not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/models"
          className="text-xs text-text-secondary hover:text-text-primary transition-colors mb-2 inline-block"
        >
          â† Back
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-wide">{model.name}</h1>
              <span className="text-[10px] uppercase tracking-wider border border-border px-2 py-0.5 text-text-secondary">
                {normalizeModelGender(model.gender)}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-1">
              {model.images.length} image{model.images.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing((current) => !current);
              setError("");
              setName(model.name);
              setGender(normalizeModelGender(model.gender));
              setFrontImage(model.frontImage);
              setBackImage(model.backImage);
            }}
            className="bg-text-primary text-bg-primary px-4 py-2 text-xs font-semibold tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer"
          >
            {editing ? "Close Update" : "Update Model"}
          </button>
        </div>
      </div>

      <AuditMetaCard
        createdAt={model.createdAt}
        updatedAt={model.updatedAt}
        createdBy={model.createdBy}
        updatedBy={model.updatedBy}
        title="Model Traceability"
      />

      {editing && (
        <form onSubmit={handleUpdate} className="bg-bg-card border border-border rounded p-5 space-y-4">
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
            className="input-line"
          />
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as ModelGender)}
            className="input-line"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="child">Child</option>
          </select>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              value={frontImage}
              onChange={(e) => setFrontImage(e.target.value)}
              className="input-line"
            >
              <option value="">Select front image</option>
              {model.images.map((image, index) => (
                <option key={`front-${image}-${index}`} value={image}>
                  Image {index + 1}
                </option>
              ))}
            </select>
            <select
              value={backImage}
              onChange={(e) => setBackImage(e.target.value)}
              className="input-line"
            >
              <option value="">Select back image</option>
              {model.images.map((image, index) => (
                <option key={`back-${image}-${index}`} value={image}>
                  Image {index + 1}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-text-primary text-bg-primary px-6 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError("");
                setName(model.name);
                setGender(normalizeModelGender(model.gender));
                setFrontImage(model.frontImage);
                setBackImage(model.backImage);
              }}
              className="border border-border px-6 py-3 text-xs text-text-secondary uppercase tracking-wider hover:bg-bg-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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
