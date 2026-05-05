"use client";

import { useEffect, useMemo, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

interface AuditActor {
  id: string;
  name: string;
  email: string;
}

interface GeneratedImagePrompt {
  _id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: AuditActor | null;
  updatedBy?: AuditActor | null;
}

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

export default function GeneratedImagePromptsPage() {
  const [prompts, setPrompts] = useState<GeneratedImagePrompt[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt._id === selectedPromptId) || null,
    [prompts, selectedPromptId]
  );

  const filteredPrompts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return prompts;
    return prompts.filter((prompt) =>
      [prompt.title, prompt.description].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [prompts, search]);

  const loadPrompts = () => {
    fetch("/api/generated-image-prompts", withAuthRequest())
      .then((r) => r.json())
      .then((data) => setPrompts(data.prompts || []))
      .catch(() => setError("Unable to load prompts."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const resetForm = () => {
    setSelectedPromptId("");
    setTitle("");
    setDescription("");
    setError("");
  };

  const selectPrompt = (prompt: GeneratedImagePrompt) => {
    setSelectedPromptId(prompt._id);
    setTitle(prompt.title);
    setDescription(prompt.description);
    setError("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Prompt title and description are required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const url = selectedPromptId ? `/api/generated-image-prompts/${selectedPromptId}` : "/api/generated-image-prompts";
      const res = await fetch(
        url,
        withAuthRequest({
          method: selectedPromptId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        })
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Unable to save prompt.");
        setSaving(false);
        return;
      }

      const savedPrompt = data.prompt as GeneratedImagePrompt;
      setPrompts((current) =>
        selectedPromptId
          ? current.map((prompt) => (prompt._id === savedPrompt._id ? savedPrompt : prompt))
          : [savedPrompt, ...current]
      );
      selectPrompt(savedPrompt);
    } catch {
      setError("Network error.");
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this saved prompt?")) return;

    await fetch(`/api/generated-image-prompts/${id}`, withAuthRequest({ method: "DELETE" }));
    setPrompts((current) => current.filter((prompt) => prompt._id !== id));
    if (selectedPromptId === id) resetForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Prompts</h1>
          <p className="text-sm text-text-secondary mt-1">
            Create, update, view, and trace reusable prompts for image generation.
          </p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="bg-text-primary text-bg-primary px-4 py-2 text-xs font-semibold tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer"
        >
          + New Prompt
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts by title or description..."
            className="input-line"
          />

          {loading ? (
            <p className="text-xs text-text-secondary animate-pulse">Loading prompts...</p>
          ) : filteredPrompts.length === 0 ? (
            <p className="text-sm text-text-secondary">No prompts found.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredPrompts.map((prompt) => (
                <div
                  key={prompt._id}
                  className={`rounded border p-4 ${
                    prompt._id === selectedPromptId ? "border-accent bg-bg-hover" : "border-border bg-bg-card"
                  }`}
                >
                  <button type="button" onClick={() => selectPrompt(prompt)} className="block w-full text-left">
                    <p className="text-sm font-medium text-text-primary">{prompt.title}</p>
                    <p className="mt-2 line-clamp-4 text-xs leading-5 text-text-secondary">{prompt.description}</p>
                  </button>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => selectPrompt(prompt)}
                      className="text-[10px] font-semibold uppercase tracking-wider text-accent"
                    >
                      View / Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(prompt._id)}
                      className="text-[10px] uppercase tracking-wider text-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <form onSubmit={handleSave} className="bg-bg-card border border-border rounded p-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-secondary">
                {selectedPromptId ? "Edit Prompt" : "Create Prompt"}
              </p>
              {selectedPrompt && <h2 className="mt-1 text-sm font-semibold">{selectedPrompt.title}</h2>}
            </div>
            {error && (
              <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">
                {error}
              </div>
            )}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Prompt title"
              className="input-line"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={9}
              placeholder="Prompt description"
              className="input-line resize-none"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-text-primary text-bg-primary px-6 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50"
              >
                {saving ? "Saving..." : selectedPromptId ? "Update Prompt" : "Create Prompt"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="border border-border px-6 py-3 text-xs text-text-secondary uppercase tracking-wider hover:bg-bg-hover transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          </form>

          {selectedPrompt && (
            <div className="bg-bg-card border border-border rounded p-5 space-y-3">
              <p className="text-xs uppercase tracking-wider text-text-secondary">Traceability</p>
              <div className="space-y-2 text-xs text-text-secondary">
                <p>Created at: {formatAuditDate(selectedPrompt.createdAt)}</p>
                <p>Created by: {formatAuditActor(selectedPrompt.createdBy)}</p>
                <p>Updated at: {formatAuditDate(selectedPrompt.updatedAt)}</p>
                <p>Updated by: {formatAuditActor(selectedPrompt.updatedBy)}</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
