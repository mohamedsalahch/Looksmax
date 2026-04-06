"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getConditionStatusFromScore } from "@/lib/productCondition";

interface Category {
  _id: string;
  name: string;
  slug: string;
  parentSlug?: string | null;
}

interface ProductImage {
  id: string;
  url: string;
  file: File | null;
}

interface GenerationSlot {
  file: File | null;
  previewUrl: string;
}

interface ModelAsset {
  _id: string;
  name: string;
  images: string[];
  frontImage: string;
  backImage: string;
}

interface GeneratedImageAsset {
  _id: string;
  prompt: string;
  images: string[];
}

type ProductType = "fashion" | "perfume";
type FashionSubtype = "clothes" | "shoes";
type OriginPictureKey = "front" | "back" | "left" | "right";
type GenerationInputs = {
  front: GenerationSlot;
  back: GenerationSlot;
  left: GenerationSlot;
  right: GenerationSlot;
};
type OriginPictures = Record<OriginPictureKey, string>;
type OriginPictureFiles = Record<OriginPictureKey, File | null>;

const initialForm = {
  name: "",
  price: "",
  description: "",
  brand: "LOOKSMAX",
  stock: "1",
  tag: "",
  sizes: "S,M,L,XL",
  colors: "",
  conditionScore: "7",
  productType: "fashion" as ProductType,
  fashionSubtype: "clothes" as FashionSubtype,
  originPictures: {
    front: "",
    back: "",
    left: "",
    right: "",
  } as OriginPictures,
  cloneSourceName: "",
  cloneSourceImage: "",
};

const createEmptySlot = (): GenerationSlot => ({ file: null, previewUrl: "" });

const initialGenerationInputs: GenerationInputs = {
  front: createEmptySlot(),
  back: createEmptySlot(),
  left: createEmptySlot(),
  right: createEmptySlot(),
};

const emptyOriginPictureFiles: OriginPictureFiles = {
  front: null,
  back: null,
  left: null,
  right: null,
};

function getChildren(categories: Category[], parentSlug: string) {
  return categories.filter((category) => category.parentSlug === parentSlug);
}

async function base64ToFile(base64: string, index: number) {
  const dataUrl = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  const blob = await fetch(dataUrl).then((response) => response.blob());
  return new File([blob], `generated-${Date.now()}-${index}.png`, {
    type: blob.type || "image/png",
  });
}

async function productImageToFile(image: ProductImage, label: keyof GenerationInputs) {
  if (image.file) return image.file;

  const blob = await fetch(image.url).then((response) => response.blob());
  const extension = blob.type.split("/")[1] || "png";
  return new File([blob], `${label}-${Date.now()}.${extension}`, {
    type: blob.type || "image/png",
  });
}

