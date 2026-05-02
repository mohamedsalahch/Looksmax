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
import ColorPicker from "@/components/ColorPicker";
import {
  getCategoryGender,
  getCategoryZone,
  getCompanionZonesForCategory,
  getLeavesForZone,
  getZoneRequirements,
} from "@/lib/categoryClassification";

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
  kind?: "source" | "generated";
  slot?: OriginPictureKey;
}

interface GenerationSlot {
  file: File | null;
  previewUrl: string;
}

interface ModelAsset {
  _id: string;
  name: string;
  gender: "male" | "female" | "unisex";
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
type CompanionZone = "top" | "bottom" | "footwear";
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

type ProductMediaStatus = "idle" | "processing" | "completed" | "failed";

type FashionVariantRow = {
  id: string;
  size: string;
  colors: string;
  stock: string;
  conditionScore: string;
};

function buildVariantLabel(row: FashionVariantRow) {
  const size = row.size.trim();
  const color = row.colors.trim();
  return color ? `${size} / ${color}` : size;
}

const PRODUCT_MEDIA_ENHANCEMENT_PROMPT = `You are a professional e-commerce product retouching assistant.

Task:

* Transform the provided product image into a clean, mannequin-free product image suitable for a professional catalog.

Main Actions:

* Remove the mannequin completely
* Keep only the garment visible
* Reconstruct missing parts naturally if needed

View & Layout:

* The final image must be a top-down view (flat lay)
* The garment must be laid flat on a surface
* Ensure a natural and symmetrical flat presentation
* Keep proportions accurate and realistic

Fabric Preparation:

* Ironing clothes removes wrinkles — remove all wrinkles and creases
* Make the garment look freshly ironed or professionally steamed
* Keep natural fabric texture (do NOT over-smooth or make it look artificial)

Strict Preservation Rules:

* Preserve the product EXACTLY:

  * shape and proportions
  * color
  * fabric and texture
  * stitching and details
  * logos and branding
* Do NOT redesign or alter the garment

Background:

* Use a clean solid background with color #EAE9E7
* Flat surface, smooth and uniform
* No gradients, no texture, no distractions

Lighting:

* Soft, even studio lighting
* Minimal shadows
* Clean, catalog-style illumination

Constraints:

* No mannequin
* No human model
* No props
* No text or graphics
* No added elements

Output:

* High-resolution image
* Clean, ironed, flat-lay garment
* Professional e-commerce ready (Instagram & catalog quality)

- Background color must remain exactly #EAE9E7 with no variation`;

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

function getPrimaryColor(value: unknown) {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0] || "";
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

async function imageUrlToFile(url: string, label: string) {
  const blob = await fetch(url, { cache: "reload" }).then((response) => response.blob());
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

async function pickScreenColor() {
  if (typeof window === "undefined") return null;
  const EyeDropperCtor = (window as Window & {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }).EyeDropper;
  if (!EyeDropperCtor) return null;

  try {
    const eyeDropper = new EyeDropperCtor();
    const result = await eyeDropper.open();
    return customPaletteColor(result.sRGBHex);
  } catch {
    return null;
  }
}

function toggleColorToken(value: string, token: string) {
  const nextToken = token.trim();
  if (!nextToken) return value;

  const colors = value
    .split(",")
    .map((color) => color.trim())
    .filter(Boolean);
  const existingIndex = colors.findIndex((color) => color.toLowerCase() === nextToken.toLowerCase());
  if (existingIndex >= 0) {
    colors.splice(existingIndex, 1);
  } else {
    colors.push(nextToken);
  }
  return colors.join(", ");
}

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [productMediaStatus, setProductMediaStatus] = useState<ProductMediaStatus>("idle");
  const [productMediaJobId, setProductMediaJobId] = useState("");
  const [productMediaError, setProductMediaError] = useState("");
  const [showProductMediaSection, setShowProductMediaSection] = useState(false);
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
  const [generatedModelMedia, setGeneratedModelMedia] = useState<ProductImage[]>([]);
  const [importingGeneratedImage, setImportingGeneratedImage] = useState<string | null>(null);
  const [isGeneratedImagesOpen, setIsGeneratedImagesOpen] = useState(false);
  const [generatedImagesSearch, setGeneratedImagesSearch] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userStoreName, setUserStoreName] = useState("");
  const [userStoreType, setUserStoreType] = useState<"thrift" | "retail" | "">("");
  const categorySelectRef = useRef<HTMLSelectElement | null>(null);
  const [soldQuantity, setSoldQuantity] = useState(0);
  const [soldQuantityBySize, setSoldQuantityBySize] = useState<Record<string, number>>({});
  const [sizeStockConditionBySize, setSizeStockConditionBySize] = useState<Record<string, number | null>>({});
  const [restockAmounts, setRestockAmounts] = useState<Record<string, string>>({});
  const [savingSizeStockFor, setSavingSizeStockFor] = useState<string>("");
  const [restockAmount, setRestockAmount] = useState("0");
  const [restocking, setRestocking] = useState(false);
  const [variantRows, setVariantRows] = useState<FashionVariantRow[]>([]);
  const [variantDraft, setVariantDraft] = useState<FashionVariantRow>({
    id: "draft",
    size: "",
    colors: "",
    stock: "",
    conditionScore: "9",
  });
  const generationAbortRef = useRef<AbortController | null>(null);
  const savedSnapshot = useRef<{
    form: typeof initialForm;
    images: ProductImage[];
    generatedModelMedia: ProductImage[];
    generationInputs: GenerationInputs;
    initialCategorySlugs: string[];
    showProductMediaSection: boolean;
  } | null>(null);
  const allowStockEditing = true;
  const isStoreOwner = userRole === "store_owner";
  const isRetailStoreOwner = isStoreOwner && userStoreType === "retail";
  const isThriftStoreOwner = isStoreOwner && userStoreType === "thrift";
  const sizeList = useMemo(
    () =>
      form.productType !== "perfume"
        ? normalizeSizeList(form.sizes)
        : [],
    [form.productType, form.sizes]
  );
  const activeVariantRows = useMemo(
    () =>
      variantRows.filter(
        (row) => row.size.trim() || row.stock.trim() || row.colors.trim() || row.conditionScore.trim()
      ),
    [variantRows]
  );
  const completeVariantRows = useMemo(
    () =>
      activeVariantRows.filter(
        (row) => row.size.trim() && row.stock.trim() && row.colors.trim() && row.conditionScore.trim()
      ),
    [activeVariantRows]
  );
  const newVariantStockTotal = useMemo(
    () =>
      completeVariantRows.reduce((sum, row) => sum + Math.max(0, Number(row.stock || 0)), 0),
    [completeVariantRows]
  );
  const existingStockTotal = useMemo(
    () => sizeList.reduce((sum, size) => sum + Math.max(0, Number(form.sizeStock[size] || 0)), 0),
    [form.sizeStock, sizeList]
  );

