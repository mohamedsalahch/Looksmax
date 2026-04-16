"use client";

import { useEffect, useMemo, useState } from "react";
import AuditMetaCard from "@/components/AuditMetaCard";
import { withAuthRequest } from "@/lib/authClient";

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
  createdAt?: string;
  updatedAt?: string;
  createdBy?: { id: string; name: string; email: string } | null;
  updatedBy?: { id: string; name: string; email: string } | null;
  hero: { image: string; eyebrow: string; title: string; subtitle: string; link: string };
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
  hero: { image: "", eyebrow: "", title: "", subtitle: "", link: "" },
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

function normalizeHomePageContent(nextContent?: Partial<HomePageContent> | null): HomePageContent {
  const brandStats = nextContent?.brandStory?.stats ?? [];
  return {
    ...emptyContent,
    ...(nextContent || {}),
    hero: {
      ...emptyContent.hero,
      ...(nextContent?.hero || {}),
      link: nextContent?.hero?.link || "",
    },
    brandStory: {
      ...emptyContent.brandStory,
      ...(nextContent?.brandStory || {}),
      stats: brandStats.length > 0 ? brandStats : emptyContent.brandStory.stats,
    },
    lookbook: {
      ...emptyContent.lookbook,
      ...(nextContent?.lookbook || {}),
      images: (nextContent?.lookbook?.images || []).filter((image) => Boolean(String(image).trim())),
      categorySlugs: (nextContent?.lookbook?.categorySlugs || []).slice(
        0,
        (nextContent?.lookbook?.images || []).filter((image) => Boolean(String(image).trim())).length
      ),
    },
    editorial: {
      ...emptyContent.editorial,
      ...(nextContent?.editorial || {}),
    },
    featured: {
      ...emptyContent.featured,
      ...(nextContent?.featured || {}),
    },
  };
}

