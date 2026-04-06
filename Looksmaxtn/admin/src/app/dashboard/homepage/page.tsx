"use client";

import { useEffect, useMemo, useState } from "react";

interface HomeStat {
  label: string;
  value: string;
}

interface CategoryOption {
  _id: string;
  name: string;
  slug: string;
  parentSlug?: string | null;
}

interface HomePageContent {
  hero: { image: string; eyebrow: string; title: string; subtitle: string };
  brandStory: {
    eyebrow: string;
    title: string;
    paragraphOne: string;
    paragraphTwo: string;
    stats: HomeStat[];
  };
  lookbook: { caption: string; images: string[]; categorySlugs: string[] };
  editorial: { image: string; eyebrow: string; label: string };
  featured: { title: string };
}

const emptyContent: HomePageContent = {
  hero: { image: "", eyebrow: "", title: "", subtitle: "" },
  brandStory: {
    eyebrow: "",
    title: "",
    paragraphOne: "",
    paragraphTwo: "",
    stats: [
      { label: "", value: "" },
      { label: "", value: "" },
      { label: "", value: "" },
    ],
  },
  lookbook: { caption: "", images: [], categorySlugs: [] },
  editorial: { image: "", eyebrow: "", label: "" },
  featured: { title: "" },
};

export default function HomePageEditor() {
  const [content, setContent] = useState<HomePageContent>(emptyContent);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [editorialFile, setEditorialFile] = useState<File | null>(null);
  const [lookbookFiles, setLookbookFiles] = useState<File[]>([]);

  useEffect(() => {
    fetch("/api/homepage")
      .then((r) => r.json())
      .then((data) => {
        if (data.content) {
          setContent({
            ...emptyContent,
            ...data.content,
            brandStory: {
              ...emptyContent.brandStory,
              ...data.content.brandStory,
              stats:
                data.content.brandStory?.stats?.length > 0
                  ? data.content.brandStory.stats
                  : emptyContent.brandStory.stats,
            },
            lookbook: {
              ...emptyContent.lookbook,
              ...data.content.lookbook,
              images: (data.content.lookbook?.images || []).filter((image: string) =>
                Boolean(String(image).trim())
              ),
              categorySlugs: (data.content.lookbook?.categorySlugs || []).slice(
                0,
                (data.content.lookbook?.images || []).filter((image: string) =>
                  Boolean(String(image).trim())
                ).length
              ),
            },
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) =>
        setCategories((data.categories || []).filter((category: CategoryOption) => !category.parentSlug))
      )
      .catch(() => {});
  }, []);

  const heroPreview = useMemo(
    () => (heroFile ? URL.createObjectURL(heroFile) : content.hero.image),
    [heroFile, content.hero.image]
  );
  const editorialPreview = useMemo(
    () => (editorialFile ? URL.createObjectURL(editorialFile) : content.editorial.image),
    [editorialFile, content.editorial.image]
  );
  const lookbookPreview = useMemo(
    () =>
      lookbookFiles.length > 0
        ? lookbookFiles.map((file) => URL.createObjectURL(file))
        : content.lookbook.images,
    [content.lookbook.images, lookbookFiles]
  );

  const updateStat = (index: number, field: keyof HomeStat, value: string) => {
    setContent((current) => ({
      ...current,
      brandStory: {
        ...current.brandStory,
        stats: current.brandStory.stats.map((stat, i) =>
          i === index ? { ...stat, [field]: value } : stat
        ),
      },
    }));
  };

  const removeLookbookImage = (index: number) => {
    setContent((current) => ({
      ...current,
      lookbook: {
        ...current.lookbook,
        images: current.lookbook.images.filter((_, i) => i !== index),
        categorySlugs: current.lookbook.categorySlugs.filter((_, i) => i !== index),
      },
    }));
  };

  const updateLookbookCategory = (index: number, value: string) => {
    setContent((current) => {
      const nextCategorySlugs = [...current.lookbook.categorySlugs];
      nextCategorySlugs[index] = value;

      return {
        ...current,
        lookbook: {
          ...current.lookbook,
          categorySlugs: nextCategorySlugs,
        },
      };
    });
  };

  const handleLookbookFilesSelect = (files: FileList | null) => {
    const nextFiles = Array.from(files || []);
    setLookbookFiles(nextFiles);
    setContent((current) => ({
      ...current,
      lookbook: {
        ...current.lookbook,
        images: nextFiles.length > 0 ? [] : current.lookbook.images,
        categorySlugs: nextFiles.length > 0 ? Array(nextFiles.length).fill("") : current.lookbook.categorySlugs,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const lookbookImageCount = content.lookbook.images.length + lookbookFiles.length;
      const selectedLookbookCategorySlugs = content.lookbook.categorySlugs
        .slice(0, lookbookImageCount)
        .map((slug) => String(slug || "").trim());

      if (
        lookbookImageCount > 0 &&
        selectedLookbookCategorySlugs.length !== lookbookImageCount
      ) {
        setMessage("Please select a category for every lookbook image.");
        setSaving(false);
        return;
      }

      if (
        lookbookImageCount > 0 &&
        selectedLookbookCategorySlugs.some((slug) => !slug)
      ) {
        setMessage("Please select a category for every lookbook image.");
        setSaving(false);
        return;
      }

      const body = new FormData();
      body.append("heroEyebrow", content.hero.eyebrow);
      body.append("heroTitle", content.hero.title);
      body.append("heroSubtitle", content.hero.subtitle);
      body.append("existingHeroImage", content.hero.image || "");
      if (heroFile) body.append("heroImage", heroFile);

      body.append("brandEyebrow", content.brandStory.eyebrow);
      body.append("brandTitle", content.brandStory.title);
      body.append("brandParagraphOne", content.brandStory.paragraphOne);
      body.append("brandParagraphTwo", content.brandStory.paragraphTwo);
      body.append("brandStats", JSON.stringify(content.brandStory.stats));

      body.append("lookbookCaption", content.lookbook.caption);
      body.append("existingLookbookImages", JSON.stringify(content.lookbook.images));
      body.append("lookbookCategorySlugs", JSON.stringify(selectedLookbookCategorySlugs));
      lookbookFiles.forEach((file) => body.append("lookbookImages", file));

      body.append("editorialEyebrow", content.editorial.eyebrow);
      body.append("editorialLabel", content.editorial.label);
      body.append("existingEditorialImage", content.editorial.image || "");
      if (editorialFile) body.append("editorialImage", editorialFile);

      body.append("featuredTitle", content.featured.title);

      const res = await fetch("/api/homepage", { method: "PUT", body });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Unable to save homepage changes.");
        setSaving(false);
        return;
      }

      setContent(data.content || content);
      setHeroFile(null);
      setEditorialFile(null);
      setLookbookFiles([]);
      setMessage("Homepage updated successfully.");
    } catch {
      setMessage("Network error. Please try again.");
    }

    setSaving(false);
  };

  if (loading) return <p className="text-xs text-text-secondary animate-pulse">Loading homepage editor...</p>;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-wide">Home Page</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage the hero image, editorial blocks, story text, and homepage visuals.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {message && (
          <div className="border border-border rounded px-4 py-3 text-xs text-text-secondary">
            {message}
          </div>
        )}

        <section className="bg-bg-card border border-border rounded p-5 space-y-4">
          <h2 className="text-sm font-semibold">Hero</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <input
                type="text"
                value={content.hero.eyebrow}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, eyebrow: e.target.value } })}
                placeholder="Eyebrow"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              />
              <input
                type="text"
                value={content.hero.title}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, title: e.target.value } })}
                placeholder="Title"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              />
              <textarea
                value={content.hero.subtitle}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, subtitle: e.target.value } })}
                placeholder="Subtitle"
                rows={4}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm resize-none"
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setHeroFile(e.target.files?.[0] || null)}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm file:mr-3 file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent"
              />
            </div>
            <div className="aspect-[4/5] border border-border bg-bg-secondary overflow-hidden rounded">
              {heroPreview ? (
                <img src={heroPreview} alt="Hero preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-text-secondary uppercase tracking-wider">
                  Hero preview
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-bg-card border border-border rounded p-5 space-y-4">
          <h2 className="text-sm font-semibold">Brand Story</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={content.brandStory.eyebrow}
              onChange={(e) => setContent({ ...content, brandStory: { ...content.brandStory, eyebrow: e.target.value } })}
              placeholder="Section eyebrow"
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
            />
            <input
              type="text"
              value={content.brandStory.title}
              onChange={(e) => setContent({ ...content, brandStory: { ...content.brandStory, title: e.target.value } })}
              placeholder="Section title"
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
            />
            <textarea
              value={content.brandStory.paragraphOne}
              onChange={(e) => setContent({ ...content, brandStory: { ...content.brandStory, paragraphOne: e.target.value } })}
              placeholder="First paragraph"
              rows={4}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm resize-none"
            />
            <textarea
              value={content.brandStory.paragraphTwo}
              onChange={(e) => setContent({ ...content, brandStory: { ...content.brandStory, paragraphTwo: e.target.value } })}
              placeholder="Second paragraph"
              rows={4}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm resize-none"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {content.brandStory.stats.map((stat, index) => (
                <div key={index} className="space-y-2">
                  <input
                    type="text"
                    value={stat.value}
                    onChange={(e) => updateStat(index, "value", e.target.value)}
                    placeholder="Value"
                    className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                  />
                  <input
                    type="text"
                    value={stat.label}
                    onChange={(e) => updateStat(index, "label", e.target.value)}
                    placeholder="Label"
                    className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-bg-card border border-border rounded p-5 space-y-4">
          <h2 className="text-sm font-semibold">Lookbook</h2>
          <input
            type="text"
            value={content.lookbook.caption}
            onChange={(e) => setContent({ ...content, lookbook: { ...content.lookbook, caption: e.target.value } })}
            placeholder="Lookbook caption"
            className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
          />
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleLookbookFilesSelect(e.target.files)}
            className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm file:mr-3 file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent"
          />
          <div className="grid grid-cols-3 gap-3">
            {lookbookPreview.length > 0 ? (
              lookbookPreview.map((image, index) => (
                <div key={`${image}-${index}`} className="space-y-2">
                  <div className="relative aspect-[3/4] border border-border overflow-hidden rounded">
                    <img src={image} alt={`Lookbook ${index + 1}`} className="w-full h-full object-cover" />
                    {index < content.lookbook.images.length && (
                      <button
                        type="button"
                        onClick={() => removeLookbookImage(index)}
                        className="absolute top-2 right-2 bg-background/90 px-2 py-1 text-[10px] uppercase tracking-wider cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <select
                    value={content.lookbook.categorySlugs[index] || ""}
                    onChange={(e) => updateLookbookCategory(index, e.target.value)}
                    className="w-full bg-bg-secondary border border-border px-3 py-2 text-xs"
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category._id} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))
            ) : (
              <div className="col-span-3 border border-dashed border-border rounded p-6 text-center text-xs text-text-secondary">
                No lookbook images yet.
              </div>
            )}
          </div>
        </section>

        <section className="bg-bg-card border border-border rounded p-5 space-y-4">
          <h2 className="text-sm font-semibold">Editorial + Featured</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <input
                type="text"
                value={content.editorial.eyebrow}
                onChange={(e) => setContent({ ...content, editorial: { ...content.editorial, eyebrow: e.target.value } })}
                placeholder="Editorial eyebrow"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              />
              <input
                type="text"
                value={content.editorial.label}
                onChange={(e) => setContent({ ...content, editorial: { ...content.editorial, label: e.target.value } })}
                placeholder="Editorial label"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              />
              <input
                type="text"
                value={content.featured.title}
                onChange={(e) => setContent({ ...content, featured: { ...content.featured, title: e.target.value } })}
                placeholder="Featured products title"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setEditorialFile(e.target.files?.[0] || null)}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm file:mr-3 file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent"
              />
            </div>
            <div className="aspect-[16/10] border border-border bg-bg-secondary overflow-hidden rounded">
              {editorialPreview ? (
                <img src={editorialPreview} alt="Editorial preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-text-secondary uppercase tracking-wider">
                  Editorial preview
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-bg-primary px-8 py-3 text-xs font-semibold tracking-wide uppercase hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Save Home Page"}
          </button>
        </div>
      </form>
    </div>
  );
}