  useEffect(() => {
    if (!error) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [error]);

  useEffect(() => {
    if (form.productType !== "fashion" || form.fashionSubtype !== "clothes") {
      clearProductMediaEnhancement();
      return;
    }
  }, [form.productType, form.fashionSubtype]);

  useEffect(() => {
    if (productMediaStatus !== "processing" || !productMediaJobId) return;

    const intervalId = window.setInterval(() => {
      fetch(`/api/products/enhance?job_id=${productMediaJobId}`, withAuthRequest())
        .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) {
            setProductMediaStatus("failed");
            setProductMediaError(data.error || "Unable to load enhanced product media.");
            return;
          }

          if (data.status === "completed") {
            const frontUrl = data.images?.front || "";
            const backUrl = data.images?.back || "";
            Promise.all([
              frontUrl ? imageUrlToFile(frontUrl, "front-enhanced") : Promise.resolve(null),
              backUrl ? imageUrlToFile(backUrl, "back-enhanced") : Promise.resolve(null),
            ])
              .then(([frontFile, backFile]) => {
                if (frontUrl) {
                  setForm((current) => ({
                    ...current,
                    originPictures: {
                      ...current.originPictures,
                      front: frontUrl,
                    },
                  }));
                  setOriginPictureFiles((current) => ({
                    ...current,
                    front: null,
                  }));
                  if (frontFile) {
                    setGenerationInputs((current) => ({
                      ...current,
                      front: { file: frontFile, previewUrl: frontUrl },
                    }));
                  }
                }
                if (backUrl) {
                  setForm((current) => ({
                    ...current,
                    originPictures: {
                      ...current.originPictures,
                      back: backUrl,
                    },
                  }));
                  setOriginPictureFiles((current) => ({
                    ...current,
                    back: null,
                  }));
                  if (backFile) {
                    setGenerationInputs((current) => ({
                      ...current,
                      back: { file: backFile, previewUrl: backUrl },
                    }));
                  }
                }
              })
              .finally(() => {
                setProductMediaStatus("completed");
                setProductMediaError("");
                setProductMediaJobId("");
              });
            return;
          }

          if (data.status === "failed") {
            setProductMediaStatus("failed");
            setProductMediaError(data.error || "Product media enhancement failed.");
            setProductMediaJobId("");
          }
        })
        .catch(() => {
          setProductMediaStatus("failed");
          setProductMediaError("Unable to load enhanced product media.");
        });
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [productMediaJobId, productMediaStatus]);

  useEffect(() => {
    fetch("/api/categories", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []));

    fetch("/api/models", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setModels(d.models || []));

    fetch("/api/auth/me", withAuthRequest())
      .then((r) => r.json())
      .then((d) => {
        const role = d.user?.role || "";
        setUserRole(role);
        setUserStoreName(d.user?.storeName || "");
        setUserStoreType(d.user?.storeType || "");
        if (role === "store_owner") return;

        fetch("/api/generated-images", withAuthRequest())
          .then((r) => r.json())
          .then((data) => setGeneratedImages(data.generatedImages || []));
      })
      .catch(() => {});

    fetch(`/api/products/${id}`, withAuthRequest())
      .then((r) => r.json())
      .then((d) => {
        if (!d.product) return;

        const p = d.product;
        const nextSizeStockEntries =
          p.sizeStock && typeof p.sizeStock === "object"
            ? (p.sizeStock as Record<string, { fullStock: number; stock: number; soldQuantity: number; conditionScore: number | null }>)
            : null;
        const nextSizes = Array.from(
          new Set([
            ...normalizeSizeList((p.sizes || []).join(",")),
            ...(nextSizeStockEntries ? Object.keys(nextSizeStockEntries) : []),
          ])
        );
        const nextSizeStock = buildSizeStockRecord(nextSizes, nextSizeStockEntries);
        const nextSoldQuantityBySize = buildSoldQuantityRecord(nextSizes, nextSizeStockEntries);
        const loadedFormData = {
          name: p.name,
          price: p.price.toString(),
          description: p.description || "",
          brand: p.brand || "LOOKSMAX",
          reference: p.reference || "",
          stock: String(p.fullStock ?? p.stock ?? 1),
          tag: p.tag || "",
          newTagDurationDays: String(p.newTagDurationDays ?? 3),
          sizes: nextSizes.join(","),
          colors: getPrimaryColor(p.colors),
          conditionScore: String(p.conditionScore ?? 9),
          productType: (p.productType === "perfume" ? "perfume" : "fashion") as "perfume" | "fashion",
          fashionSubtype: "" as FashionSubtype,
          sizeStock: nextSizeStock,
          originPictures: {
            front: p.originPictures?.front || "",
            back: p.originPictures?.back || "",
            left: p.originPictures?.left || "",
            right: p.originPictures?.right || "",
          },
          cloneSourceName: p.cloneSourceName || "",
          cloneSourceImage: p.cloneSourceImage || "",
        };
        setForm(loadedFormData);
        setSoldQuantity(Math.max(Number(p.soldQuantity ?? 0), 0));
        setSavedFashionSubtype(p.fashionSubtype || "clothes");
        setSoldQuantityBySize(nextSoldQuantityBySize);
        setSizeStockConditionBySize(
          nextSizeStockEntries
            ? Object.fromEntries(
                Object.entries(nextSizeStockEntries).map(([size, entry]) => [
                  size,
                  typeof entry.conditionScore === "number"
                    ? Math.max(0, Math.min(10, Number(entry.conditionScore) || 0))
                    : null,
                ])
              )
            : {}
        );
        setRestockAmounts(Object.fromEntries(nextSizes.map((size) => [size, "0"])));
        setInitialCategorySlugs(p.categories || []);
        const loadedModelMedia = (p.images || []).map((image: ProductImage) => ({
          ...image,
          id: generateId(),
          file: null,
          kind: "generated" as const,
        }));
        const loadedImages = (p.images || []).map((image: ProductImage) => ({
          ...image,
          id: generateId(),
          existing: true,
          file: null,
          kind: "source" as const,
        }));
const loadedCategorySlugs = p.categories || [];
        setGeneratedModelMedia(loadedModelMedia);
        setShowProductMediaSection(loadedModelMedia.length > 0);
        setImages(loadedImages);
        savedSnapshot.current = {
          form: loadedFormData,
          images: loadedImages,
          generatedModelMedia: loadedModelMedia,
          generationInputs: initialGenerationInputs,
          initialCategorySlugs: loadedCategorySlugs,
          showProductMediaSection: loadedModelMedia.length > 0,
        };
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
  const selectedCategoryZone = useMemo(
    () => getCategoryZone(categories, selectedCategorySlug),
    [categories, selectedCategorySlug]
  );
  const selectedCategoryGender = useMemo(
    () => getCategoryGender(categories, selectedCategorySlug),
    [categories, selectedCategorySlug]
  );
  const selectedModelGender: "male" | "female" | "unisex" =
    selectedCategoryGender === "men"
      ? "male"
      : selectedCategoryGender === "women"
        ? "female"
        : "unisex";
  const generationRequirements = useMemo(
    () => getZoneRequirements(selectedCategoryZone),
    [selectedCategoryZone]
  );
  const companionZones = useMemo(
    () => getCompanionZonesForCategory(selectedCategoryZone),
    [selectedCategoryZone]
  );
  const companionTypeOptions = useMemo(
    () => ({
      top: getLeavesForZone(categories, "top", selectedCategoryGender),
      bottom: getLeavesForZone(categories, "bottom", selectedCategoryGender),
      footwear: getLeavesForZone(categories, "footwear", selectedCategoryGender),
    }),
    [categories, selectedCategoryGender]
  );
  const categoryOptions = useMemo(() => {
    const visible = isStoreOwner
      ? categories.filter(
        (category) => !categories.some((other) => other.parentSlug === category.slug)
      )
      : categories;
    return visible.map((category) => ({
      slug: category.slug,
      label: getCategoryPathLabel(categories, category),
    }));
  }, [categories, isStoreOwner]);
  const filteredModels = useMemo(
    () =>
      selectedModelGender === "unisex"
        ? models
        : models.filter(
            (model) => model.gender === selectedModelGender || model.gender === "unisex"
          ),
    [models, selectedModelGender]
  );
  const selectedModel = filteredModels.find((model) => model._id === selectedModelId);
  const requiredOriginPictureKeys = useMemo(
    () =>
      selectedCategoryZone === "footwear"
        ? (["front", "back", "left", "right"] as OriginPictureKey[])
        : (["front", "back"] as OriginPictureKey[]),
    [selectedCategoryZone]
  );
  const hasRequiredOriginPictures = requiredOriginPictureKeys.every((key) => Boolean(generationInputs[key].file));
  const hasPendingEnhanceOriginPictures = requiredOriginPictureKeys.some((key) => Boolean(originPictureFiles[key]));
  const hasRequiredEnhanceInputs = Boolean(selectedCategorySlug) && form.productType === "fashion";
  const canSelectOriginPictures = Boolean(selectedCategorySlug);
  const enhanceButtonLabel =
    productMediaStatus === "processing"
      ? "Enhancing..."
      : !selectedCategorySlug
        ? "Select category"
        : "Enhance";
  const productMediaItems = useMemo(
    () => [
      ...generatedModelMedia.map((image, index) => ({
        label:
          index === 0
            ? "Front generated model"
            : index === 1
              ? "Back generated model"
              : `Generated view ${index + 1}`,
        url: image.url,
      })),
      ...(generationInputs.front.previewUrl
        ? [{ label: "Enhanced front", url: generationInputs.front.previewUrl }]
        : []),
      ...(generationInputs.back.previewUrl
        ? [{ label: "Enhanced back", url: generationInputs.back.previewUrl }]
        : []),
    ],
    [generatedModelMedia, generationInputs.front.previewUrl, generationInputs.back.previewUrl]
  );
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
    sizeStock?: Record<string, { fullStock: number; stock: number; soldQuantity: number; conditionScore: number | null }> | null;
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
      const nextConditionBySize: Record<string, number | null> = {};

      for (const [size, entry] of Object.entries(product.sizeStock)) {
        nextSizeStock[size] = String(entry.fullStock ?? 0);
        nextSoldBySize[size] = Math.max(Number(entry.soldQuantity ?? 0), 0);
        nextConditionBySize[size] =
          typeof entry.conditionScore === "number"
            ? Math.max(0, Math.min(10, Number(entry.conditionScore) || 0))
            : null;
      }

      setForm((current) => ({
        ...current,
        sizeStock: nextSizeStock,
      }));
      setSoldQuantityBySize(nextSoldBySize);
      setSizeStockConditionBySize(nextConditionBySize);
      setRestockAmounts(Object.fromEntries(Object.keys(nextSizeStock).map((size) => [size, "0"])));
    }
  };

  const handleSubmitSelectedSizeStock = async (size: string) => {
    const amount = Math.max(0, Number(restockAmounts[size] || 0));
    if (amount <= 0) return;

    setError("");
    setSavingSizeStockFor(size);

    try {
      const response = await fetch(
        `/api/products/${id}`,
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sizes: sizeList,
            sizeStock: { [size]: amount },
            sizeStockMode: "restock",
          }),
        })
      );
      const data = await response.json();
      if (!response.ok || !data.product) {
        setError(data.error || "Unable to save size stock.");
        return;
      }