export default function NewProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [models, setModels] = useState<ModelAsset[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageAsset[]>([]);
  const [form, setForm] = useState(initialForm);
  const [selectedParentSlug, setSelectedParentSlug] = useState("");
  const [selectedChildSlug, setSelectedChildSlug] = useState("");
  const [selectedGrandchildSlug, setSelectedGrandchildSlug] = useState("");
  const [images, setImages] = useState<ProductImage[]>([]);
  const [originPictureFiles, setOriginPictureFiles] =
    useState<OriginPictureFiles>(emptyOriginPictureFiles);
  const [cloneSourceImageFile, setCloneSourceImageFile] = useState<File | null>(null);
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [generationInputs, setGenerationInputs] = useState<GenerationInputs>(initialGenerationInputs);
  const [importingGeneratedImage, setImportingGeneratedImage] = useState<string | null>(null);
  const [isGeneratedImagesOpen, setIsGeneratedImagesOpen] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        const cats = d.categories || [];
        setCategories(cats);
        const firstParent = cats.find((category: Category) => !category.parentSlug);
        if (firstParent) setSelectedParentSlug(firstParent.slug);
      });

    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => setModels(d.models || []));

    fetch("/api/generated-images")
      .then((r) => r.json())
      .then((d) => setGeneratedImages(d.generatedImages || []));
  }, []);

  const parentCategories = useMemo(
    () => categories.filter((category) => !category.parentSlug),
    [categories]
  );
  const childCategories = useMemo(
    () => getChildren(categories, selectedParentSlug),
    [categories, selectedParentSlug]
  );
  const grandchildCategories = useMemo(
    () => getChildren(categories, selectedChildSlug),
    [categories, selectedChildSlug]
  );
  const selectedModel = models.find((model) => model._id === selectedModelId);

  const handleImageSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newImages = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
    }));

    setImages((current) => [...current, ...newImages]);
  };

  const moveImage = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;

    setImages((current) => {
      const next = [...current];
      const draggedIndex = next.findIndex((image) => image.id === draggedId);
      const targetIndex = next.findIndex((image) => image.id === targetId);

      if (draggedIndex === -1 || targetIndex === -1) return current;

      const [draggedImage] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedImage);
      return next;
    });
  };

  const removeImage = (id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
  };

  const handleCloneSourceImageSelect = (file: File | null) => {
    setCloneSourceImageFile(file);
    setForm((current) => ({
      ...current,
      cloneSourceImage: file ? URL.createObjectURL(file) : "",
    }));
  };

  const handleOriginPictureSelect = (key: OriginPictureKey, file: File | null) => {
    setOriginPictureFiles((current) => ({
      ...current,
      [key]: file,
    }));
    setForm((current) => ({
      ...current,
      originPictures: {
        ...current.originPictures,
        [key]: file ? URL.createObjectURL(file) : "",
      },
    }));
  };

  const importGeneratedImage = async (imageUrl: string) => {
    try {
      setImportingGeneratedImage(imageUrl);
      const blob = await fetch(imageUrl).then((response) => response.blob());
      const extension = blob.type.split("/")[1] || "png";
      const file = new File([blob], `generated-import-${Date.now()}.${extension}`, {
        type: blob.type || "image/png",
      });

      setImages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(file),
        },
      ]);
    } catch {
      setError("Unable to import generated image.");
    } finally {
      setImportingGeneratedImage(null);
    }
  };

  const handleGenerationInput = (key: keyof GenerationInputs, file: File | null) => {
    setGenerationInputs((current) => ({
      ...current,
      [key]: file ? { file, previewUrl: URL.createObjectURL(file) } : createEmptySlot(),
    }));
  };

  const clearGenerationInput = (key: keyof GenerationInputs) => {
    setGenerationInputs((current) => ({
      ...current,
      [key]: createEmptySlot(),
    }));
  };

  const assignProductImageToGenerationSlot = async (key: keyof GenerationInputs, imageId: string) => {
    const image = images.find((entry) => entry.id === imageId);
    if (!image) return;

    try {
      const file = await productImageToFile(image, key);
      setGenerationInputs((current) => ({
        ...current,
        [key]: { file, previewUrl: image.url },
      }));
    } catch {
      setError(`Unable to use this image for the ${key} slot.`);
    }
  };

  const handleGenerationDrop = async (key: keyof GenerationInputs, imageId: string) => {
    await assignProductImageToGenerationSlot(key, imageId);
    setDraggedImageId(null);
  };

  const generationSlotsForSubtype =
    form.fashionSubtype === "shoes"
      ? (["front", "back", "left", "right"] as Array<keyof GenerationInputs>)
      : (["front", "back"] as Array<keyof GenerationInputs>);
  const originPictureKeys =
    form.fashionSubtype === "shoes"
      ? (["front", "back", "left", "right"] as OriginPictureKey[])
      : (["front", "back"] as OriginPictureKey[]);

  const handleGenerate = async () => {
    setError("");

    if (form.fashionSubtype === "clothes" && !selectedModelId) {
      setError("Please select a model first.");
      return;
    }

    if (
      !generationInputs.front.file ||
      !generationInputs.back.file ||
      (form.fashionSubtype === "shoes" && (!generationInputs.left.file || !generationInputs.right.file))
    ) {
      setError(
        form.fashionSubtype === "shoes"
          ? "Please upload front, back, left, and right product images before generating."
          : "Please upload front and back product images before generating."
      );
      return;
    }

    try {
      setGenerating(true);
      const body = new FormData();
      body.append("modelId", selectedModelId);
      body.append("type", form.productType);
      body.append("fashionSubtype", form.fashionSubtype);
      body.append("front", generationInputs.front.file);
      body.append("back", generationInputs.back.file);
      if (generationInputs.left.file) body.append("left", generationInputs.left.file);
      if (generationInputs.right.file) body.append("right", generationInputs.right.file);

      // 1. Trigger the job
      const triggerRes = await fetch("/api/products/generate", {
        method: "POST",
        body,
      });
      const triggerData = await triggerRes.json();

      if (!triggerRes.ok) {
        setError(triggerData.error || "Unable to start generation.");
        setGenerating(false);
        return;
      }

      const jobId = triggerData.job_id;

      // 2. Poll for status
      let isCompleted = false;
      let finalImages: any = null;

      while (!isCompleted) {
        // Wait 5 seconds
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const statusRes = await fetch(`/api/products/generate?job_id=${jobId}`);
        const statusData = await statusRes.json();

        if (statusData.status === "completed") {
          isCompleted = true;
          finalImages = statusData.images;
        } else if (statusData.status === "failed") {
          setError(statusData.error || "Generation failed.");
          setGenerating(false);
          return;
        }
      }

      // 3. Process completed images
      const viewList = form.fashionSubtype === "shoes" 
        ? ["front", "back", "left", "right"] 
        : ["front", "back"];
      
      const generatedImages = await Promise.all(
        viewList.map(async (view, index) => {
          const base64 = finalImages[view];
          if (!base64) return null;
          const file = await base64ToFile(base64, index);
          return {
            id: crypto.randomUUID(),
            file,
            url: URL.createObjectURL(file),
          };
        })
      );

      setImages((current) => [...current, ...generatedImages.filter((img): img is any => !!img)]);
    } catch {
      setError("Generation request failed.");
    }

    setGenerating(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!selectedParentSlug) {
      setError("Please select a product category.");
      setLoading(false);
      return;
    }

    const validImages = images.filter((img) => img.file);
    if (validImages.length === 0) {
      setError("Please upload at least one product image.");
      setLoading(false);
      return;
    }

    if (form.productType === "perfume" && !form.cloneSourceName.trim()) {
      setError("Please provide the original fragrance name this perfume is cloning.");
      setLoading(false);
      return;
    }

    try {
      const productCategories = [
        selectedParentSlug,
        selectedChildSlug,
        selectedGrandchildSlug,
      ].filter(Boolean);

      const body = new FormData();
      body.append("name", form.name);
      body.append("price", form.price);
      body.append("brand", form.brand);
      body.append("description", form.description);
      body.append("tag", form.tag);
      body.append("productType", form.productType);
      body.append("fashionSubtype", form.fashionSubtype);
      body.append("stock", form.productType === "perfume" ? form.stock : "1");
      body.append("conditionScore", form.conditionScore);
      body.append("originPictureFront", form.originPictures.front);
      body.append("originPictureBack", form.originPictures.back);
      body.append("originPictureLeft", form.originPictures.left);
      body.append("originPictureRight", form.originPictures.right);
      if (originPictureFiles.front) body.append("originPictureFrontFile", originPictureFiles.front);
      if (originPictureFiles.back) body.append("originPictureBackFile", originPictureFiles.back);
      if (originPictureFiles.left) body.append("originPictureLeftFile", originPictureFiles.left);
      if (originPictureFiles.right) body.append("originPictureRightFile", originPictureFiles.right);
      body.append("cloneSourceName", form.cloneSourceName);
      body.append("cloneSourceImage", form.cloneSourceImage);
      if (cloneSourceImageFile) body.append("cloneSourceImageFile", cloneSourceImageFile);
      body.append("categories", JSON.stringify(productCategories));
      body.append(
        "sizes",
        JSON.stringify(
          form.productType === "perfume"
            ? []
            : form.sizes
                .split(",")
                .map((size) => size.trim())
                .filter(Boolean)
        )
      );
      body.append(
        "colors",
        JSON.stringify(
          form.productType === "perfume"
            ? []
            : form.colors
                .split(",")
                .map((color) => color.trim())
                .filter(Boolean)
        )
      );
      body.append("mainImageIndex", "0");
      validImages.forEach((image) => {
        if (image.file) body.append("images", image.file);
      });

      const res = await fetch("/api/products", {
        method: "POST",
        body,
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Unable to create product.");
        setLoading(false);
        return;
      }

      router.push("/dashboard/products");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-wide mb-6">Add New Product</h1>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger text-xs px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Product Name
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Product Type
            </label>
            <select
              value={form.productType}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  productType: e.target.value as ProductType,
                  stock: e.target.value === "perfume" ? current.stock : "1",
                }))
              }
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm focus:border-accent transition-colors"
            >
              <option value="fashion">Fashion (Clothes & Shoes)</option>
              <option value="perfume">Perfume</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Brand
            </label>
            <input
              type="text"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Price (TND)
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm focus:border-accent transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
            Stock
          </label>
          <input
            type="number"
            min="0"
            value={form.productType === "perfume" ? form.stock : "1"}
            readOnly={form.productType !== "perfume"}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            className={`w-full border px-4 py-3 text-sm ${
              form.productType === "perfume"
                ? "bg-bg-secondary border-border focus:border-accent transition-colors"
                : "bg-bg-hover border-border text-text-secondary cursor-not-allowed"
            }`}
          />
          <p className="mt-1 text-[10px] text-text-secondary">
            {form.productType === "perfume"
              ? "Perfumes use normal stock quantity."
              : "Fashion products stay unique with stock = 1."}
          </p>
        </div>

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
            Categories
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select
              value={selectedParentSlug}
              onChange={(e) => {
                setSelectedParentSlug(e.target.value);
                setSelectedChildSlug("");
                setSelectedGrandchildSlug("");
              }}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
            >
              <option value="">Select category</option>
              {parentCategories.map((category) => (
                <option key={category._id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              value={selectedChildSlug}
              onChange={(e) => {
                setSelectedChildSlug(e.target.value);
                setSelectedGrandchildSlug("");
              }}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              disabled={childCategories.length === 0}
            >
              <option value="">No subcategory</option>
              {childCategories.map((category) => (
                <option key={category._id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              value={selectedGrandchildSlug}
              onChange={(e) => setSelectedGrandchildSlug(e.target.value)}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              disabled={grandchildCategories.length === 0}
            >
              <option value="">No sub-subcategory</option>
              {grandchildCategories.map((category) => (
                <option key={category._id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.productType === "perfume" ? (
          <section className="space-y-4">
            <input
              type="text"
              value={form.cloneSourceName}
              onChange={(e) => setForm({ ...form, cloneSourceName: e.target.value })}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              placeholder="Original fragrance name"
            />
            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Import Original Fragrance Image
                </h3>
                <p className="mt-1 text-[11px] text-text-secondary">
                  Upload or import the image of the fragrance this perfume is cloning.
                </p>
              </div>
              <input
                id="clone-source-image-upload"
                type="file"
                accept="image/*"
                onChange={(e) => handleCloneSourceImageSelect(e.target.files?.[0] || null)}
                className="hidden"
              />
              <div
                onClick={() => document.getElementById("clone-source-image-upload")?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleCloneSourceImageSelect(e.dataTransfer.files?.[0] || null);
                }}
                className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-border bg-bg-secondary px-4 py-6 text-center transition-colors hover:border-accent hover:bg-bg-hover"
              >
                <span className="text-sm font-medium text-text-primary">Drag or click to import original fragrance image</span>
                <span className="text-[10px] uppercase tracking-wider text-text-secondary">
                  One reference image
                </span>
              </div>
              {form.cloneSourceImage && (
                <div className="max-w-xs space-y-2">
                  <div className="aspect-[4/5] overflow-hidden rounded border border-border bg-bg-hover p-3">
                    <img
                      src={form.cloneSourceImage}
                      alt={form.cloneSourceName || "Original fragrance"}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCloneSourceImageSelect(null)}
                    className="text-[10px] text-danger uppercase tracking-wider"
                  >
                    Remove image
                  </button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <>
            <select
              value={form.fashionSubtype}
              onChange={(e) => setForm({ ...form, fashionSubtype: e.target.value as FashionSubtype })}
              className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
            >
              <option value="clothes">Clothes</option>
              <option value="shoes">Shoes</option>
            </select>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                value={form.sizes}
                onChange={(e) => setForm({ ...form, sizes: e.target.value })}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                placeholder="Sizes: S,M,L,XL or 40,41,42"
              />
              <input
                type="text"
                value={form.colors}
                onChange={(e) => setForm({ ...form, colors: e.target.value })}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                placeholder="Colors: Black, White, Olive"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-4 mb-2">
                <label className="block text-xs text-text-secondary uppercase tracking-wider">
                  Condition
                </label>
                <span className="text-xs text-text-primary uppercase tracking-wider font-medium">
                  {form.conditionScore}/10 · {getConditionStatusFromScore(Number(form.conditionScore || 0))}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={form.conditionScore}
                onChange={(e) => setForm({ ...form, conditionScore: e.target.value })}
                className="w-full accent-accent cursor-pointer"
              />
            </div>
          </>
        )}

        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4}
          className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm resize-none"
          placeholder="Description"
        />

        <div className="space-y-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Origin Pictures
            </h3>
            <p className="mt-1 text-[11px] text-text-secondary">
              Clothes use front and back. Shoes use front, back, left, and right.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {originPictureKeys.map((key) => {
              const preview = form.originPictures[key];
              const inputId = `origin-picture-${key}-upload`;
              return (
                <div key={key} className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">
                    {key}
                  </p>
                  <input
                    id={inputId}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleOriginPictureSelect(key, e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <div
                    onClick={() => document.getElementById(inputId)?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleOriginPictureSelect(key, e.dataTransfer.files?.[0] || null);
                    }}
                    className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-border bg-bg-secondary px-4 py-6 text-center transition-colors hover:border-accent hover:bg-bg-hover"
                  >
                    <span className="text-sm font-medium text-text-primary">
                      Drag or click to import {key} origin image
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-text-secondary">
                      {key} reference
                    </span>
                  </div>
                  {preview && (
                    <div className="space-y-2">
                      <div className="aspect-[4/5] overflow-hidden rounded border border-border bg-bg-hover p-3">
                        <img
                          src={preview}
                          alt={`${key} origin`}
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOriginPictureSelect(key, null)}
                        className="text-[10px] text-danger uppercase tracking-wider"
                      >
                        Remove image
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <input
          type="text"
          value={form.tag}
          onChange={(e) => setForm({ ...form, tag: e.target.value })}
          className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
          placeholder="Tag"
        />

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
            Product Images
          </label>
          <input
            id="product-images-upload"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleImageSelect(e.target.files)}
            className="hidden"
          />
          <div
            onClick={() => document.getElementById("product-images-upload")?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleImageSelect(e.dataTransfer.files);
            }}
            className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-border bg-bg-secondary px-4 py-6 text-center transition-colors hover:border-accent hover:bg-bg-hover"
          >
            <span className="text-sm font-medium text-text-primary">Drag or click to add product images</span>
            <span className="text-[10px] uppercase tracking-wider text-text-secondary">
              Select files or drop one or more images
            </span>
          </div>
          <p className="mt-2 text-[10px] text-text-secondary uppercase tracking-wider">
            Drag images to reorder them. The first image is the main image.
          </p>
          {images.length > 0 && (
            <div className="mt-4 space-y-3">
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggedImageId(img.id);
                    e.dataTransfer.setData("text/product-image-id", img.id);
                  }}
                  onDragEnd={() => setDraggedImageId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedImageId) moveImage(draggedImageId, img.id);
                    setDraggedImageId(null);
                  }}
                  className="flex items-center gap-3 rounded border border-border bg-bg-secondary p-3"
                >
                  <span className="w-5 text-[10px] text-text-secondary font-mono">{idx + 1}</span>
                  <img src={img.url} alt={`Preview ${idx + 1}`} className="h-20 w-20 rounded object-cover border border-border" />
                  <div className="flex-1">
                    <p className="text-xs font-medium">{idx === 0 ? "Main image" : `Image ${idx + 1}`}</p>
                    <p className="text-[10px] text-text-secondary">
                      Drag this image into a generation slot above if you want to reuse it.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="text-[10px] text-danger uppercase font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {generatedImages.length > 0 && (
          <section className="overflow-hidden rounded border border-border bg-bg-card">
            <button
              type="button"
              onClick={() => setIsGeneratedImagesOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-bg-hover"
            >
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Import Generated Images
                </h3>
                <p className="mt-1 text-[11px] text-text-secondary">
                  Import a previously generated result directly into this product.
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-text-secondary">
                {isGeneratedImagesOpen ? "Hide" : "Show"}
              </span>
            </button>
            {isGeneratedImagesOpen && (
              <div className="border-t border-border p-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {generatedImages.flatMap((asset) =>
                    asset.images.map((image, index) => (
                      <button
                        key={`${asset._id}-${index}`}
                        type="button"
                        onClick={() => importGeneratedImage(image)}
                        disabled={importingGeneratedImage === image}
                        className="group overflow-hidden rounded border border-border bg-bg-card text-left disabled:opacity-50"
                      >
                        <div className="aspect-[4/5] overflow-hidden bg-bg-secondary">
                          <img src={image} alt={`Generated ${index + 1}`} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
                        </div>
                        <div className="p-2 space-y-1">
                          <p className="line-clamp-2 text-[10px] text-text-secondary">{asset.prompt}</p>
                          <p className="text-[10px] uppercase tracking-wider text-accent">
                            {importingGeneratedImage === image ? "Importing..." : "Import"}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {form.productType === "fashion" && (
          <section className="bg-bg-card border border-border rounded p-5 space-y-5">
            <div>
              <h2 className="text-sm font-semibold">Generate Model Photos</h2>
              <p className="mt-1 text-[11px] text-text-secondary">
                Drag product images above into these slots, then generate.
                {form.fashionSubtype === "shoes"
                  ? " Shoes use front, back, left, and right with no model."
                  : " Clothes use model front/back plus product front/back."}
              </p>
            </div>

            <div
              className={`grid gap-5 items-start ${
                form.fashionSubtype === "clothes"
                  ? "grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]"
                  : "grid-cols-1"
              }`}
            >
              {form.fashionSubtype === "clothes" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 min-h-[48px]">
                    <label className="block min-w-10 text-[10px] text-text-secondary uppercase tracking-wider">
                      Model
                    </label>
                    <select
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                    >
                      <option value="">Select model</option>
                      {models.map((model) => (
                        <option key={model._id} value={model._id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider">Front</p>
                      <div className="aspect-[4/5] bg-bg-secondary overflow-hidden rounded border border-border">
                        {selectedModel ? (
                          <img src={selectedModel.frontImage || selectedModel.images?.[0] || ""} alt={`${selectedModel.name} front`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-text-secondary uppercase tracking-wider">
                            Front
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider">Back</p>
                      <div className="aspect-[4/5] bg-bg-secondary overflow-hidden rounded border border-border">
                        {selectedModel ? (
                          <img src={selectedModel.backImage || selectedModel.images?.[1] || selectedModel.frontImage || ""} alt={`${selectedModel.name} back`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-text-secondary uppercase tracking-wider">
                            Back
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
                {(
                  form.fashionSubtype === "shoes"
                    ? (["front", "back", "left", "right"] as Array<keyof GenerationInputs>)
                    : (["front", "back"] as Array<keyof GenerationInputs>)
                ).map((key) => (
                  <div key={key} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3 min-h-[48px]">
                      <label className="block min-w-10 text-[10px] text-text-secondary uppercase tracking-wider">
                        {key}
                      </label>
                      {generationInputs[key].previewUrl ? (
                        <button
                          type="button"
                          onClick={() => clearGenerationInput(key)}
                          className="text-[10px] text-danger uppercase tracking-wider"
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="text-[10px] text-text-secondary uppercase tracking-wider">
                          Drop only
                        </span>
                      )}
                    </div>
                    <div
                      className={`bg-bg-secondary overflow-hidden rounded border border-dashed border-border ${
                        form.fashionSubtype === "shoes"
                          ? "aspect-square min-h-[140px] max-h-[180px]"
                          : "aspect-[4/5]"
                      }`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const imageId = e.dataTransfer.getData("text/product-image-id");
                        if (imageId) void handleGenerationDrop(key, imageId);
                      }}
                    >
                      {generationInputs[key].previewUrl ? (
                        <img
                          src={generationInputs[key].previewUrl}
                          alt={`${key} preview`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-[10px] text-text-secondary uppercase tracking-wider">
                          <span>{key}</span>
                          <span className="text-[8px] tracking-normal normal-case text-text-secondary/80">
                            Drop from product images
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {form.productType === "fashion" && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-accent text-bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate"}
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-accent text-bg-primary px-8 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Product"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="border border-border px-6 py-3 text-xs text-text-secondary uppercase tracking-wider"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
