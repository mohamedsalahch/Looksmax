"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getConditionStatusFromScore } from "@/lib/productCondition";
import { generateId } from "@/lib/uuid";

interface Category {
  _id: string;
  name: string;
  slug: string;
  parentSlug?: string | null;
}

interface ProductImage {
  id?: string;
  url: string;
  file?: File | null;
  existing?: boolean;
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
  name?: string;
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
  sizes: "",
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary mb-1.5">
      {children}
    </label>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-border bg-bg-card p-6 space-y-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-text-primary">{title}</h2>
        {description && <p className="mt-1 text-[11px] text-text-secondary">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function getChildren(categories: Category[], parentSlug: string) {
  return categories.filter((category) => category.parentSlug === parentSlug);
}

function getCategoryPath(categories: Category[], slugs: string[]) {
  const selected = categories.filter((category) => slugs.includes(category.slug));
  const deepest = selected.reduce<Category | null>((current, category) => {
    const depth = getDepth(categories, category);
    const currentDepth = current ? getDepth(categories, current) : -1;
    return depth > currentDepth ? category : current;
  }, null);

  if (!deepest) return { parent: "", child: "", grandchild: "" };

  const chain: string[] = [];
  let cursor: Category | undefined = deepest;

  while (cursor) {
    chain.unshift(cursor.slug);
    cursor = categories.find((category) => category.slug === cursor?.parentSlug);
  }

  return {
    parent: chain[0] || "",
    child: chain[1] || "",
    grandchild: chain[2] || "",
  };
}

function getDepth(categories: Category[], category: Category) {
  let depth = 0;
  let cursor = category;

  while (cursor.parentSlug) {
    const parent = categories.find((entry) => entry.slug === cursor.parentSlug);
    if (!parent) break;
    depth += 1;
    cursor = parent;
  }

  return depth;
}

function getCategoryPathLabel(categories: Category[], category: Category) {
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

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
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
  const [initialCategorySlugs, setInitialCategorySlugs] = useState<string[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [generationInputs, setGenerationInputs] = useState<GenerationInputs>(initialGenerationInputs);
  const [importingGeneratedImage, setImportingGeneratedImage] = useState<string | null>(null);
  const [isGeneratedImagesOpen, setIsGeneratedImagesOpen] = useState(false);
  const [generatedImagesSearch, setGeneratedImagesSearch] = useState("");
  const allowStockEditing = form.productType === "perfume" || form.fashionSubtype === "clothes";

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []));

    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => setModels(d.models || []));

    fetch("/api/generated-images")
      .then((r) => r.json())
      .then((d) => setGeneratedImages(d.generatedImages || []));