      syncInventoryState(data.product);
      setRestockAmounts((current) => ({ ...current, [size]: "0" }));
    } catch {
      setError("Network error");
    } finally {
      setSavingSizeStockFor("");
    }
  };

  const handleRemoveExistingSize = async (size: string) => {
    const remainingSizes = sizeList.filter((item) => item !== size);
    const remainingSizeStock = Object.fromEntries(
      remainingSizes.map((item) => [
        item,
        {
          fullStock: Math.max(0, Number(form.sizeStock[item] || 0)),
          stock: Math.max(0, Number(form.sizeStock[item] || 0)),
          conditionScore: sizeStockConditionBySize[item] ?? null,
        },
      ])
    );

    setError("");
    setSavingSizeStockFor(size);

    try {
      const response = await fetch(
        `/api/products/${id}`,
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sizes: remainingSizes,
            sizeStock: remainingSizeStock,
            sizeStockMode: "full",
          }),
        })
      );
      const data = await response.json();
      if (!response.ok || !data.product) {
        setError(data.error || "Unable to remove size.");
        return;
      }

      syncInventoryState(data.product);
      setForm((current) => ({
        ...current,
        sizes: remainingSizes.join(","),
      }));
      setRestockAmounts((current) => {
        const next = { ...current };
        delete next[size];
        return next;
      });
      setSoldQuantityBySize((current) => {
        const next = { ...current };
        delete next[size];
        return next;
      });
      setSizeStockConditionBySize((current) => {
        const next = { ...current };
        delete next[size];
        return next;
      });
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
    setGenerationInputs((current) => ({
      ...current,
      [key]: file ? { file, previewUrl: URL.createObjectURL(file) } : createEmptySlot(),
    }));
    if (key === "front" || key === "back") {
      clearProductMediaEnhancement();
      setShowProductMediaSection(false);
      setGeneratedModelMedia([]);
    }
    setForm((current) => ({
      ...current,
      originPictures: {
        ...current.originPictures,
        [key]: file ? URL.createObjectURL(file) : "",
      },
    }));
    setImages((current) => {
      const next = current.filter((image) => !(image.kind === "source" && image.slot === key));
      if (!file) return next;

      return [
        ...next,
        {
          id: generateId(),
          url: URL.createObjectURL(file),
          file,
          existing: false,
          kind: "source",
          slot: key,
        },
      ];
    });
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
          kind: "generated",
        },
      ]);
    } catch {
      setError("Unable to import generated image.");
    } finally {
      setImportingGeneratedImage(null);
    }
  };

  const handleGenerationInput = (key: keyof GenerationInputs, file: File | null) => {
    if (key === "front" || key === "back") {
      clearProductMediaEnhancement();
    }
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
    setImages((current) => current.filter((image) => !(image.kind === "source" && image.slot === key)));
    setOriginPictureFiles((current) => ({
      ...current,
      [key]: null,
    }));
    setForm((current) => ({
      ...current,
      originPictures: {
        ...current.originPictures,
        [key]: "",
      },
    }));
    if (key === "front" || key === "back") {
      setShowProductMediaSection(false);
      setGeneratedModelMedia([]);
    }
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
      if (key in emptyOriginPictureFiles) {
        handleOriginPictureSelect(key as OriginPictureKey, file);
      }
    } catch {
      setError(`Unable to use this image for the ${key} slot.`);
    }
  };

  useEffect(() => {
    if (form.productType !== "fashion") {
      setGenerationTarget("");
      setSelectedModelId("");
      setCompanionTopType("");
      setCompanionBottomType("");
      setFootwearType("");
      setSecondaryTopColor(null);
      setSecondaryBottomColor(null);
      setShoesColor(null);
      setGenerationInputs(initialGenerationInputs);
      setOriginPictureFiles(emptyOriginPictureFiles);
      setForm((current) =>
        current.fashionSubtype === "" ? current : { ...current, fashionSubtype: "" }
      );
      return;
    }

    setGenerationTarget(generationRequirements.generationTarget);
    setForm((current) => {
      if (current.fashionSubtype === generationRequirements.fashionSubtype) return current;
      return { ...current, fashionSubtype: generationRequirements.fashionSubtype as FashionSubtype };
    });
    setSelectedModelId("");
    setCompanionTopType("");
    setCompanionBottomType("");
    setFootwearType("");
    setSecondaryTopColor(null);
    setSecondaryBottomColor(null);
    setShoesColor(null);
    setGenerationInputs(initialGenerationInputs);
    setOriginPictureFiles(emptyOriginPictureFiles);
    setForm((current) => ({
      ...current,
      originPictures: {
        front: "",
        back: "",
        left: "",
        right: "",
      },
    }));
  }, [form.productType, generationRequirements.fashionSubtype, generationRequirements.generationTarget]);

  const canGenerate =
    Boolean(form.fashionSubtype) &&
    hasRequiredOriginPictures &&
    (form.fashionSubtype !== "clothes" ||
      (generationRequirements.needsModel ? Boolean(selectedModelId) : true) &&
      (!companionZones.includes("top") || (Boolean(companionTopType) && Boolean(secondaryTopColor))) &&
      (!companionZones.includes("bottom") || (Boolean(companionBottomType) && Boolean(secondaryBottomColor))) &&
      (!companionZones.includes("footwear") || (Boolean(footwearType) && Boolean(shoesColor))));
  const renderCompanionZoneCard = (zone: CompanionZone) => {
    if (!companionZones.includes(zone)) return null;

    const options = companionTypeOptions[zone];

    if (zone === "top") {
      return (
        <div key={zone} className="space-y-3 rounded border border-border bg-bg-secondary p-3">
          <FieldLabel>Top</FieldLabel>
          <select
            value={companionTopType}
            onChange={(e) => setCompanionTopType(e.target.value as CompanionTopType)}
            className="w-full bg-bg-card border border-border px-3 py-2 text-sm"
          >
            <option value="">Select top type</option>
            {options.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
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
              onChange={(e) => setSecondaryTopColor(customPaletteColor(e.target.value))}
              title="Custom top color"
              className="h-8 w-10 cursor-pointer rounded border border-border bg-bg-secondary p-0.5"
            />
            <span className="text-[10px] text-text-secondary">{secondaryTopColor?.name || "Select color"}</span>
          </div>
        </div>
      );
    }

    if (zone === "bottom") {
      return (
        <div key={zone} className="space-y-3 rounded border border-border bg-bg-secondary p-3">
          <FieldLabel>Bottom</FieldLabel>
          <select
            value={companionBottomType}
            onChange={(e) => setCompanionBottomType(e.target.value as CompanionBottomType)}
            className="w-full bg-bg-card border border-border px-3 py-2 text-sm"
          >
            <option value="">Select bottom type</option>
            {options.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
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
              onChange={(e) => setSecondaryBottomColor(customPaletteColor(e.target.value))}
              title="Custom bottom color"
              className="h-8 w-10 cursor-pointer rounded border border-border bg-bg-secondary p-0.5"
            />
            <span className="text-[10px] text-text-secondary">{secondaryBottomColor?.name || "Select color"}</span>
          </div>
        </div>
      );
    }

    return (
      <div key={zone} className="space-y-3 rounded border border-border bg-bg-secondary p-3">
        <FieldLabel>Footwear</FieldLabel>
        <select
          value={footwearType}
          onChange={(e) => setFootwearType(e.target.value as FootwearType)}
          className="w-full bg-bg-card border border-border px-3 py-2 text-sm"
        >
          <option value="">Select footwear type</option>
          {options.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
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
            onChange={(e) => setShoesColor(customPaletteColor(e.target.value))}
            title="Custom footwear color"
            className="h-8 w-10 cursor-pointer rounded border border-border bg-bg-secondary p-0.5"
          />
          <span className="text-[10px] text-text-secondary">{shoesColor?.name || "Select color"}</span>
        </div>
      </div>
    );
  };

  const handleCancelGenerate = () => {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setGenerating(false);
  };

  const handleRegenerateModel = () => {
    setShowProductMediaSection(false);
    setGeneratedModelMedia([]);
  };

  const clearProductMediaEnhancement = () => {
    setProductMediaStatus("idle");
    setProductMediaJobId("");
    setProductMediaError("");
  };

  const handleCancelEnhance = () => {
    clearProductMediaEnhancement();
  };

  const handleCancel = () => {
    const snap = savedSnapshot.current;
    if (!snap) { router.back(); return; }
    setForm(snap.form);
    setImages(snap.images);
    setGeneratedModelMedia(snap.generatedModelMedia);
    setGenerationInputs(snap.generationInputs);
    setShowProductMediaSection(snap.showProductMediaSection);
    setInitialCategorySlugs([...snap.initialCategorySlugs]);
    setError("");
  };

  const handleEnhanceButtonClick = () => {
    if (!selectedCategorySlug) {
      categorySelectRef.current?.focus();
      categorySelectRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    void handleEnhanceProductMedia();
  };

  const handleEnhanceProductMedia = async () => {
    if (!hasRequiredEnhanceInputs) {
      setProductMediaError("Please choose categories first.");
      return;
    }

    if (!generationInputs.front.file || !generationInputs.back.file) {
      setProductMediaError("Please upload front and back images first.");
      return;
    }

    setProductMediaError("");
    setProductMediaStatus("processing");

    try {
      const [frontFile, backFile] = await Promise.all([
        compressImageFile(generationInputs.front.file),
        compressImageFile(generationInputs.back.file),
      ]);

      const body = new FormData();
      body.append("front", frontFile);
      body.append("back", backFile);

      const res = await fetch("/api/products/enhance", withAuthRequest({ method: "POST", body }));
      const data = await res.json();

      if (!res.ok) {
        setProductMediaStatus("failed");
        setProductMediaError(data.error || "Unable to start product media enhancement.");
        return;
      }

      setProductMediaJobId(data.job_id || "");
      setProductMediaStatus(data.status || "processing");
    } catch {
      setProductMediaStatus("failed");
      setProductMediaError("Network error");
    }
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
      if (companionZones.includes("top") && (!companionTopType || !secondaryTopColor)) {
        setError("Please select the top type and color.");
        return;
      }

      if (companionZones.includes("bottom") && (!companionBottomType || !secondaryBottomColor)) {
        setError("Please select the bottom type and color.");
        return;
      }

      if (companionZones.includes("footwear") && (!footwearType || !shoesColor)) {
        setError("Please select the footwear type and color.");
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
        body.append("generationTarget", generationRequirements.generationTarget);
        body.append(
          "garmentZone",
          generationRequirements.generationTarget === "bottom" ? "bottom" : "top"
        );
        body.append("companionTopType", companionZones.includes("top") ? companionTopType : "");
        body.append(
          "companionBottomType",
          companionZones.includes("bottom") ? companionBottomType : ""
        );
        body.append("footwearType", companionZones.includes("footwear") ? footwearType : "");
        if (companionZones.includes("top") && secondaryTopColor) {
          body.append("topColorName", secondaryTopColor.name);
          body.append("topColorHex", secondaryTopColor.hex);
        }
        if (companionZones.includes("bottom") && secondaryBottomColor) {
          body.append("bottomColorName", secondaryBottomColor.name);
          body.append("bottomColorHex", secondaryBottomColor.hex);
        }
        if (companionZones.includes("footwear") && selectedShoesColor) {
          body.append("shoesColorName", selectedShoesColor.name);
          body.append("shoesColorHex", selectedShoesColor.hex);
        }
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
            kind: "generated" as const,
          };
        })
      );

      const nextGeneratedImages = generatedImages.filter((img): img is any => !!img);
      setImages((current) => [...current, ...nextGeneratedImages]);
      setGeneratedModelMedia(nextGeneratedImages);
      setShowProductMediaSection(true);
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

    if (isThriftStoreOwner && !form.brand.trim()) {
      setError("Please provide the brand of this item.");
      setLoading(false);
      return;
    }

    if (form.productType === "fashion") {
      const hasExistingMedia = generatedModelMedia.some((m) => !m.file);
      const hasEnhanced = hasExistingMedia || Boolean(generationInputs.front.file);
      if (!hasEnhanced) {
        setError("Please enhance the product images before saving.");
        setLoading(false);
        return;
      }
      if (generatedModelMedia.length === 0) {
        setError("Please generate at least one model picture before saving.");
        setLoading(false);
        return;
      }
    }

    const brandToSend = isRetailStoreOwner ? userStoreName : form.brand;

    try {
      const productCategories = [
        selectedParentSlug,
        selectedChildSlug,
        selectedGrandchildSlug,
        selectedGreatGrandchildSlug,
      ].filter(Boolean);

      const currentProductMedia =
        generatedModelMedia.length > 0
          ? generatedModelMedia
          : images.filter((image) => image.kind === "source");
      if (currentProductMedia.length === 0) {
        setError("Please keep or upload at least one product image.");
        setLoading(false);
        return;
      }
      const existingImages = currentProductMedia
        .filter((image) => !image.file)
        .map((image) => ({ url: image.url }));
      const newMediaFiles = currentProductMedia
        .filter((image): image is ProductImage & { file: File } => Boolean(image.file))
        .map((image) => image.file);
      const imageOrder: string[] = [];
      let newImageIndex = 0;
      let mainImageKey = "";
      for (const image of currentProductMedia) {
        const key = image.file ? `new:${newImageIndex++}` : `existing:${image.url}`;
        imageOrder.push(key);
        if (!mainImageKey && (image as { isMain?: boolean }).isMain) {
          mainImageKey = key;
        }
      }
      if (!mainImageKey && imageOrder.length > 0) {
        mainImageKey = imageOrder[0];
      }
      const compressedProductMediaFiles = await Promise.all(
        newMediaFiles.map(async (file) => await compressImageFile(file))
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
      body.append("brand", brandToSend);
      body.append("reference", form.reference);
      body.append("description", form.description);
      body.append("tag", form.tag);
      body.append("newTagDurationDays", form.newTagDurationDays || "3");
      body.append("productType", form.productType);
      body.append("fashionSubtype", form.fashionSubtype || savedFashionSubtype || "clothes");
      body.append("fullStock", form.stock);
      const existingSizes = sizeList;
      const newVariantLabels = completeVariantRows.map((row) => buildVariantLabel(row));
      const sizeStockPayload = Object.fromEntries(
        [
          ...existingSizes.map((size) => [
            size,
            {
              fullStock: Math.max(0, Number(form.sizeStock[size] || 0)),
              stock: Math.max(0, Number(form.sizeStock[size] || 0)),
              conditionScore: null,
            },
          ]),
          ...completeVariantRows.map((row) => [
            buildVariantLabel(row),
            {
              fullStock: Math.max(0, Number(row.stock || 0)),
              stock: Math.max(0, Number(row.stock || 0)),
              conditionScore: Math.max(0, Math.min(10, Number(row.conditionScore || 9) || 9)),
            },
          ]),
        ]
      );
      if (Object.keys(sizeStockPayload).length > 0) {
        body.append("sizeStock", JSON.stringify(sizeStockPayload));
      }
      if (form.productType === "perfume") {
        body.append("conditionScore", form.conditionScore);
      }
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
        JSON.stringify([...existingSizes, ...newVariantLabels])
      );
      body.append(
        "colors",
        JSON.stringify(
          form.productType === "perfume"
            ? []
            : Array.from(
                new Set(
                  [
                    ...form.colors
                      .split(",")
                      .map((color) => color.trim())
                      .filter(Boolean),
                    ...completeVariantRows.map((row) => row.colors.trim()).filter(Boolean),
                  ]
                )
              )
        )
      );
      body.append("existingImages", JSON.stringify(existingImages));
      body.append("imageOrder", JSON.stringify(imageOrder));
      body.append("mainImageKey", mainImageKey);
      compressedProductMediaFiles.forEach((file) => {
        body.append("images", file);
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
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">{error}</div>}

        <SectionCard title="Product Basics" description="">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <FieldLabel>Product Name</FieldLabel>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                placeholder="e.g. Vintage Denim Jacket"
              />
            </div>
            {!isStoreOwner && (
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
            )}
            {!isRetailStoreOwner && (
              <div>
                <FieldLabel>Brand{isThriftStoreOwner ? " *" : ""}</FieldLabel>
                <input
                  type="text"
                  required={isThriftStoreOwner}
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                  placeholder={isThriftStoreOwner ? "Original brand, e.g. Zara" : "Brand name, e.g. Nike"}
                />
              </div>
            )}
            <div>
              <FieldLabel>Reference</FieldLabel>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                className="w-full bg-bg-secondary border border-border px-4 py-3 text-sm"
                placeholder="SKU or internal reference"
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
                placeholder="0.00"
              />
            </div>
            <div className="xl:col-span-3">
              <FieldLabel>Category</FieldLabel>
              <select
                ref={categorySelectRef}
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
                placeholder="Describe fit, materials, condition, and any notable details"
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
                    placeholder="e.g. Bleu de Chanel"
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
          <SectionCard title="Fashion Details" description="">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="xl:col-span-2 rounded-2xl border border-border bg-bg-secondary p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Existing Stock</p>

                  </div>
                  <div className="rounded border border-border bg-bg-card px-3 py-2 text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Total stock</p>
                    <p className="mt-1 text-sm font-semibold text-text-primary">{existingStockTotal}</p>
                  </div>
                </div>
                {sizeList.length > 0 ? (
                  <div className="space-y-2">
                    {sizeList.map((size) => {
                      const fullStockForSize = Math.max(Number(normalizedSizeStock[size] || 0), 0);
                      const soldForSize = Math.max(Number(soldQuantityBySize[size] || 0), 0);
                      const availableForSize = Math.max(fullStockForSize - soldForSize, 0);
                      const conditionScore = sizeStockConditionBySize[size];
                      const restockValue = restockAmounts[size] || "0";
                      const isSaving = savingSizeStockFor === size;
                      return (
                        <div
                          key={size}
                          className="flex flex-col gap-2 rounded border border-border bg-bg-card p-3 xl:flex-row xl:flex-nowrap xl:items-stretch"
                        >
                          <div className="flex items-center justify-between gap-3 xl:min-w-[90px] xl:flex-1">
                            <p className="text-sm font-semibold text-text-primary">{size}</p>
                          </div>
                          <div className="rounded border border-border bg-bg-secondary px-3 py-2 xl:w-[110px] xl:flex-none">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-text-secondary">Full</p>
                            <p className="mt-1 text-sm font-semibold text-text-primary">{fullStockForSize}</p>
                          </div>
                          <div className="rounded border border-border bg-bg-secondary px-3 py-2 xl:w-[110px] xl:flex-none">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-text-secondary">Available</p>
                            <p className="mt-1 text-sm font-semibold text-text-primary">{availableForSize}</p>
                          </div>
                          <div className="rounded border border-border bg-bg-secondary px-3 py-2 xl:w-[110px] xl:flex-none">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-text-secondary">Sold</p>
                            <p className="mt-1 text-sm font-semibold text-text-primary">{soldForSize}</p>
                          </div>
                          <div className="rounded border border-border bg-bg-secondary px-3 py-2 xl:min-w-[280px] xl:flex-1">
                            <FieldLabel>Restock</FieldLabel>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="0"
                                value={restockValue}
                                onChange={(e) =>
                                  setRestockAmounts((current) => ({
                                    ...current,
                                    [size]: e.target.value,
                                  }))
                                }
                                className="min-w-0 flex-1 bg-bg-card border border-border px-3 py-2 text-sm focus:border-accent transition-colors"
                                placeholder="Restock amount"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSubmitSelectedSizeStock(size)}
                                disabled={isSaving}
                                className="shrink-0 border border-border px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
                              >
                                {isSaving ? "Saving..." : "Restock"}
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRemoveExistingSize(size)}
                            disabled={isSaving}
                            className="shrink-0 border border-border px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-danger transition-colors hover:border-danger hover:text-danger disabled:opacity-60 xl:self-center"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-text-secondary">No existing stock rows yet.</p>
                )}
              </div>
              <div className="xl:col-span-2 rounded-2xl border border-border bg-bg-secondary p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">New Variants</p>

                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_140px_minmax(0,1.5fr)_120px]">
                  <input
                    type="text"
                    value={variantDraft.size}
                    onChange={(e) => setVariantDraft((current) => ({ ...current, size: e.target.value }))}
                    className="w-full bg-bg-card border border-border px-3 py-2 text-sm focus:border-accent transition-colors"
                    placeholder="Size, e.g. 42"
                  />
                  <input
                    type="number"
                    min="0"
                    value={variantDraft.stock}
                    onChange={(e) => setVariantDraft((current) => ({ ...current, stock: e.target.value }))}
                    className="w-full bg-bg-card border border-border px-3 py-2 text-sm focus:border-accent transition-colors"
                    placeholder="Stock"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Color</span>
                    <ColorPicker
                      value={variantDraft.colors}
                      onChange={(color) =>
                        setVariantDraft((current) => ({ ...current, colors: color.name }))
                      }
                      onPickInspector={async () => {
                        const picked = await pickScreenColor();
                        if (!picked) return;
                        setVariantDraft((current) => ({ ...current, colors: picked.name }));
                      }}
                    />
                  </div>
                  <div className="rounded border border-border bg-bg-card px-3 py-2">
                    <FieldLabel>Condition</FieldLabel>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={variantDraft.conditionScore}
                      onChange={(e) => setVariantDraft((current) => ({ ...current, conditionScore: e.target.value }))}
                      className="w-full accent-accent cursor-pointer"
                    />
                  </div>
                  <div className="md:col-span-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (!variantDraft.size.trim() || !variantDraft.stock.trim() || !variantDraft.colors.trim() || !variantDraft.conditionScore.trim()) return;
                        const stockValue = Math.max(0, Number(variantDraft.stock || 0));
                        setVariantRows((current) => [
                          ...current,
                          {
                            id: generateId(),
                            size: variantDraft.size.trim(),
                            colors: variantDraft.colors.trim(),
                            stock: String(stockValue),
                            conditionScore: String(Math.max(1, Math.min(10, Number(variantDraft.conditionScore || 9) || 9))),
                          },
                        ]);
                        setVariantDraft({
                          id: "draft",
                          size: "",
                          colors: "",
                          stock: "",
                          conditionScore: "9",
                        });
                      }}
                      disabled={!variantDraft.size.trim() || !variantDraft.stock.trim() || !variantDraft.colors.trim() || !variantDraft.conditionScore.trim()}
                      className="border border-border bg-foreground px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-background transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      ADD
                    </button>
                  </div>
                </div>
                {activeVariantRows.length > 0 && (
                  <div className="space-y-2">
                    {activeVariantRows.map((row, index) => (
                      <div key={row.id} className="grid grid-cols-1 gap-2 rounded border border-border bg-bg-card p-3 md:grid-cols-[minmax(0,1fr)_140px_minmax(0,1.5fr)_120px_auto] md:items-center">
                        <input
                          type="text"
                          value={row.size}
                          onChange={(e) =>
                            setVariantRows((current) =>
                              current.map((item) => (item.id === row.id ? { ...item, size: e.target.value } : item))
                            )
                          }
                          className="w-full bg-bg-secondary border border-border px-3 py-2 text-sm focus:border-accent transition-colors"
                          placeholder="Size"
                        />
                        <input
                          type="number"
                          min="0"
                          value={row.stock}
                          onChange={(e) =>
                            setVariantRows((current) =>
                              current.map((item) => (item.id === row.id ? { ...item, stock: e.target.value } : item))
                            )
                          }
                          className="w-full bg-bg-secondary border border-border px-3 py-2 text-sm focus:border-accent transition-colors"
                          placeholder="Stock"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Color</span>
                          <ColorPicker
                            value={row.colors}
                            onChange={(color) =>
                              setVariantRows((current) =>
                                current.map((item) =>
                                  item.id === row.id ? { ...item, colors: color.name } : item
                                )
                              )
                            }
                            onPickInspector={async () => {
                              const picked = await pickScreenColor();
                              if (!picked) return;
                              setVariantRows((current) =>
                                current.map((item) =>
                                  item.id === row.id ? { ...item, colors: picked.name } : item
                                )
                              );
                            }}
                          />
                        </div>
                        <div className="rounded border border-border bg-bg-secondary px-3 py-2">
                          <FieldLabel>Condition</FieldLabel>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={row.conditionScore}
                            onChange={(e) =>
                              setVariantRows((current) =>
                                current.map((item) =>
                                  item.id === row.id ? { ...item, conditionScore: e.target.value } : item
                                )
                              )
                            }
                            className="w-full accent-accent cursor-pointer"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setVariantRows((current) => current.filter((item) => item.id !== row.id))}
                          className="shrink-0 border border-border px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-text-secondary transition-colors hover:border-accent hover:text-accent"
                          aria-label={`Remove variant ${index + 1}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        )}

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

        {!isStoreOwner && generatedImages.length > 0 && (
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
                    placeholder="Search generated images by name or prompt"
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

          >
            {!isStoreOwner && (
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
                        placeholder="3 days"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className={`mt-4 grid justify-items-center gap-4 ${requiredOriginPictureKeys.length === 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2"}`}>
              {requiredOriginPictureKeys.map((key) => {
                const preview = generationInputs[key].previewUrl || form.originPictures[key];
                return (
                  <div key={key} className="mx-auto w-full max-w-[260px] justify-self-center space-y-3 rounded border border-border bg-bg-secondary p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider">{key} view</p>
                      {preview && (
                        <button
                          type="button"
                          onClick={() => clearGenerationInput(key)}
                          className="text-[10px] text-danger uppercase tracking-wider"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="aspect-[4/5] max-h-56 overflow-hidden rounded bg-bg-secondary flex">
                      {preview ? (
                        <button
                          type="button"
                          onClick={() => setZoomedImage({ id: key, url: preview, file: null, existing: false, kind: "source", slot: key })}
                          className="flex h-full w-full cursor-zoom-in items-center justify-center p-2"
                        >
                          <img src={preview} alt={`${key} origin`} className="max-h-full max-w-full object-contain" />
                        </button>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] text-text-secondary uppercase tracking-wider">
                          <span>Upload {key}</span>
                          <span className="text-[8px] tracking-normal normal-case text-text-secondary/80">
                            One image only
                          </span>
                        </div>
                      )}
                    </div>
                    <input
                      id={`origin-picture-edit-${key}`}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!canSelectOriginPictures}
                      onClick={(e) => {
                        e.currentTarget.value = "";
                      }}
                      onChange={(e) => handleOriginPictureSelect(key, e.currentTarget.files?.[0] || null)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!canSelectOriginPictures) return;
                        document.getElementById(`origin-picture-edit-${key}`)?.click();
                      }}
                      disabled={!canSelectOriginPictures}
                      className="inline-flex w-full items-center justify-center gap-2 border border-border bg-bg-card px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-primary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {preview ? "Replace" : "Upload"}
                    </button>
                  </div>
                );
              })}
            </div>

            {form.productType === "fashion" && hasPendingEnhanceOriginPictures && (
              <div className="mt-4">
                <div className="flex justify-end gap-2">
                  {productMediaStatus === "processing" && (
                    <button
                      type="button"
                      onClick={handleCancelEnhance}
                      aria-label="Cancel enhancement"
                      className="inline-flex h-9 w-9 items-center justify-center border border-border text-xs text-text-secondary hover:bg-bg-hover"
                    >
                      ×
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleEnhanceButtonClick}
                    disabled={productMediaStatus === "processing" || !selectedCategorySlug}
                    className="bg-accent px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-bg-primary disabled:opacity-50"
                  >
                    {productMediaStatus === "processing" && (
                      <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-bg-primary/40 border-t-bg-primary align-[-2px]" />
                    )}
                    {enhanceButtonLabel}
                  </button>
                </div>
              </div>
            )}

            {productMediaError && (
              <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">
                {productMediaError}
              </div>
            )}

            {!showProductMediaSection && selectedCategoryZone !== "other" && (generationRequirements.needsModel || selectedCategoryZone === "footwear") && productMediaStatus === "completed" && (
              <div className="mt-6 space-y-5 border-t border-border pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      Generation
                    </h3>
                    <p className="mt-1 text-[11px] text-text-secondary">
                      Target auto-detected from category: {generationTarget || "unknown"}.
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-text-secondary">
                    Gender: {selectedCategoryGender}
                  </span>
                </div>

                {generationRequirements.needsModel ? (
                  <div className="space-y-5">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                        Select a model
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                        {filteredModels.map((model) => {
                          const active = selectedModelId === model._id;
                          return (
                            <button
                              key={model._id}
                              type="button"
                              onClick={() => setSelectedModelId(model._id)}
                              className={`mx-auto w-full max-w-[150px] overflow-hidden rounded border text-left transition-colors ${
                                active ? "border-accent" : "border-border hover:border-accent"
                              }`}
                            >
                              <div className="aspect-[4/5] bg-bg-secondary">
                                <img
                                  src={model.frontImage || model.images?.[0] || ""}
                                  alt={model.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="space-y-1 p-2">
                                <p className="text-xs font-medium">{model.name}</p>
                                <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                                  Front view
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedModelId && companionZones.length > 0 && (
                      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                        {companionZones.map((zone) => renderCompanionZoneCard(zone))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded border border-border bg-bg-secondary p-4 text-xs text-text-secondary">
                    Shoes generation uses the uploaded origin pictures only.
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
                    className="bg-accent px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-bg-primary disabled:opacity-50"
                  >
                    {generating ? "Generating..." : "Generate"}
                  </button>
                </div>
              </div>
            )}
            {showProductMediaSection && productMediaItems.length > 0 && (
              <div className="mt-6 space-y-5 border-t border-border pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      Product Media
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegenerateModel}
                    className="border border-border px-3 py-2 text-[10px] uppercase tracking-wider text-text-secondary hover:bg-bg-hover"
                  >
                    Regenerate model
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {productMediaItems.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="mx-auto w-full max-w-[220px] space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary">{item.label}</p>
                      <button
                        type="button"
                        onClick={() => setZoomedImage({ id: item.label, url: item.url, file: null, existing: false, kind: "source" })}
                        className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded bg-bg-secondary p-2"
                      >
                        <img src={item.url} alt={item.label} className="max-h-full max-w-full object-contain" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="bg-accent text-bg-primary px-8 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50">
            {loading ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" onClick={handleCancel} className="border border-border px-6 py-3 text-xs text-text-secondary uppercase tracking-wider">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