function getCategoryPathLabel(categories: CategoryOption[], category: CategoryOption) {
  const segments = [category.name];
  let currentParentSlug = category.parentSlug;

  while (currentParentSlug) {
    const parent = categories.find((entry) => entry.slug === currentParentSlug);
    if (!parent) break;
    segments.unshift(parent.name);
    currentParentSlug = parent.parentSlug || null;
  }

  return segments.join(" / ");
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">
      {children}
    </label>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-text-secondary">
        {eyebrow}
      </p>
      <div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
      </div>
    </div>
  );
}

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
    fetch("/api/homepage", withAuthRequest())
      .then((r) => r.json())
      .then((data) => {
        if (data.content) {
          setContent(normalizeHomePageContent(data.content));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/categories", withAuthRequest())
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
  const lookbookCount = lookbookPreview.length;
  const messageTone = message.toLowerCase().includes("success")
    ? "border-[#d8c9b8] bg-[#f1ede8] text-[#6b6055]"
    : "border-[#e2c9c4] bg-[#faf3f2] text-[#8a5f57]";

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
      body.append("heroLink", content.hero.link);
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

      const res = await fetch("/api/homepage", withAuthRequest({ method: "PUT", body }));
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Unable to save homepage changes.");
        setSaving(false);
        return;
      }

      setContent(normalizeHomePageContent(data.content || content));
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
    <div className="max-w-6xl space-y-6">
      <div className="border border-border bg-gradient-to-br from-bg-card via-bg-card to-bg-secondary/60 p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-secondary">
              Homepage Editor
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
              Shape the storefront without the clutter
            </h1>
            <p className="text-sm leading-6 text-text-secondary">
              Keep the homepage polished from one place: hero, brand story, lookbook, editorial,
              and featured section.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="border border-border bg-bg-primary/65 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">Lookbook</p>
              <p className="mt-2 text-xl font-semibold text-text-primary">{lookbookCount}</p>
            </div>
            <div className="border border-border bg-bg-primary/65 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">Hero</p>
              <p className="mt-2 text-xl font-semibold text-text-primary">
                {heroPreview ? "Ready" : "Empty"}
              </p>
            </div>
            <div className="border border-border bg-bg-primary/65 px-4 py-3 sm:col-span-1 col-span-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">Editorial</p>
              <p className="mt-2 text-xl font-semibold text-text-primary">
                {editorialPreview ? "Ready" : "Empty"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <AuditMetaCard
        createdAt={content.createdAt}
        updatedAt={content.updatedAt}
        createdBy={content.createdBy}
        updatedBy={content.updatedBy}
        title="Content Traceability"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {message && (
          <div className={`border px-4 py-3 text-sm ${messageTone}`}>
            {message}
          </div>
        )}

        <section className="border border-border bg-bg-card p-6 shadow-sm shadow-black/5 space-y-5">
          <SectionHeader
            eyebrow="01"
            title="Hero"
            description="The first impression. Keep the copy short and let the image carry the mood."
          />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Eyebrow</FieldLabel>
              <input
                type="text"
                value={content.hero.eyebrow}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, eyebrow: e.target.value } })}
                placeholder="Eyebrow"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
              />
              </div>
              <div className="space-y-2">
                <FieldLabel>Title</FieldLabel>
              <input
                type="text"
                value={content.hero.title}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, title: e.target.value } })}
                placeholder="Title"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
              />
              </div>
              <div className="space-y-2">
                <FieldLabel>Subtitle</FieldLabel>
              <textarea
                value={content.hero.subtitle}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, subtitle: e.target.value } })}
                placeholder="Subtitle"
                rows={4}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm resize-none transition-colors focus:border-accent"
              />
              </div>
              <div className="space-y-2">
                <FieldLabel>Hero link</FieldLabel>
              <input
                type="text"
                value={content.hero.link}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, link: e.target.value } })}
                placeholder="/category/all"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
              />
              </div>
              <div className="space-y-2">
                <FieldLabel>Hero image</FieldLabel>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setHeroFile(e.target.files?.[0] || null)}
                className="w-full border border-dashed border-border bg-bg-secondary px-4 py-3 text-sm file:mr-3 file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent"
              />
              </div>
            </div>
            <div className="overflow-hidden border border-border bg-bg-secondary">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-text-primary">Live preview</p>
                  <p className="text-[11px] text-text-secondary">Hero crop reference</p>
                </div>
              </div>
              <div className="aspect-[4/5] overflow-hidden">
              {heroPreview ? (
                <img src={heroPreview} alt="Hero preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-text-secondary uppercase tracking-wider">
                  Hero preview
                </div>
              )}
            </div>
            </div>
          </div>
        </section>

        <section className="border border-border bg-bg-card p-6 shadow-sm shadow-black/5 space-y-5">
          <SectionHeader
            eyebrow="02"
            title="Brand Story"
            description="Refine the narrative and supporting metrics without making the page feel crowded."
          />
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>Section eyebrow</FieldLabel>
            <input
              type="text"
              value={content.brandStory.eyebrow}
              onChange={(e) => setContent({ ...content, brandStory: { ...content.brandStory, eyebrow: e.target.value } })}
              placeholder="Section eyebrow"
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
            />
            </div>
            <div className="space-y-2">
              <FieldLabel>Section title</FieldLabel>
            <input
              type="text"
              value={content.brandStory.title}
              onChange={(e) => setContent({ ...content, brandStory: { ...content.brandStory, title: e.target.value } })}
              placeholder="Section title"
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
            />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Paragraph one</FieldLabel>
            <textarea
              value={content.brandStory.paragraphOne}
              onChange={(e) => setContent({ ...content, brandStory: { ...content.brandStory, paragraphOne: e.target.value } })}
              placeholder="First paragraph"
              rows={4}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm resize-none transition-colors focus:border-accent"
            />
              </div>
              <div className="space-y-2">
                <FieldLabel>Paragraph two</FieldLabel>
            <textarea
              value={content.brandStory.paragraphTwo}
              onChange={(e) => setContent({ ...content, brandStory: { ...content.brandStory, paragraphTwo: e.target.value } })}
              placeholder="Second paragraph"
              rows={4}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm resize-none transition-colors focus:border-accent"
            />
              </div>
            </div>
            <div className="border border-border bg-bg-secondary/40 p-4">
              <div className="mb-3">
                <p className="text-sm font-medium text-text-primary">Brand stats</p>
                <p className="text-xs text-text-secondary">Three short proof points shown on the homepage.</p>
              </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {content.brandStory.stats.map((stat, index) => (
                <div key={index} className="space-y-2 border border-border bg-bg-card p-3">
                  <FieldLabel>Value</FieldLabel>
                  <input
                    type="text"
                    value={stat.value}
                    onChange={(e) => updateStat(index, "value", e.target.value)}
                    placeholder="Value"
                    className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
                  />
                  <FieldLabel>Label</FieldLabel>
                  <input
                    type="text"
                    value={stat.label}
                    onChange={(e) => updateStat(index, "label", e.target.value)}
                    placeholder="Label"
                    className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
                  />
                </div>
              ))}
            </div>
            </div>
          </div>
        </section>

        <section className="border border-border bg-bg-card p-6 shadow-sm shadow-black/5 space-y-5">
          <SectionHeader
            eyebrow="03"
            title="Lookbook"
            description="Pair each visual with the right category so the homepage story stays organized."
          />
          <div className="space-y-2">
            <FieldLabel>Lookbook caption</FieldLabel>
          <input
            type="text"
            value={content.lookbook.caption}
            onChange={(e) => setContent({ ...content, lookbook: { ...content.lookbook, caption: e.target.value } })}
            placeholder="Lookbook caption"
            className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
          />
          </div>
          <div className="space-y-2">
            <FieldLabel>Lookbook images</FieldLabel>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleLookbookFilesSelect(e.target.files)}
            className="w-full border border-dashed border-border bg-bg-secondary px-4 py-3 text-sm file:mr-3 file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent"
          />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {lookbookPreview.length > 0 ? (
              lookbookPreview.map((image, index) => (
                <div key={`${image}-${index}`} className="overflow-hidden border border-border bg-bg-secondary/35">
                  <div className="relative aspect-[3/4] overflow-hidden">
                    <img src={image} alt={`Lookbook ${index + 1}`} className="w-full h-full object-cover" />
                    {index < content.lookbook.images.length && (
                      <button
                        type="button"
                        onClick={() => removeLookbookImage(index)}
                        className="absolute top-3 right-3 border border-border bg-bg-card/90 px-3 py-1 text-[10px] uppercase tracking-wider cursor-pointer backdrop-blur"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <FieldLabel>Linked category</FieldLabel>
                  <select
                    value={content.lookbook.categorySlugs[index] || ""}
                    onChange={(e) => updateLookbookCategory(index, e.target.value)}
                    className="w-full bg-bg-card border border-border px-3 py-2.5 text-xs transition-colors focus:border-accent"
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category._id} value={category.slug}>
                        {getCategoryPathLabel(categories, category)}
                      </option>
                    ))}
                  </select>
                  </div>
                </div>
              ))
            ) : (
              <div className="md:col-span-2 xl:col-span-3 border border-dashed border-border p-8 text-center text-sm text-text-secondary">
                No lookbook images yet.
              </div>
            )}
          </div>
        </section>

        <section className="border border-border bg-bg-card p-6 shadow-sm shadow-black/5 space-y-5">
          <SectionHeader
            eyebrow="04"
            title="Editorial + Featured"
            description="Finish the page with one strong editorial image and a simple featured heading."
          />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Editorial eyebrow</FieldLabel>
              <input
                type="text"
                value={content.editorial.eyebrow}
                onChange={(e) => setContent({ ...content, editorial: { ...content.editorial, eyebrow: e.target.value } })}
                placeholder="Editorial eyebrow"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
              />
              </div>
              <div className="space-y-2">
                <FieldLabel>Editorial label</FieldLabel>
              <input
                type="text"
                value={content.editorial.label}
                onChange={(e) => setContent({ ...content, editorial: { ...content.editorial, label: e.target.value } })}
                placeholder="Editorial label"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
              />
              </div>
              <div className="space-y-2">
                <FieldLabel>Featured title</FieldLabel>
              <input
                type="text"
                value={content.featured.title}
                onChange={(e) => setContent({ ...content, featured: { ...content.featured, title: e.target.value } })}
                placeholder="Featured products title"
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm transition-colors focus:border-accent"
              />
              </div>
              <div className="space-y-2">
                <FieldLabel>Editorial image</FieldLabel>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setEditorialFile(e.target.files?.[0] || null)}
                className="w-full border border-dashed border-border bg-bg-secondary px-4 py-3 text-sm file:mr-3 file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent"
              />
              </div>
            </div>
            <div className="overflow-hidden border border-border bg-bg-secondary">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-text-primary">Editorial preview</p>
                  <p className="text-[11px] text-text-secondary">Wide crop reference</p>
                </div>
              </div>
              <div className="aspect-[16/10] overflow-hidden">
              {editorialPreview ? (
                <img src={editorialPreview} alt="Editorial preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-text-secondary uppercase tracking-wider">
                  Editorial preview
                </div>
              )}
            </div>
            </div>
          </div>
        </section>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="border border-border bg-accent text-bg-primary px-8 py-3 text-xs font-semibold tracking-[0.18em] uppercase shadow-lg shadow-accent/20 hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Save Home Page"}
          </button>
        </div>
      </form>
    </div>
  );
}