    fetch(`/api/products/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.product) return;

        const p = d.product;
        setForm({
          name: p.name,
          price: p.price.toString(),
          description: p.description || "",
          brand: p.brand || "LOOKSMAX",
          stock: String(p.stock ?? 1),
          tag: p.tag || "",
          sizes: (p.sizes || []).join(","),
          colors: (p.colors || []).join(","),
          conditionScore: String(p.conditionScore ?? 7),
          productType: p.productType === "perfume" ? "perfume" : "fashion",
          fashionSubtype: p.fashionSubtype || "clothes",
          originPictures: {
            front: p.originPictures?.front || "",
            back: p.originPictures?.back || "",
            left: p.originPictures?.left || "",
            right: p.originPictures?.right || "",
          },
          cloneSourceName: p.cloneSourceName || "",
          cloneSourceImage: p.cloneSourceImage || "",
        });
        setInitialCategorySlugs(p.categories || []);
        setImages(
          (p.images || []).map((image: ProductImage) => ({
            ...image,
            id: generateId(),
            existing: true,
            file: null,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [id]);

  useEffect(() => {
    if (categories.length === 0 || initialCategorySlugs.length === 0) return;
    const path = getCategoryPath(categories, initialCategorySlugs);
    setSelectedParentSlug(path.parent);
    setSelectedChildSlug(path.child);
    setSelectedGrandchildSlug(path.grandchild);
  }, [categories, initialCategorySlugs]);

  const selectedCategorySlug = selectedGrandchildSlug || selectedChildSlug || selectedParentSlug;
  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        slug: category.slug,
        label: getCategoryPathLabel(categories, category),
      })),
    [categories]
  );
  const selectedModel = models.find((model) => model._id === selectedModelId);
  const originPictureKeys =
    form.fashionSubtype === "shoes"
      ? (["front", "back", "left", "right"] as OriginPictureKey[])
      : (["front", "back"] as OriginPictureKey[]);

  const handleImageSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newImages = Array.from(files).map((file) => ({
      id: generateId(),
      url: URL.createObjectURL(file),
      file,
      existing: false,
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

  const removeImage = (imageId: string | undefined) => {
    setImages((current) => current.filter((image) => image.id !== imageId));
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
          id: generateId(),
          url: URL.createObjectURL(file),
          file,
          existing: false,
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
            id: generateId(),
            url: URL.createObjectURL(file),
            file,
            existing: false,
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

    if (!selectedCategorySlug) {
      setError("Please select a product category.");
      setLoading(false);
      return;
    }

    const validImages = images.filter((img) => img.url.trim() !== "");
    if (validImages.length === 0) {
      setError("Please keep or upload at least one product image.");
      setLoading(false);
      return;
    }

    if (form.productType === "perfume" && !form.cloneSourceName.trim()) {
      setError("Please provide the original fragrance name this perfume is cloning.");
      setLoading(false);
      return;
    }

    try {
      const productCategories = [selectedParentSlug, selectedChildSlug, selectedGrandchildSlug].filter(
        Boolean
      );

      const body = new FormData();
      body.append("name", form.name);
      body.append("price", form.price);
      body.append("brand", form.brand);
      body.append("description", form.description);
      body.append("tag", form.tag);
      body.append("productType", form.productType);
      body.append("fashionSubtype", form.fashionSubtype);
      body.append("stock", form.productType === "perfume" || form.fashionSubtype === "clothes" ? form.stock : "1");
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
      body.append(
        "existingImages",
        JSON.stringify(
          validImages.filter((img) => img.existing).map((img) => ({ url: img.url }))
        )
      );

      const newImages = validImages.filter((img) => !img.existing && img.file);
      body.append(
        "imageOrder",
        JSON.stringify(
          validImages.map((img) => {
            if (img.existing) return `existing:${img.url}`;
            const newIndex = newImages.findIndex((candidate) => candidate.id === img.id);
            return `new:${newIndex}`;
          })
        )
      );

      const firstImage = validImages[0];
      if (firstImage?.existing) body.append("mainImageKey", `existing:${firstImage.url}`);
      else body.append("mainImageKey", "new:0");

      newImages.forEach((img) => {
        if (img.file) body.append("images", img.file);
      });

      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        body,
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Unable to save product.");
        setLoading(false);
        return;
      }

      router.push("/dashboard/products");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  };

  if (fetching) return <p className="text-xs text-text-secondary animate-pulse">Loading product...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-wide">Edit Product</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Update the product with a wider, cleaner editing layout and keep related fields side by side.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="bg-danger/10 border border-danger/30 text-danger text-xs px-4 py-3 rounded">{error}</div>}

        <SectionCard title="Product Basics" description="Edit the main fields in one horizontal section instead of a long vertical stack.">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <FieldLabel>Product Name</FieldLabel>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                placeholder="Product name"
              />
            </div>
            <div>
              <FieldLabel>Product Type</FieldLabel>
              <select
                value={form.productType}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    productType: e.target.value as ProductType,
                  }))
                }
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              >
                <option value="fashion">Fashion (Clothes & Shoes)</option>
                <option value="perfume">Perfume</option>
              </select>
            </div>
            <div>
              <FieldLabel>Brand</FieldLabel>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                placeholder="Brand"
              />
            </div>
            <div>
              <FieldLabel>Price (TND)</FieldLabel>
              <input
                type="number"
                step="0.01"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                placeholder="Price"
              />
            </div>
            <div>
              <FieldLabel>Stock</FieldLabel>
              <input
                type="number"
                min="0"
                value={allowStockEditing ? form.stock : "1"}
                readOnly={!allowStockEditing}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className={`w-full border px-4 py-3 text-sm ${
                  allowStockEditing
                    ? "bg-bg-secondary border-border"
                    : "bg-bg-hover border-border text-text-secondary cursor-not-allowed"
                }`}
              />
            </div>
            <div className="xl:col-span-3">
              <FieldLabel>Category</FieldLabel>
              <select
                value={selectedCategorySlug}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    setSelectedParentSlug("");
                    setSelectedChildSlug("");
                    setSelectedGrandchildSlug("");
                    return;
                  }

                  const path = getCategoryPath(categories, [value]);
                  setSelectedParentSlug(path.parent);
                  setSelectedChildSlug(path.child);
                  setSelectedGrandchildSlug(path.grandchild);
                }}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              >
                <option value="">Select category</option>
                {categoryOptions.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="xl:col-span-3">
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm resize-none"
                placeholder="Description"
              />
            </div>
          </div>
        </SectionCard>

        {form.productType === "perfume" ? (
          <SectionCard title="Perfume Details" description="Keep the clone source details and visual reference together.">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div>
                  <FieldLabel>Original Fragrance Name</FieldLabel>
                  <input
                    type="text"
                    value={form.cloneSourceName}
                    onChange={(e) => setForm({ ...form, cloneSourceName: e.target.value })}
                    className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                    placeholder="Original fragrance name"
                  />
                </div>
              </div>
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
                id="clone-source-image-upload-edit"
                type="file"
                accept="image/*"
                onChange={(e) => handleCloneSourceImageSelect(e.target.files?.[0] || null)}
                className="hidden"
              />
              <div
                onClick={() => document.getElementById("clone-source-image-upload-edit")?.click()}
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
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="Fashion Details" description="Align subtype, sizes, colors, and condition in a cleaner horizontal layout.">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div>
                <FieldLabel>Subtype</FieldLabel>
                <select
                  value={form.fashionSubtype}
                  onChange={(e) => setForm({ ...form, fashionSubtype: e.target.value as FashionSubtype })}
                  className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                >
                  <option value="clothes">Clothes</option>
                  <option value="shoes">Shoes</option>
                </select>
              </div>
              <div>
                <FieldLabel>Sizes</FieldLabel>
                <input
                  type="text"
                  value={form.sizes}
                  onChange={(e) => setForm({ ...form, sizes: e.target.value })}
                  className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                  placeholder="Sizes: S,M,L,XL or 40,41,42"
                />
              </div>
              <div>
                <FieldLabel>Colors</FieldLabel>
                <input
                  type="text"
                  value={form.colors}
                  onChange={(e) => setForm({ ...form, colors: e.target.value })}
                  className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                  placeholder="Colors: Black, White, Olive"
                />
              </div>
              <div className="xl:col-span-3">
              <div className="flex items-center justify-between gap-4 mb-2">
                <FieldLabel>Condition</FieldLabel>
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
            </div>
          </SectionCard>
        )}

        {form.productType === "fashion" && (
          <SectionCard
            title="Origin Pictures"
            description="Manage the product or body reference angles in one place."
          >
            <div>
              <p className="mt-1 text-[11px] text-text-secondary">
                Clothes use front and back. Shoes use front, back, left, and right.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {originPictureKeys.map((key) => {
                const preview = form.originPictures[key];
                const inputId = `origin-picture-${key}-upload-edit`;
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
          </SectionCard>
        )}

        <SectionCard title="Product Media" description="Keep tags and gallery management together while editing.">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div>
              <FieldLabel>Tag</FieldLabel>
              <input
                type="text"
                value={form.tag}
                onChange={(e) => setForm({ ...form, tag: e.target.value })}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                placeholder="Tag"
              />
            </div>
            <div>
              <FieldLabel>Product Images</FieldLabel>
          <input
            id="product-images-upload-edit"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleImageSelect(e.target.files)}
            className="hidden"
          />
          <div
            onClick={() => document.getElementById("product-images-upload-edit")?.click()}
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
            </div>
          </div>
          {images.length > 0 && (
            <div className="mt-4 space-y-3">
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  draggable
                  onDragStart={(e) => {
                    if (!img.id) return;
                    setDraggedImageId(img.id);
                    e.dataTransfer.setData("text/product-image-id", img.id);
                  }}
                  onDragEnd={() => setDraggedImageId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedImageId && img.id) moveImage(draggedImageId, img.id);
                    setDraggedImageId(null);
                  }}
                  className="flex items-center gap-3 rounded border border-border bg-bg-secondary p-3"
                >
                  <span className="w-5 text-[10px] text-text-secondary font-mono">{idx + 1}</span>
                  <img src={img.url} alt={`Preview ${idx + 1}`} className="h-20 w-20 rounded object-cover border border-border" />
                  <div className="flex-1">
                    <p className="text-xs font-medium">{idx === 0 ? "Main image" : `Image ${idx + 1}`}</p>
                    <p className="text-[10px] text-text-secondary">{img.existing ? "Saved image" : "New upload"}</p>
                    <p className="text-[10px] text-text-secondary">
                      Drag this image into a generation slot above if you want to reuse it.
                    </p>
                  </div>
                  <button type="button" onClick={() => removeImage(img.id)} className="text-[10px] text-danger uppercase font-medium">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

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
              <div className="border-t border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={generatedImagesSearch}
                    onChange={(e) => setGeneratedImagesSearch(e.target.value)}
                    placeholder="Search by name or prompt..."
                    className="w-full max-w-xs bg-bg-secondary border border-border px-3 py-2 text-xs placeholder:text-text-secondary/50"
                  />
                  <span className="text-[10px] text-text-secondary">
                    {generatedImages.flatMap((a) => a.images).filter((image) => {
                      const search = generatedImagesSearch.toLowerCase();
                      const asset = generatedImages.find((a) => a.images.includes(image));
                      return (
                        (asset?.name || "").toLowerCase().includes(search) ||
                        (asset?.prompt || "").toLowerCase().includes(search)
                      );
                    }).length} results
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                  {generatedImages.flatMap((asset) =>
                    asset.images.map((image, index) => {
                      const search = generatedImagesSearch.toLowerCase();
                      const matches =
                        !search ||
                        (asset.name || "").toLowerCase().includes(search) ||
                        (asset.prompt || "").toLowerCase().includes(search);
                      if (!matches) return null;
                      return (
                        <button
                          key={`${asset._id}-${index}`}
                          type="button"
                          onClick={() => importGeneratedImage(image)}
                          disabled={importingGeneratedImage === image}
                          className="group overflow-hidden rounded border border-border bg-bg-card text-left disabled:opacity-50"
                        >
                          <div className="aspect-square overflow-hidden bg-bg-secondary">
                            <img src={image} alt={`Generated ${index + 1}`} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
                          </div>
                          <div className="p-1.5 space-y-0.5">
                            <p className="line-clamp-1 text-[8px] font-medium uppercase tracking-wider text-text-primary">
                              {asset.name || "Generated"}
                            </p>
                            <p className="text-[8px] uppercase tracking-wider text-accent">
                              {importingGeneratedImage === image ? "..." : "Import"}
                            </p>
                          </div>
                        </button>
                      );
                    })
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

            {form.fashionSubtype === "clothes" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 min-h-[48px]">
                  <label className="block min-w-10 text-[10px] text-text-secondary uppercase tracking-wider">
                    Model
                  </label>
                  <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="w-full max-w-xs bg-bg-secondary border border-border px-4 py-3 text-sm"
                  >
                    <option value="">Select model</option>
                    {models.map((model) => (
                      <option key={model._id} value={model._id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <p className="text-[10px] text-text-secondary uppercase tracking-wider">Front</p>
                    <div className="aspect-[3/4] max-h-[180px] bg-bg-secondary overflow-hidden rounded border border-border">
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
                    <div className="aspect-[3/4] max-h-[180px] bg-bg-secondary overflow-hidden rounded border border-border">
                      {selectedModel ? (
                        <img src={selectedModel.backImage || selectedModel.images?.[1] || selectedModel.frontImage || ""} alt={`${selectedModel.name} back`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-text-secondary uppercase tracking-wider">
                          Back
                        </div>
                      )}
                    </div>
                  </div>
                  {(["front", "back"] as Array<keyof GenerationInputs>).map((key) => (
                    <div key={key} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
                        <label className="text-[10px] text-text-secondary uppercase tracking-wider">
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
                        className="aspect-[4/5] max-h-[180px] bg-bg-secondary overflow-hidden rounded border border-dashed border-border"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const imageId = e.dataTransfer.getData("text/product-image-id");
                          if (imageId) void handleGenerationDrop(key, imageId);
                        }}
                      >
                        {generationInputs[key].previewUrl ? (
                          <img src={generationInputs[key].previewUrl} alt={`${key} preview`} className="w-full h-full object-cover" />
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
            )}

            {form.fashionSubtype === "shoes" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(["front", "back", "left", "right"] as Array<keyof GenerationInputs>).map((key) => (
                    <div key={key} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
                        <label className="text-[10px] text-text-secondary uppercase tracking-wider">
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
                        className="aspect-square max-h-[180px] bg-bg-secondary overflow-hidden rounded border border-dashed border-border"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const imageId = e.dataTransfer.getData("text/product-image-id");
                          if (imageId) void handleGenerationDrop(key, imageId);
                        }}
                      >
                        {generationInputs[key].previewUrl ? (
                          <img src={generationInputs[key].previewUrl} alt={`${key} preview`} className="w-full h-full object-cover" />
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
            )}

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
          </section>
        )}

        {form.productType === "fashion" && (
          <SectionCard
            title="Origin Pictures"
            description="Manage the product or body reference angles in one place."
          >
            <div>
              <p className="mt-1 text-[11px] text-text-secondary">
                Clothes use front and back. Shoes use front, back, left, and right.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {originPictureKeys.map((key) => {
                const preview = form.originPictures[key];
                const inputId = `origin-picture-${key}-upload-edit`;
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
          </SectionCard>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="bg-accent text-bg-primary px-8 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50">
            {loading ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" onClick={() => router.back()} className="border border-border px-6 py-3 text-xs text-text-secondary uppercase tracking-wider">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
