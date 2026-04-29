"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getConditionStatusFromScore } from "@/lib/productCondition";
import { generateId } from "@/lib/uuid";
import { withAuthRequest } from "@/lib/authClient";
import { compressImageFile } from "@/lib/imageCompression";
import {
  SECONDARY_GARMENT_PALETTE,
  PaletteColor,
} from "@/lib/generationPalette";

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
type FashionSubtype = "" | "clothes" | "shoes";
type GenerationTarget = "" | "outerwear" | "top" | "bottom" | "dress";
type CompanionTopType = "" | "croptop" | "t-shirt";
type CompanionBottomType = "" | "shorts" | "pants";
type FootwearType = "" | "shoes" | "slides";
type OriginPictureKey = "front" | "back" | "left" | "right";
type GenerationInputs = {
  front: GenerationSlot;
  back: GenerationSlot;
  left: GenerationSlot;
  right: GenerationSlot;
};
type OriginPictures = Record<OriginPictureKey, string>;
type OriginPictureFiles = Record<OriginPictureKey, File | null>;
type CategoryPath = {
  parent: string;
  child: string;
  grandchild: string;
  greatGrandchild: string;
};

const initialForm = {
  name: "",
  price: "",
  description: "",
  brand: "",
  reference: "",
  stock: "1",
  tag: "",
  newTagDurationDays: "3",
  sizes: "",
  colors: "",
  conditionScore: "9",
  productType: "fashion" as ProductType,
  fashionSubtype: "" as FashionSubtype,
  sizeStock: {} as Record<string, string>,
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

function normalizeSizeList(value: string) {
  return value
    .split(",")
    .map((size) => size.trim())
    .filter(Boolean);
}

function buildSizeStockRecord(
  sizes: string[],
  sizeStock?: Record<string, { fullStock: number; stock: number; soldQuantity: number }> | null
) {
  return Object.fromEntries(
    sizes.map((size) => [size, String(Math.max(Number(sizeStock?.[size]?.fullStock ?? 0), 0))])
  ) as Record<string, string>;
}

function buildSoldQuantityRecord(
  sizes: string[],
  sizeStock?: Record<string, { fullStock: number; stock: number; soldQuantity: number }> | null
) {
  return Object.fromEntries(
    sizes.map((size) => [size, Math.max(Number(sizeStock?.[size]?.soldQuantity ?? 0), 0)])
  ) as Record<string, number>;
}

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

function getCategoryPath(categories: Category[], slugs: string[]): CategoryPath {
  const selected = categories.filter((category) => slugs.includes(category.slug));
  const deepest = selected.reduce<Category | null>((current, category) => {
    const depth = getDepth(categories, category);
    const currentDepth = current ? getDepth(categories, current) : -1;
    return depth > currentDepth ? category : current;
  }, null);

  if (!deepest) return { parent: "", child: "", grandchild: "", greatGrandchild: "" };

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
    greatGrandchild: chain[3] || "",
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

  const blob = await fetch(image.url, { cache: "reload" }).then((response) => response.blob());
  const extension = blob.type.split("/")[1] || "png";
  return new File([blob], `${label}-${Date.now()}.${extension}`, {
    type: blob.type || "image/png",
  });
}

async function originPictureToFile(url: string, label: OriginPictureKey) {
  const blob = await fetch(url).then((response) => response.blob());
  const extension = blob.type.split("/")[1] || "png";
  return new File([blob], `${label}-origin-${Date.now()}.${extension}`, {
    type: blob.type || "image/png",
  });
}

function waitFor(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);

    if (!signal) return;

    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function getCustomColorName(hex: string) {
  const normalized = hex.toUpperCase();
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  if (delta < 0.08) {
    if (max < 0.18) return `Custom black ${normalized}`;
    if (max > 0.9) return `Custom white ${normalized}`;
    return `Custom gray ${normalized}`;
  }

  let hue = 0;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  const label =
    hue < 20 || hue >= 345 ? "red" :
    hue < 45 ? "orange" :
    hue < 70 ? "yellow" :
    hue < 165 ? "green" :
    hue < 195 ? "cyan" :
    hue < 255 ? "blue" :
    hue < 290 ? "purple" :
    hue < 345 ? "pink" :
    "color";

  return `Custom ${label} ${normalized}`;
}

function customPaletteColor(hex: string): PaletteColor {
  const normalized = hex.toUpperCase();
  return { name: getCustomColorName(normalized), hex: normalized };
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
  const [selectedGreatGrandchildSlug, setSelectedGreatGrandchildSlug] = useState("");
  const [images, setImages] = useState<ProductImage[]>([]);
  const [originPictureFiles, setOriginPictureFiles] =
    useState<OriginPictureFiles>(emptyOriginPictureFiles);
  const [cloneSourceImageFile, setCloneSourceImageFile] = useState<File | null>(null);
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<ProductImage | null>(null);
  const [initialCategorySlugs, setInitialCategorySlugs] = useState<string[]>([]);
  const [savedFashionSubtype, setSavedFashionSubtype] = useState<FashionSubtype>("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [generationTarget, setGenerationTarget] = useState<GenerationTarget>("");
  const [companionTopType, setCompanionTopType] = useState<CompanionTopType>("");
  const [companionBottomType, setCompanionBottomType] = useState<CompanionBottomType>("");
  const [footwearType, setFootwearType] = useState<FootwearType>("");
  const [secondaryTopColor, setSecondaryTopColor] = useState<PaletteColor | null>(null);
  const [secondaryBottomColor, setSecondaryBottomColor] = useState<PaletteColor | null>(null);
  const [shoesColor, setShoesColor] = useState<PaletteColor | null>(null);
  const [generationInputs, setGenerationInputs] = useState<GenerationInputs>(initialGenerationInputs);
  const [importingGeneratedImage, setImportingGeneratedImage] = useState<string | null>(null);
  const [isGeneratedImagesOpen, setIsGeneratedImagesOpen] = useState(false);
  const [generatedImagesSearch, setGeneratedImagesSearch] = useState("");
  const [soldQuantity, setSoldQuantity] = useState(0);
  const [soldQuantityBySize, setSoldQuantityBySize] = useState<Record<string, number>>({});
  const [restockAmounts, setRestockAmounts] = useState<Record<string, string>>({});
  const [selectedStockSize, setSelectedStockSize] = useState("");
  const [savingSizeStockFor, setSavingSizeStockFor] = useState<string>("");
  const [restockAmount, setRestockAmount] = useState("0");
  const [restocking, setRestocking] = useState(false);
  const [newSizeInput, setNewSizeInput] = useState("");
  const generationAbortRef = useRef<AbortController | null>(null);
  const allowStockEditing = true;
  const sizeList = useMemo(
    () =>
      form.productType !== "perfume"
        ? normalizeSizeList(form.sizes)
        : [],
    [form.productType, form.sizes]
  );

  useEffect(() => {
    if (sizeList.length === 0) {
      setSelectedStockSize("");
      return;
    }

    if (!selectedStockSize || !sizeList.includes(selectedStockSize)) {
      setSelectedStockSize(sizeList[0]);
    }
  }, [selectedStockSize, sizeList]);

  useEffect(() => {
    fetch("/api/categories", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []));

    fetch("/api/models", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setModels(d.models || []));

    fetch("/api/generated-images", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setGeneratedImages(d.generatedImages || []));

    fetch(`/api/products/${id}`, withAuthRequest())
      .then((r) => r.json())
      .then((d) => {
        if (!d.product) return;

        const p = d.product;
        const nextSizeStockEntries =
          p.sizeStock && typeof p.sizeStock === "object"
            ? (p.sizeStock as Record<string, { fullStock: number; stock: number; soldQuantity: number }>)
            : null;
        const nextSizes = Array.from(
          new Set([
            ...normalizeSizeList((p.sizes || []).join(",")),
            ...(nextSizeStockEntries ? Object.keys(nextSizeStockEntries) : []),
          ])
        );
        const nextSizeStock = buildSizeStockRecord(nextSizes, nextSizeStockEntries);
        const nextSoldQuantityBySize = buildSoldQuantityRecord(nextSizes, nextSizeStockEntries);
        setForm({
          name: p.name,
          price: p.price.toString(),
          description: p.description || "",
          brand: p.brand || "LOOKSMAX",
          reference: p.reference || "",
          stock: String(p.fullStock ?? p.stock ?? 1),
          tag: p.tag || "",
          newTagDurationDays: String(p.newTagDurationDays ?? 3),
          sizes: (p.sizes || []).join(","),
          colors: (p.colors || []).join(","),
          conditionScore: String(p.conditionScore ?? 9),
          productType: p.productType === "perfume" ? "perfume" : "fashion",
          fashionSubtype: "",
          sizeStock: nextSizeStock,
          originPictures: {
            front: p.originPictures?.front || "",
            back: p.originPictures?.back || "",
            left: p.originPictures?.left || "",
            right: p.originPictures?.right || "",
          },
          cloneSourceName: p.cloneSourceName || "",
          cloneSourceImage: p.cloneSourceImage || "",
        });
        setSoldQuantity(Math.max(Number(p.soldQuantity ?? 0), 0));
        setSavedFashionSubtype(p.fashionSubtype || "clothes");
        setSoldQuantityBySize(nextSoldQuantityBySize);
        setRestockAmounts(Object.fromEntries(nextSizes.map((size) => [size, "0"])));
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
    setSelectedGreatGrandchildSlug(path.greatGrandchild || "");
  }, [categories, initialCategorySlugs]);

  const selectedCategorySlug =
    selectedGreatGrandchildSlug || selectedGrandchildSlug || selectedChildSlug || selectedParentSlug;
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
  const fullStock = Math.max(Number(form.stock || 0), 0);
  const availableStock = Math.max(fullStock - soldQuantity, 0);
  const normalizedSizeStock = useMemo(
    () =>
      Object.fromEntries(
        sizeList.map((size) => [size, Math.max(0, Number(form.sizeStock[size] || 0))])
      ) as Record<string, number>,
    [form.sizeStock, sizeList]
  );

  const syncInventoryState = (product: {
    stock?: number;
    fullStock?: number;
    soldQuantity?: number;
    sizeStock?: Record<string, { fullStock: number; stock: number; soldQuantity: number }> | null;
  }) => {
    if (typeof product.fullStock === "number" || typeof product.stock === "number") {
      const nextFullStock = Math.max(Number(product.fullStock ?? product.stock ?? 0), 0);
      setForm((current) => ({
        ...current,
        stock: String(nextFullStock),
      }));
    }

    if (typeof product.soldQuantity === "number") {
      setSoldQuantity(Math.max(product.soldQuantity, 0));
    }

    if (product.sizeStock && typeof product.sizeStock === "object") {
      const nextSizeStock: Record<string, string> = {};
      const nextSoldBySize: Record<string, number> = {};

      for (const [size, entry] of Object.entries(product.sizeStock)) {
        nextSizeStock[size] = String(entry.fullStock ?? 0);
        nextSoldBySize[size] = Math.max(Number(entry.soldQuantity ?? 0), 0);
      }

      setForm((current) => ({
        ...current,
        sizeStock: nextSizeStock,
      }));
      setSoldQuantityBySize(nextSoldBySize);
      setRestockAmounts(Object.fromEntries(Object.keys(nextSizeStock).map((size) => [size, "0"])));
      setSelectedStockSize((current) => {
        const nextSizeKeys = Object.keys(nextSizeStock);
        if (nextSizeKeys.length === 0) return "";
        return current && nextSizeKeys.includes(current) ? current : nextSizeKeys[0];
      });
    }
  };

  const handleSubmitSelectedSizeStock = async () => {
    if (!selectedStockSize) return;

    const amount = Math.max(0, Number(restockAmounts[selectedStockSize] || 0));
    if (amount <= 0) return;
    const isNewSize = form.sizeStock[selectedStockSize] === undefined;

    setError("");
    setSavingSizeStockFor(selectedStockSize);

    try {
      const response = await fetch(
        `/api/products/${id}`,
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sizes: sizeList,
            sizeStock: { [selectedStockSize]: amount },
            sizeStockMode: isNewSize ? "full" : "restock",
          }),
        })
      );
      const data = await response.json();
      if (!response.ok || !data.product) {
        setError(data.error || "Unable to save size stock.");
        return;
      }

      syncInventoryState(data.product);
    } catch {
      setError("Network error");
    } finally {
      setSavingSizeStockFor("");
    }
  };

  const handleAddStock = async () => {
    setError("");
    const amount = Math.max(0, Number(restockAmount || 0));
    if (amount <= 0) return;

    const nextStock = Math.max(0, Number(form.stock || 0)) + amount;
    setRestocking(true);

    try {
      const response = await fetch(
        `/api/products/${id}`,
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullStock: nextStock }),
        })
      );
      const data = await response.json();
      if (!response.ok || !data.product) {
        setError(data.error || "Unable to add stock.");
        return;
      }

      setForm((current) => ({
        ...current,
        stock: String(nextStock),
      }));
      setSoldQuantity(Math.max(Number(data.product.soldQuantity ?? soldQuantity), 0));
      setRestockAmount("0");
    } catch {
      setError("Network error");
    } finally {
      setRestocking(false);
    }
  };

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

  const assignProductImageToOriginPicture = async (key: OriginPictureKey, imageId: string) => {
    const image = images.find((entry) => entry.id === imageId);
    if (!image) return;

    try {
      const file = await productImageToFile(image, key);
      handleOriginPictureSelect(key, file);
    } catch {
      setError(`Unable to use this image for the ${key} origin picture.`);
    }
  };

  const assignOriginPictureToGenerationSlot = async (
    slotKey: keyof GenerationInputs,
    originKey: OriginPictureKey
  ) => {
    const previewUrl = form.originPictures[originKey];
    if (!previewUrl) return;

    try {
      const file =
        originPictureFiles[originKey] ?? (await originPictureToFile(previewUrl, originKey));
      setGenerationInputs((current) => ({
        ...current,
        [slotKey]: { file, previewUrl },
      }));
    } catch {
      setError(`Unable to use the ${originKey} origin picture for ${slotKey}.`);
    }
  };

  const handleOriginPictureDrop = async (
    key: OriginPictureKey,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    const imageId = event.dataTransfer.getData("text/product-image-id");

    if (imageId) {
      await assignProductImageToOriginPicture(key, imageId);
      setDraggedImageId(null);
      return;
    }

    handleOriginPictureSelect(key, event.dataTransfer.files?.[0] || null);
    setDraggedImageId(null);
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

  const handleGenerationSlotDrop = async (
    key: keyof GenerationInputs,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    const imageId = event.dataTransfer.getData("text/product-image-id");
    const originKey = event.dataTransfer.getData("text/origin-picture-key") as OriginPictureKey;

    if (imageId) {
      await handleGenerationDrop(key, imageId);
      return;
    }

    if (originKey) {
      await assignOriginPictureToGenerationSlot(key, originKey);
      setDraggedImageId(null);
      return;
    }

    const droppedFile = event.dataTransfer.files?.[0] || null;
    if (droppedFile) {
      handleGenerationInput(key, droppedFile);
      setDraggedImageId(null);
    }
  };

  const generationSlotsForSubtype =
    form.fashionSubtype === "shoes"
      ? (["front", "back", "left", "right"] as Array<keyof GenerationInputs>)
      : (["front", "back"] as Array<keyof GenerationInputs>);
  const requiresCompanionTop = generationTarget === "bottom" || generationTarget === "outerwear";
  const requiresCompanionBottom = generationTarget === "top" || generationTarget === "outerwear";
  const canGenerate =
    Boolean(form.fashionSubtype) &&
    (form.fashionSubtype !== "clothes" ||
      (Boolean(selectedModelId) &&
        Boolean(generationTarget) &&
        Boolean(footwearType) &&
        Boolean(shoesColor) &&
        (!requiresCompanionTop || (Boolean(companionTopType) && Boolean(secondaryTopColor))) &&
        (!requiresCompanionBottom || (Boolean(companionBottomType) && Boolean(secondaryBottomColor))))) &&
    Boolean(generationInputs.front.file) &&
    Boolean(generationInputs.back.file) &&
    (form.fashionSubtype !== "shoes" ||
      (Boolean(generationInputs.left.file) && Boolean(generationInputs.right.file)));

  const handleCancelGenerate = () => {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setGenerating(false);
  };

  const handleGenerate = async () => {
    setError("");

    if (!form.fashionSubtype) {
      setError("Please select what you want to generate first.");
      return;
    }

    if (form.fashionSubtype === "clothes" && !selectedModelId) {
      setError("Please select a model first.");
      return;
    }

    if (form.fashionSubtype === "clothes") {
      if (!generationTarget) {
        setError("Please select whether you want to generate outerwear, top, bottom, or dress.");
        return;
      }

      if (!shoesColor) {
        setError("Please select a footwear color.");
        return;
      }

      if (!footwearType) {
        setError("Please select shoes or slides.");
        return;
      }

      if (requiresCompanionTop && (!companionTopType || !secondaryTopColor)) {
        setError("Please select the top type and color.");
        return;
      }

      if (requiresCompanionBottom && (!companionBottomType || !secondaryBottomColor)) {
        setError("Please select the bottom type and color.");
        return;
      }
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

    const controller = new AbortController();
    generationAbortRef.current?.abort();
    generationAbortRef.current = controller;

    try {
      setGenerating(true);
      const body = new FormData();
      body.append("modelId", selectedModelId);
      body.append("type", form.productType);
      body.append("fashionSubtype", form.fashionSubtype);
      if (form.fashionSubtype === "clothes") {
        const selectedShoesColor = shoesColor;
        if (!selectedShoesColor) {
          setError("Please select a footwear color.");
          return;
        }
        body.append("generationTarget", generationTarget);
        body.append("garmentZone", generationTarget === "bottom" ? "bottom" : "top");
        body.append("companionTopType", companionTopType);
        body.append("companionBottomType", companionBottomType);
        body.append("footwearType", footwearType);
        if (secondaryTopColor) {
          body.append("topColorName", secondaryTopColor.name);
          body.append("topColorHex", secondaryTopColor.hex);
        }
        if (secondaryBottomColor) {
          body.append("bottomColorName", secondaryBottomColor.name);
          body.append("bottomColorHex", secondaryBottomColor.hex);
        }
        body.append("shoesColorName", selectedShoesColor.name);
        body.append("shoesColorHex", selectedShoesColor.hex);
      }
      const [frontFile, backFile, leftFile, rightFile] = await Promise.all([
        compressImageFile(generationInputs.front.file),
        compressImageFile(generationInputs.back.file),
        generationInputs.left.file ? compressImageFile(generationInputs.left.file) : Promise.resolve(null),
        generationInputs.right.file ? compressImageFile(generationInputs.right.file) : Promise.resolve(null),
      ]);
      body.append("front", frontFile);
      body.append("back", backFile);
      if (leftFile) body.append("left", leftFile);
      if (rightFile) body.append("right", rightFile);

      // 1. Trigger the job
      const triggerRes = await fetch("/api/products/generate", withAuthRequest({
        method: "POST",
        body,
        signal: controller.signal,
      }));
      const triggerData = await triggerRes.json();

      if (!triggerRes.ok) {
        setError(triggerData.error || "Unable to start generation.");
        return;
      }

      const jobId = triggerData.job_id;

      // 2. Poll for status
      let isCompleted = false;
      let finalImages: any = null;

      while (!isCompleted) {
        await waitFor(5000, controller.signal);

        const statusRes = await fetch(`/api/products/generate?job_id=${jobId}`, withAuthRequest({
          signal: controller.signal,
        }));
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
      if (!controller.signal.aborted) {
        setError("Generation request failed.");
      }
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
      }
      setGenerating(false);
    }
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

    if (form.stock.trim() === "") {
      setError("Please enter a full stock value.");
      setLoading(false);
      return;
    }

    try {
      const productCategories = [
        selectedParentSlug,
        selectedChildSlug,
        selectedGrandchildSlug,
        selectedGreatGrandchildSlug,
      ].filter(Boolean);

      const compressedValidImages = await Promise.all(
        validImages.map(async (img) => {
          if (!img.file) return img;
          return { ...img, file: await compressImageFile(img.file) };
        })
      );
      const compressedOriginPictureFiles = {
        front: originPictureFiles.front ? await compressImageFile(originPictureFiles.front) : null,
        back: originPictureFiles.back ? await compressImageFile(originPictureFiles.back) : null,
        left: originPictureFiles.left ? await compressImageFile(originPictureFiles.left) : null,
        right: originPictureFiles.right ? await compressImageFile(originPictureFiles.right) : null,
      };
      const compressedCloneSourceImageFile = cloneSourceImageFile
        ? await compressImageFile(cloneSourceImageFile)
        : null;

      const body = new FormData();
      body.append("name", form.name);
      body.append("price", form.price);
      body.append("brand", form.brand);
      body.append("reference", form.reference);
      body.append("description", form.description);
      body.append("tag", form.tag);
      body.append("newTagDurationDays", form.newTagDurationDays || "3");
      body.append("productType", form.productType);
      body.append("fashionSubtype", form.fashionSubtype || savedFashionSubtype || "clothes");
      body.append("fullStock", form.stock);
      const sizes = sizeList;
      if (sizes.length > 0) {
        const sizeStockPayload = Object.fromEntries(
          sizes.map((size) => [size, Math.max(0, Number(form.sizeStock[size] || 0))])
        );
        body.append("sizeStock", JSON.stringify(sizeStockPayload));
      }
      body.append("conditionScore", form.conditionScore);
      body.append("originPictureFront", form.originPictures.front);
      body.append("originPictureBack", form.originPictures.back);
      body.append("originPictureLeft", form.originPictures.left);
      body.append("originPictureRight", form.originPictures.right);
      if (compressedOriginPictureFiles.front) body.append("originPictureFrontFile", compressedOriginPictureFiles.front);
      if (compressedOriginPictureFiles.back) body.append("originPictureBackFile", compressedOriginPictureFiles.back);
      if (compressedOriginPictureFiles.left) body.append("originPictureLeftFile", compressedOriginPictureFiles.left);
      if (compressedOriginPictureFiles.right) body.append("originPictureRightFile", compressedOriginPictureFiles.right);
      body.append("cloneSourceName", form.cloneSourceName);
      body.append("cloneSourceImage", form.cloneSourceImage);
      if (compressedCloneSourceImageFile) body.append("cloneSourceImageFile", compressedCloneSourceImageFile);
      body.append("categories", JSON.stringify(productCategories));
      body.append(
        "sizes",
        JSON.stringify(sizeList)
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

      const newImages = compressedValidImages.filter((img) => !img.existing && img.file);
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

      const res = await fetch(`/api/products/${id}`, withAuthRequest({
        method: "PUT",
        body,
      }));

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
        {error && <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">{error}</div>}

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
              <FieldLabel>Reference</FieldLabel>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                placeholder="Internal product reference"
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
              {form.productType !== "perfume" && sizeList.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded border border-border bg-bg-secondary p-3">
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary">Full</p>
                      <p className="mt-1 text-lg font-semibold">{fullStock}</p>
                    </div>
                    <div className="rounded border border-border bg-bg-secondary p-3">
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary">Available</p>
                      <p className="mt-1 text-lg font-semibold">{availableStock}</p>
                    </div>
                    <div className="rounded border border-border bg-bg-secondary p-3">
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary">Sold</p>
                      <p className="mt-1 text-lg font-semibold">{soldQuantity}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-text-secondary">
                    Use the stock panel below to restock each size. Full stock is fixed after creation.
                  </p>
                </div>
              ) : (
                <>
                  <input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                    placeholder="Full stock"
                  />
                  <p className="mt-1 text-[10px] text-text-secondary">
                    Full stock is the total inventory you set. Sold units are shown in the stock panel.
                  </p>
                </>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-bg-secondary p-4 space-y-3 xl:col-span-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Stock Panel</p>
                <p className="mt-1 text-[11px] text-text-secondary">
                  Select a size. New sizes can receive an initial full stock once, existing sizes can be restocked.
                </p>
              </div>
              {form.productType !== "perfume" && (() => {
                const addSize = () => {
                  const trimmed = newSizeInput.trim();
                  if (!trimmed) return;
                  const existing = normalizeSizeList(form.sizes);
                  if (existing.includes(trimmed)) {
                    setNewSizeInput("");
                    setSelectedStockSize(trimmed);
                    return;
                  }
                  setForm({ ...form, sizes: [...existing, trimmed].join(",") });
                  setSelectedStockSize(trimmed);
                  setNewSizeInput("");
                };
                return (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newSizeInput}
                      onChange={(e) => setNewSizeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSize();
                        }
                      }}
                      className="flex-1 bg-bg-card border border-border px-3 py-2 text-sm focus:border-accent transition-colors"
                      placeholder="New size (e.g. M, 42)"
                    />
                    <button
                      type="button"
                      onClick={addSize}
                      className="shrink-0 border border-border px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-text-primary transition-colors hover:border-accent hover:text-accent"
                    >
                      Add size
                    </button>
                  </div>
                );
              })()}
              {sizeList.length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <FieldLabel>Size</FieldLabel>
                    <select
                      value={selectedStockSize}
                      onChange={(e) => setSelectedStockSize(e.target.value)}
                      className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                    >
                      {sizeList.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedStockSize ? (() => {
                    const sizeFull = Math.max(Number(normalizedSizeStock[selectedStockSize] || 0), 0);
                    const sizeSold = Math.max(Number(soldQuantityBySize[selectedStockSize] || 0), 0);
                    const sizeAvailable = Math.max(sizeFull - sizeSold, 0);
                    const restockValue = restockAmounts[selectedStockSize] || "0";
                    const isSaving = savingSizeStockFor === selectedStockSize;
                    const isNewSize = form.sizeStock[selectedStockSize] === undefined;

                    return (
                      <div className="grid grid-cols-1 gap-3 rounded border border-border bg-bg-card p-3 lg:grid-cols-[68px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(220px,1.1fr)] lg:items-stretch">
                        <div className="flex items-center justify-between gap-3 rounded border border-border bg-bg-secondary px-3 py-2 lg:justify-center">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-primary">{selectedStockSize}</p>
                          <p className="text-[10px] text-text-secondary lg:hidden">Initial full / restock / available / sold</p>
                        </div>

                        <div className="rounded border border-border bg-bg-secondary px-3 py-2 h-full">
                          <FieldLabel>Full Stock</FieldLabel>
                          <div className="flex h-[calc(100%-22px)] items-center">
                            <p className="text-sm font-semibold text-text-primary">{sizeFull}</p>
                          </div>
                        </div>

                        <div className="rounded border border-border bg-bg-secondary px-3 py-2 h-full">
                          <FieldLabel>Available</FieldLabel>
                          <div className="flex h-[calc(100%-22px)] items-center">
                            <p className="text-sm font-semibold text-text-primary">{sizeAvailable}</p>
                          </div>
                        </div>

                        <div className="rounded border border-border bg-bg-secondary px-3 py-2 h-full">
                          <FieldLabel>Sold</FieldLabel>
                          <div className="flex h-[calc(100%-22px)] items-center">
                            <p className="text-sm font-semibold text-text-primary">{sizeSold}</p>
                          </div>
                        </div>

                        <div className="rounded border border-border bg-bg-secondary px-3 py-2 h-full">
                          <FieldLabel>{isNewSize ? "Initial Stock" : "Restock"}</FieldLabel>
                          <div className="flex flex-row items-end gap-2">
                            <input
                              type="number"
                              min="0"
                              value={restockValue}
                              onChange={(e) =>
                                setRestockAmounts((current) => ({
                                  ...current,
                                  [selectedStockSize]: e.target.value,
                                }))
                              }
                              className="w-full min-w-0 flex-1 bg-bg-card border border-border px-3 py-2 text-sm focus:border-accent transition-colors"
                              placeholder={isNewSize ? "Initial stock" : "Restock"}
                            />
                            <button
                              type="button"
                              onClick={() => void handleSubmitSelectedSizeStock()}
                              disabled={isSaving}
                              className="shrink-0 border border-border px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
                            >
                              {isSaving ? "Saving..." : isNewSize ? "Create Stock" : "Restock"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })() : null}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="rounded border border-border bg-bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary">Full</p>
                      <p className="mt-1 text-lg font-semibold">{fullStock}</p>
                    </div>
                    <div className="rounded border border-border bg-bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary">Available</p>
                      <p className="mt-1 text-lg font-semibold">{availableStock}</p>
                    </div>
                    <div className="rounded border border-border bg-bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary">Sold</p>
                      <p className="mt-1 text-lg font-semibold">{soldQuantity}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="w-full sm:w-32 rounded border border-border bg-bg-secondary px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-text-secondary">Full</p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">{form.stock}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddStock}
                      disabled={restocking}
                      className="w-full sm:w-auto border border-foreground bg-foreground px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-background transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      {restocking ? "Saving..." : "ADD STOCK"}
                    </button>
                  </div>
                </>
              )}
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
                    setSelectedGreatGrandchildSlug("");
                    return;
                  }

                  const path = getCategoryPath(categories, [value]);
                  setSelectedParentSlug(path.parent);
                  setSelectedChildSlug(path.child);
                  setSelectedGrandchildSlug(path.grandchild);
                  setSelectedGreatGrandchildSlug(path.greatGrandchild || "");
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
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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

        <SectionCard title="Product Media" description="Keep tags and gallery management together while editing.">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div>
              <FieldLabel>Tag</FieldLabel>
              <select
                value={form.tag}
                onChange={(e) => setForm({ ...form, tag: e.target.value })}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
              >
                <option value="">None</option>
                <option value="NEW">NEW</option>
                <option value="FAVORITE">FAVORITE</option>
                {form.tag && !["", "NEW", "FAVORITE"].includes(form.tag) && (
                  <option value={form.tag}>{form.tag}</option>
                )}
              </select>
              {form.tag === "NEW" && (
                <div className="mt-3">
                  <FieldLabel>NEW tag duration (days)</FieldLabel>
                  <input
                    type="number"
                    min={1}
                    value={form.newTagDurationDays}
                    onChange={(e) => setForm({ ...form, newTagDurationDays: e.target.value })}
                    className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                    placeholder="3"
                  />
                </div>
              )}
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
                  <button
                    type="button"
                    onClick={() => setZoomedImage(img)}
                    className="group h-20 w-20 shrink-0 rounded border border-border bg-bg-primary p-1 transition-colors hover:border-accent"
                  >
                    <img
                      src={img.url}
                      alt={`Preview ${idx + 1}`}
                      className="h-full w-full object-contain transition-transform group-hover:scale-[1.03]"
                    />
                  </button>
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

        {zoomedImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setZoomedImage(null)}
          >
            <div className="relative max-h-[92vh] w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                aria-label="Close image preview"
                className="absolute right-0 top-0 z-10 h-9 w-9 border border-white/30 bg-black/60 text-xl leading-none text-white transition-colors hover:bg-black"
              >
                ×
              </button>
              <div className="flex max-h-[92vh] items-center justify-center bg-bg-card p-4">
                <img
                  src={zoomedImage.url}
                  alt="Zoomed product preview"
                  className="max-h-[86vh] max-w-full object-contain"
                />
              </div>
            </div>
          </div>
        )}

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
          <SectionCard
            title="Origin Pictures"
            description="Manage the product or body reference angles in one place."
          >
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {originPictureKeys.map((key) => {
                const preview = form.originPictures[key];
                return (
                  <div key={key} className="space-y-2">
                    <p className="text-[10px] text-text-secondary uppercase tracking-wider">{key}</p>
                    <div
                      draggable={!!preview}
                      onDragStart={(e) => {
                        if (!preview) return;
                        e.dataTransfer.setData("text/origin-picture-key", key);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => void handleOriginPictureDrop(key, e)}
                      className="aspect-square max-h-[180px] bg-bg-secondary overflow-hidden rounded border border-dashed border-border"
                    >
                      {preview ? (
                        <img
                          src={preview}
                          alt={`${key} origin`}
                          className="h-full w-full object-cover"
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
                );
              })}
            </div>
          </SectionCard>
        )}

        {form.productType === "fashion" && (
          <section className="bg-bg-card border border-border rounded p-5 space-y-5">
            <div>
              <h2 className="text-sm font-semibold">Generate Model Photos</h2>
              <p className="mt-1 text-[11px] text-text-secondary">
                Drag product images above into these slots, then generate.
              </p>
            </div>

            <div>
              <FieldLabel>Subtype</FieldLabel>
              <select
                value={form.fashionSubtype}
                onChange={(e) => {
                  setForm({ ...form, fashionSubtype: e.target.value as FashionSubtype });
                  setGenerationTarget("");
                  setCompanionTopType("");
                  setCompanionBottomType("");
                  setFootwearType("");
                  setSecondaryTopColor(null);
                  setSecondaryBottomColor(null);
                  setShoesColor(null);
                }}
                className="w-full max-w-xs bg-bg-secondary border border-border px-4 py-3 text-sm"
              >
                <option value="">Select subtype</option>
                <option value="clothes">Clothes</option>
                <option value="shoes">Shoes</option>
              </select>
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
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <FieldLabel>Generate</FieldLabel>
                    <select
                      value={generationTarget}
                      onChange={(e) => {
                        setGenerationTarget(e.target.value as GenerationTarget);
                        setCompanionTopType("");
                        setCompanionBottomType("");
                        setSecondaryTopColor(null);
                        setSecondaryBottomColor(null);
                      }}
                      className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                    >
                      <option value="">Select target</option>
                      <option value="outerwear">Outerwear</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                      <option value="dress">Dress</option>
                    </select>
                  </div>
                  <div className="space-y-3 rounded border border-border bg-bg-secondary p-3">
                    <FieldLabel>Footwear</FieldLabel>
                    <select
                      value={footwearType}
                      onChange={(e) => setFootwearType(e.target.value as FootwearType)}
                      className="w-full bg-bg-card border border-border px-3 py-2 text-sm"
                    >
                      <option value="">Select footwear</option>
                      <option value="shoes">Shoes</option>
                      <option value="slides">Slides</option>
                    </select>
                    <div className="flex flex-wrap items-center gap-2">
                      {SECONDARY_GARMENT_PALETTE.map((color) => (
                        <button
                          key={color.hex}
                          type="button"
                          title={color.name}
                          onClick={() => setShoesColor(color)}
                          className={`h-7 w-7 rounded-full border-2 transition-all ${
                            shoesColor?.hex === color.hex ? "border-accent scale-110" : "border-border hover:border-text-secondary"
                          }`}
                          style={{ backgroundColor: color.hex }}
                        />
                      ))}
                      <input
                        type="color"
                        value={shoesColor?.hex || "#000000"}
                        onChange={(e) =>
                          setShoesColor(customPaletteColor(e.target.value))
                        }
                        title="Custom footwear color"
                        className="h-8 w-10 cursor-pointer rounded border border-border bg-bg-secondary p-0.5"
                      />
                      <span className="text-[10px] text-text-secondary">{shoesColor?.name || "Select"}</span>
                    </div>
                  </div>
                  {requiresCompanionTop && (
                    <div className="space-y-3 rounded border border-border bg-bg-secondary p-3">
                      <FieldLabel>Top</FieldLabel>
                      <select
                        value={companionTopType}
                        onChange={(e) => setCompanionTopType(e.target.value as CompanionTopType)}
                        className="w-full bg-bg-card border border-border px-3 py-2 text-sm"
                      >
                        <option value="">Select top type</option>
                        <option value="croptop">Croptop</option>
                        <option value="t-shirt">T-shirt</option>
                      </select>
                      <div className="flex flex-wrap items-center gap-2">
                        {SECONDARY_GARMENT_PALETTE.map((color) => (
                          <button
                            key={color.hex}
                            type="button"
                            title={color.name}
                            onClick={() => setSecondaryTopColor(color)}
                            className={`h-7 w-7 rounded-full border-2 transition-all ${
                              secondaryTopColor?.hex === color.hex ? "border-accent scale-110" : "border-border hover:border-text-secondary"
                            }`}
                            style={{ backgroundColor: color.hex }}
                          />
                        ))}
                        <input
                          type="color"
                          value={secondaryTopColor?.hex || "#000000"}
                          onChange={(e) =>
                            setSecondaryTopColor(customPaletteColor(e.target.value))
                          }
                          title="Custom top color"
                          className="h-8 w-10 cursor-pointer rounded border border-border bg-bg-secondary p-0.5"
                        />
                        <span className="text-[10px] text-text-secondary">{secondaryTopColor?.name || "Select color"}</span>
                      </div>
                    </div>
                  )}
                  {requiresCompanionBottom && (
                    <div className="space-y-3 rounded border border-border bg-bg-secondary p-3">
                      <FieldLabel>Bottom</FieldLabel>
                      <select
                        value={companionBottomType}
                        onChange={(e) => setCompanionBottomType(e.target.value as CompanionBottomType)}
                        className="w-full bg-bg-card border border-border px-3 py-2 text-sm"
                      >
                        <option value="">Select bottom type</option>
                        <option value="shorts">Shorts</option>
                        <option value="pants">Pants</option>
                      </select>
                      <div className="flex flex-wrap items-center gap-2">
                        {SECONDARY_GARMENT_PALETTE.map((color) => (
                          <button
                            key={color.hex}
                            type="button"
                            title={color.name}
                            onClick={() => setSecondaryBottomColor(color)}
                            className={`h-7 w-7 rounded-full border-2 transition-all ${
                              secondaryBottomColor?.hex === color.hex ? "border-accent scale-110" : "border-border hover:border-text-secondary"
                            }`}
                            style={{ backgroundColor: color.hex }}
                          />
                        ))}
                        <input
                          type="color"
                          value={secondaryBottomColor?.hex || "#000000"}
                          onChange={(e) =>
                            setSecondaryBottomColor(customPaletteColor(e.target.value))
                          }
                          title="Custom bottom color"
                          className="h-8 w-10 cursor-pointer rounded border border-border bg-bg-secondary p-0.5"
                        />
                        <span className="text-[10px] text-text-secondary">{secondaryBottomColor?.name || "Select color"}</span>
                      </div>
                    </div>
                  )}
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
                        onDrop={(e) => void handleGenerationSlotDrop(key, e)}
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
                        onDrop={(e) => void handleGenerationSlotDrop(key, e)}
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

            <div className="flex justify-end gap-2">
              {generating && (
                <button
                  type="button"
                  onClick={handleCancelGenerate}
                  aria-label="Cancel generation"
                  className="inline-flex h-9 w-9 items-center justify-center border border-border text-xs text-text-secondary hover:bg-bg-hover"
                >
                  ×
                </button>
              )}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !canGenerate}
                className="bg-accent text-bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate"}
              </button>
            </div>
          </section>
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
