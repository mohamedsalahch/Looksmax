"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateId } from "@/lib/uuid";
import { withAuthRequest } from "@/lib/authClient";
import { compressImageFile } from "@/lib/imageCompression";
import { subscribeToJob, waitForJob } from "@/lib/jobEvents";
import {
  SECONDARY_GARMENT_PALETTE,
  PaletteColor,
} from "@/lib/generationPalette";
import ColorPicker, { type InspectorSource } from "@/components/ColorPicker";
import ImageColorSampler, { type SamplerSource } from "@/components/ImageColorSampler";
import {
  getCategoryAncestors,
  getCategoryGender,
  getCategoryZone,
  getCompanionZonesForCategory,
  getLeavesForZone,
  getZoneRequirements,
} from "@/lib/categoryClassification";
import { getConditionStatusFromScore } from "@/lib/productCondition";
import { normalizeHex } from "@/lib/adminVariants";

interface Category {
  _id: string;
  name: string;
  slug: string;
  isActive?: boolean;
  parentSlug?: string | null;
}

interface ProductImage {
  id: string;
  url: string;
  file: File | null;
  kind: "source" | "generated";
  slot?: OriginPictureKey;
}

interface GenerationSlot {
  file: File | null;
  previewUrl: string;
}

interface ModelAsset {
  _id: string;
  name: string;
  gender: "male" | "female" | "child";
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

type SizeRow = {
  id: string;
  size: string;
  stock: string;
  conditionScore: string;
};

type ColorwayEnhanceStatus = "idle" | "processing" | "completed" | "failed" | "original";

type Colorway = {
  id: string;
  hex: string;
  frontFile: File | null;
  frontPreview: string;
  backFile: File | null;
  backPreview: string;
  leftFile: File | null;
  leftPreview: string;
  rightFile: File | null;
  rightPreview: string;
  enhanceStatus: ColorwayEnhanceStatus;
  enhanceJobId: string;
  enhanceError: string;
  enhancedFrontUrl: string;
  enhancedBackUrl: string;
  enhancedLeftUrl: string;
  enhancedRightUrl: string;
  enhancedFrontFile: File | null;
  enhancedBackFile: File | null;
  enhancedLeftFile: File | null;
  enhancedRightFile: File | null;
  sizes: SizeRow[];
  // Generation
  generateStatus: ColorwayEnhanceStatus;
  generateJobId: string;
  generateError: string;
  generatedImages: Array<{ url: string; file: File | null }>;
  companionTopType: string;
  companionBottomType: string;
  companionFootwearType: string;
  companionTopColor: PaletteColor | null;
  companionBottomColor: PaletteColor | null;
  companionFootwearColor: PaletteColor | null;
  additionalInstructions: string;
};

function normalizeVariantColors(value: string) {
  return value
    .split(",")
    .map((color) => color.trim())
    .filter(Boolean);
}


const initialForm = {
  name: "",
  price: "",
  description: "",
  brand: "",
  reference: "",
  stock: "1",
  tag: "",
  newTagDurationDays: "3",
  conditionScore: "10",
  productType: "fashion" as ProductType,
  fashionSubtype: "" as FashionSubtype,
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

function createEmptyColorway(hex = ""): Colorway {
  return {
    id: generateId(),
    hex,
    frontFile: null,
    frontPreview: "",
    backFile: null,
    backPreview: "",
    leftFile: null,
    leftPreview: "",
    rightFile: null,
    rightPreview: "",
    enhanceStatus: "idle",
    enhanceJobId: "",
    enhanceError: "",
    enhancedFrontUrl: "",
    enhancedBackUrl: "",
    enhancedLeftUrl: "",
    enhancedRightUrl: "",
    enhancedFrontFile: null,
    enhancedBackFile: null,
    enhancedLeftFile: null,
    enhancedRightFile: null,
    sizes: [{ id: generateId(), size: "", stock: "", conditionScore: "10" }],
    generateStatus: "idle",
    generateJobId: "",
    generateError: "",
    generatedImages: [],
    companionTopType: "",
    companionBottomType: "",
    companionFootwearType: "",
    companionTopColor: null,
    companionBottomColor: null,
    companionFootwearColor: null,
    additionalInstructions: "",
  };
}

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

const FOUR_IMAGE_VIEWS: OriginPictureKey[] = ["front", "back", "left", "right"];
const STORE_OWNER_SERVICE_COMMISSION_RATE = 0.1;
const ACCESSORY_VIEW_LABELS: Record<OriginPictureKey, string> = {
  front: "Image 1",
  back: "Image 2",
  left: "Image 3",
  right: "Image 4",
};
const FOOTWEAR_VIEW_VERIFICATION_COPY =
  "Footwear verification: upload four different shoe angles: front, back, left side, and right side. Each slot is sent separately to the generator.";

function hasAccessoryWorkflowCategory(categories: Category[], slug: string, zone: string) {
  if (!slug) return false;
  if (zone === "handbag" || zone === "headwear") return true;
  const chain = getCategoryAncestors(categories, slug);
  return chain.some((category) => /accessor/i.test(category.slug) || /accessor/i.test(category.name));
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary mb-1.5">
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] text-danger">{message}</p>;
}

function SectionCard({
  title,
  description,
  error,
  children,
}: {
  title: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-border bg-bg-card p-6 space-y-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-text-primary">{title}</h2>
        {description && <p className="mt-1 text-[11px] text-text-secondary">{description}</p>}
      </div>
      {error && (
        <div className="border border-[#8B3520]/40 bg-[#8B3520]/5 px-4 py-3 text-xs text-[#8B3520]">
          {error}
        </div>
      )}
      {children}
    </section>
  );
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
  const isDirectFetchable =
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("/") ||
    (!url.startsWith("http://") && !url.startsWith("https://"));
  const fetchUrl = isDirectFetchable ? url : `/api/media-fetch?url=${encodeURIComponent(url)}`;
  const blob = await fetch(fetchUrl, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Media fetch failed with status ${response.status}`);
    }
    return response.blob();
  });
  const extension = blob.type.split("/")[1] || "png";
  return new File([blob], `${label}-${Date.now()}.${extension}`, {
    type: blob.type || "image/png",
  });
}

function isImageUrl(value: string) {
  return (
    value.startsWith("/") ||
    value.startsWith("blob:") ||
    value.startsWith("http://") ||
    value.startsWith("https://")
  );
}

async function generatedResultToFile(value: string, index: number) {
  if (isImageUrl(value)) {
    return imageUrlToFile(value, `generated-${index}`);
  }

  return base64ToFile(value, index);
}

async function originPictureToFile(url: string, label: OriginPictureKey) {
  const blob = await fetch(url).then((response) => response.blob());
  const extension = blob.type.split("/")[1] || "png";
  return new File([blob], `${label}-origin-${Date.now()}.${extension}`, {
    type: blob.type || "image/png",
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

function getStoreOwnerPayoutPrice(price: string) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return "";
  return (value * (1 - STORE_OWNER_SERVICE_COMMISSION_RATE)).toFixed(2);
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

function CompanionColorPicker({
  color,
  onSelect,
  title,
}: {
  color: PaletteColor | null;
  onSelect: (color: PaletteColor) => void;
  title: string;
}) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const hasColor = Boolean(color?.hex.trim());

  const handlePickColor = async () => {
    const picked = await pickScreenColor();
    if (picked) {
      onSelect(picked);
      return;
    }
    colorInputRef.current?.click();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SECONDARY_GARMENT_PALETTE.map((paletteColor) => (
        <button
          key={paletteColor.hex}
          type="button"
          title={paletteColor.name}
          onClick={() => onSelect(paletteColor)}
          className={`h-6 w-6 rounded-full border-2 transition-all ${color?.hex === paletteColor.hex ? "border-accent scale-110" : "border-border hover:border-text-secondary"}`}
          style={{ backgroundColor: paletteColor.hex }}
        />
      ))}
      <input
        type="color"
        value={color?.hex || "#000000"}
        onChange={(e) => onSelect(customPaletteColor(e.target.value))}
        title="Pick any custom color"
        className="h-6 w-10 cursor-pointer rounded border border-border bg-bg-secondary p-0.5"
      />
      <button
        type="button"
        onClick={handlePickColor}
        title={title}
        className={`h-6 w-6 flex-none border-2 transition-all ${hasColor ? "rounded-full border-border hover:border-accent" : "rounded border-dashed border-border bg-transparent"}`}
        style={hasColor ? { backgroundColor: color?.hex } : undefined}
      />
      <input ref={colorInputRef} type="color" value={color?.hex || "#000000"} onChange={(e) => onSelect(customPaletteColor(e.target.value))} className="sr-only" />
    </div>
  );
}

function toggleColorToken(value: string, token: string) {
  const nextToken = token.trim();
  if (!nextToken) return normalizeVariantColors(value).join(", ");

  const colors = normalizeVariantColors(value);
  const existingIndex = colors.findIndex((color) => color.toLowerCase() === nextToken.toLowerCase());
  if (existingIndex >= 0) {
    colors.splice(existingIndex, 1);
  } else {
    colors.push(nextToken);
  }
  return colors.join(", ");
}

function ColorwayGenerationCard({
  colorway,
  index,
  companionZones,
  companionTypeOptions,
  onUpdate,
  onGenerate,
  canGenerate,
}: {
  colorway: Colorway;
  index: number;
  companionZones: CompanionZone[];
  companionTypeOptions: { top: { slug: string; name: string }[]; bottom: { slug: string; name: string }[]; footwear: { slug: string; name: string }[] };
  onUpdate: (patch: Partial<Colorway>) => void;
  onGenerate: () => void;
  canGenerate: boolean;
}) {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const hasColor = Boolean(colorway.hex.trim());

  return (
    <div data-colorway-id={colorway.id} className="w-full sm:flex-none sm:w-[270px] rounded-2xl border border-border bg-bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span
          className={`h-4 w-4 flex-none border ${hasColor ? "rounded-full border-border/60" : "border-dashed border-border/80 bg-transparent"}`}
          style={hasColor ? { backgroundColor: colorway.hex } : undefined}
        />
        <span className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">
          Product {index + 1}
        </span>
        <span className="ml-auto text-[9px] font-mono text-text-secondary/60">{hasColor ? colorway.hex : "No color"}</span>
      </div>

      {/* Companion zones */}
      {companionZones.length > 0 && (
        <div className="space-y-3">
          <p className="text-[9px] uppercase tracking-wider text-text-secondary">Model Generation</p>
          {companionZones.includes("top") && (
            <div className="space-y-2">
              <p className="text-[9px] uppercase tracking-wider text-text-secondary">Top</p>
              <select
                value={colorway.companionTopType}
                onChange={(e) => onUpdate({ companionTopType: e.target.value })}
                className="w-full border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors"
              >
                <option value="">Select type</option>
                {companionTypeOptions.top.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                ))}
              </select>
              <CompanionColorPicker
                color={colorway.companionTopColor}
                onSelect={(color) => onUpdate({ companionTopColor: color })}
                title="Pick a custom top color"
              />
            </div>
          )}

          {companionZones.includes("bottom") && (
            <div className="space-y-2">
              <p className="text-[9px] uppercase tracking-wider text-text-secondary">Bottom</p>
              <select
                value={colorway.companionBottomType}
                onChange={(e) => onUpdate({ companionBottomType: e.target.value })}
                className="w-full border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors"
              >
                <option value="">Select type</option>
                {companionTypeOptions.bottom.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                ))}
              </select>
              <CompanionColorPicker
                color={colorway.companionBottomColor}
                onSelect={(color) => onUpdate({ companionBottomColor: color })}
                title="Pick a custom bottom color"
              />
            </div>
          )}

          {companionZones.includes("footwear") && (
            <div className="space-y-2">
              <p className="text-[9px] uppercase tracking-wider text-text-secondary">Footwear</p>
              <select
                value={colorway.companionFootwearType}
                onChange={(e) => onUpdate({ companionFootwearType: e.target.value })}
                className="w-full border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors"
              >
                <option value="">Select type</option>
                {companionTypeOptions.footwear.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                ))}
              </select>
              <CompanionColorPicker
                color={colorway.companionFootwearColor}
                onSelect={(color) => onUpdate({ companionFootwearColor: color })}
                title="Pick a custom footwear color"
              />
            </div>
          )}
        </div>
      )}

      {/* Generated images preview */}
      {colorway.generatedImages.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {colorway.generatedImages.map((img, i) => (
            <div key={i} className="space-y-1">
              <button
                type="button"
                onClick={() => setZoomedUrl(img.url)}
                className="group relative aspect-[4/5] overflow-hidden rounded border border-border bg-bg-secondary cursor-zoom-in transition-colors hover:border-accent/60"
              >
                <img src={img.url} alt={`Generated ${i + 1}`} className="h-full w-full object-cover" />
                <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-1 rounded bg-black/60 px-2 py-1 text-center text-[8px] uppercase tracking-wider text-white opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                  Preview
                </span>
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ generatedImages: [], generateStatus: "idle", generateError: "", generateJobId: "" })}
                className="w-full border border-border px-2 py-1.5 text-[8px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/5"
              >
                Clear
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Generate button */}
      <div className="space-y-1 border-t border-border pt-3">
        {colorway.generateError && (
          <div className="border border-[#BD3100] bg-[#faf3f2] px-3 py-2 text-[10px] text-[#BD3100]">
            {colorway.generateError}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          {colorway.generateStatus === "completed" && canGenerate && (
            <button
              type="button"
              onClick={onGenerate}
              className="text-[8px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-text-primary hover:decoration-text-primary"
            >
              Regenerate
            </button>
          )}
          <button
            type="button"
            onClick={canGenerate && colorway.generateStatus !== "completed" ? onGenerate : undefined}
            disabled={!canGenerate || colorway.generateStatus === "processing" || colorway.generateStatus === "completed"}
            className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-bg-primary disabled:opacity-50 transition-opacity"
          >
            {colorway.generateStatus === "processing" && (
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-bg-primary/40 border-t-bg-primary" />
            )}
            {colorway.generateStatus === "completed"
              ? "Generated"
              : colorway.generateStatus === "processing"
              ? "Generating..."
              : "Generate"}
          </button>
        </div>
      </div>

      {/* Zoom modal */}
      {zoomedUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomedUrl(null)}
        >
          <div className="relative max-h-[92vh] w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomedUrl(null)}
              className="absolute right-0 top-0 z-10 h-9 w-9 border border-white/30 bg-black/60 text-xl leading-none text-white hover:bg-black transition-colors"
            >
              ×
            </button>
            <div className="flex max-h-[92vh] items-center justify-center bg-bg-card p-4">
              <img src={zoomedUrl} alt="Generated model" className="max-h-[86vh] max-w-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ColorwayView = "front" | "back" | "left" | "right";

function ColorwayCard({
  colorway,
  index,
  canRemove,
  isThrift,
  conditionLocked,
  showGenerationPanel,
  companionZones,
  companionTypeOptions,
  canGenerate,
  requiredViews,
  viewLabels,
  enhanceRequiresAllViews = true,
  hideSizeInput = false,
  onRemove,
  onUpdate,
  onEnhance,
  onGenerate,
  onAddSize,
  onRemoveSize,
  onUpdateSize,
}: {
  colorway: Colorway;
  index: number;
  canRemove: boolean;
  isThrift: boolean;
  conditionLocked?: boolean;
  showGenerationPanel?: boolean;
  companionZones?: CompanionZone[];
  companionTypeOptions?: { top: { slug: string; name: string }[]; bottom: { slug: string; name: string }[]; footwear: { slug: string; name: string }[] };
  canGenerate?: boolean;
  requiredViews?: ColorwayView[];
  viewLabels?: Partial<Record<ColorwayView, string>>;
  enhanceRequiresAllViews?: boolean;
  hideSizeInput?: boolean;
  onRemove: () => void;
  onUpdate: (patch: Partial<Colorway>) => void;
  onEnhance: () => void;
  onGenerate?: () => void;
  onAddSize: () => void;
  onRemoveSize: (sizeId: string) => void;
  onUpdateSize: (sizeId: string, patch: Partial<SizeRow>) => void;
}) {
  const views: ColorwayView[] = requiredViews && requiredViews.length > 0 ? requiredViews : ["front", "back"];
  const [zoomedPreview, setZoomedPreview] = useState<string | null>(null);
  const [samplerOpen, setSamplerOpen] = useState(false);
  const hasColor = Boolean(colorway.hex.trim());

  const fileKeyFor = (view: ColorwayView): "frontFile" | "backFile" | "leftFile" | "rightFile" =>
    `${view}File` as "frontFile" | "backFile" | "leftFile" | "rightFile";
  const previewKeyFor = (view: ColorwayView): "frontPreview" | "backPreview" | "leftPreview" | "rightPreview" =>
    `${view}Preview` as "frontPreview" | "backPreview" | "leftPreview" | "rightPreview";
  const enhancedUrlKeyFor = (
    view: ColorwayView
  ): "enhancedFrontUrl" | "enhancedBackUrl" | "enhancedLeftUrl" | "enhancedRightUrl" =>
    `enhanced${view.charAt(0).toUpperCase()}${view.slice(1)}Url` as
      | "enhancedFrontUrl"
      | "enhancedBackUrl"
      | "enhancedLeftUrl"
      | "enhancedRightUrl";
  const enhancedFileKeyFor = (
    view: ColorwayView
  ): "enhancedFrontFile" | "enhancedBackFile" | "enhancedLeftFile" | "enhancedRightFile" =>
    `enhanced${view.charAt(0).toUpperCase()}${view.slice(1)}File` as
      | "enhancedFrontFile"
      | "enhancedBackFile"
      | "enhancedLeftFile"
      | "enhancedRightFile";

  const uploadedViews = views.filter(
    (view) => Boolean(colorway[fileKeyFor(view)] || colorway[previewKeyFor(view)])
  );
  const hasEnhancedResults =
    uploadedViews.length > 0 &&
    uploadedViews.every((view) => Boolean(colorway[enhancedUrlKeyFor(view)] || colorway[enhancedFileKeyFor(view)]));
  const isShowingEnhanced = hasEnhancedResults && colorway.enhanceStatus === "completed";
  const isUsingOriginal = colorway.enhanceStatus === "original";

  const getDisplayedPreview = (view: ColorwayView) =>
    isShowingEnhanced
      ? colorway[enhancedUrlKeyFor(view)] || colorway[previewKeyFor(view)]
      : colorway[previewKeyFor(view)];

  const handleViewFile = (view: ColorwayView, file: File | null) => {
    const generating = colorway.generateStatus === "processing";
    const fileKey = fileKeyFor(view);
    const previewKey = previewKeyFor(view);
    const enhanceReset = generating
      ? {}
      : {
          enhanceStatus: "idle" as const,
          enhanceJobId: "",
          enhanceError: "",
          enhancedFrontUrl: "",
          enhancedBackUrl: "",
          enhancedLeftUrl: "",
          enhancedRightUrl: "",
          enhancedFrontFile: null,
          enhancedBackFile: null,
          enhancedLeftFile: null,
          enhancedRightFile: null,
        };
    if (!file) {
      onUpdate({ [fileKey]: null, [previewKey]: "", ...enhanceReset } as Partial<Colorway>);
      return;
    }
    onUpdate({ [fileKey]: file, [previewKey]: URL.createObjectURL(file), ...enhanceReset } as Partial<Colorway>);
  };

  const canEnhance = enhanceRequiresAllViews ? uploadedViews.length === views.length : uploadedViews.length > 0;

  const samplerSources: SamplerSource[] = [];
  views.forEach((view) => {
    const enhancedUrl = colorway[enhancedUrlKeyFor(view)];
    if (enhancedUrl) samplerSources.push({ url: enhancedUrl, label: `${view} (enhanced)` });
    const preview = colorway[previewKeyFor(view)];
    if (preview) samplerSources.push({ url: preview, label: view });
  });

  const handlePickColor = () => setSamplerOpen(true);


  return (
    <div data-colorway-id={colorway.id} className="w-full sm:flex-none sm:w-[270px] rounded-2xl border border-border bg-bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              title="Remove colorway"
              className="text-sm leading-none text-text-secondary hover:text-danger transition-colors"
            >
              ×
            </button>
          )}
          <span className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">
            Product {index + 1}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasColor ? (
            <>
              <button
                type="button"
                onClick={handlePickColor}
                title="Change color"
                className="h-5 w-5 flex-none rounded-full border-2 border-border transition-colors hover:border-accent"
                style={{ backgroundColor: colorway.hex }}
              />
              <span className="text-[9px] font-mono text-text-secondary">{colorway.hex}</span>
              <button
                type="button"
                onClick={() => onUpdate({ hex: "" })}
                title="Clear color"
                className="text-[10px] leading-none text-text-secondary transition-colors hover:text-danger"
              >
                ×
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handlePickColor}
              className="text-[9px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-text-primary hover:decoration-text-primary"
            >
              + Select color
            </button>
          )}
        </div>
      </div>

      {/* Upload slots */}
      {views.length === 4 && !viewLabels && (
        <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2 text-[10px] leading-relaxed text-text-secondary">
          {FOOTWEAR_VIEW_VERIFICATION_COPY}
        </div>
      )}
      <div className={`grid gap-2 ${views.length === 4 ? "grid-cols-2" : "grid-cols-2"}`}>
        {views.map((slot) => {
          const inputId = `cw-${slot}-${colorway.id}`;
          const preview = getDisplayedPreview(slot);
          return (
            <div key={slot} className="space-y-1">
              <p className="text-[9px] uppercase tracking-wider text-text-secondary">{viewLabels?.[slot] || slot}</p>
              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleViewFile(slot, e.target.files?.[0] || null)}
                onClick={(e) => { e.currentTarget.value = ""; }}
              />
              <div
                onClick={() => {
                  if (preview) {
                    setZoomedPreview(preview);
                  } else {
                    document.getElementById(inputId)?.click();
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleViewFile(slot, e.dataTransfer.files?.[0] || null); }}
                className={`group relative aspect-[4/5] overflow-hidden rounded border bg-bg-secondary transition-colors flex items-center justify-center ${preview ? "border-border cursor-zoom-in hover:border-accent/60" : "border-dashed border-border cursor-pointer hover:border-accent"}`}
              >
                {preview ? (
                  <>
                    <img src={preview} alt={slot} className="h-full w-full object-cover" />
                    <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-1 rounded bg-black/60 px-2 py-1 text-center text-[8px] uppercase tracking-wider text-white opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                      Preview
                    </span>
                  </>
                ) : (
                  <span className="text-[8px] uppercase tracking-wider text-text-secondary/60">Upload</span>
                )}
              </div>
              {preview && (
                <button
                  type="button"
                  onClick={() => handleViewFile(slot, null)}
                  className="w-full border border-border px-2 py-1.5 text-[8px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/5"
                >
                  Clear
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Image zoom modal */}
      {zoomedPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomedPreview(null)}
        >
          <div className="relative max-h-[92vh] w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomedPreview(null)}
              aria-label="Close preview"
              className="absolute right-0 top-0 z-10 h-9 w-9 border border-white/30 bg-black/60 text-xl leading-none text-white hover:bg-black transition-colors"
            >
              ×
            </button>
            <div className="flex max-h-[92vh] items-center justify-center bg-bg-card p-4">
              <img
                src={zoomedPreview}
                alt="Image preview"
                className="max-h-[86vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sizes */}
      <div className="space-y-1.5">
        <p className="text-[9px] uppercase tracking-wider text-text-secondary">{hideSizeInput ? "Stock" : "Sizes"}</p>
        {colorway.sizes.map((sizeRow) => (
          <div key={sizeRow.id} className="flex items-end gap-2">
            {!hideSizeInput && (
              <input
                type="text"
                value={sizeRow.size}
                onChange={(e) => onUpdateSize(sizeRow.id, { size: e.target.value })}
                placeholder="Size"
                className="min-w-0 flex-1 border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors"
              />
            )}
            <input
              type="number"
              min="0"
              value={sizeRow.stock}
              onChange={(e) => onUpdateSize(sizeRow.id, { stock: e.target.value })}
              placeholder="Qty"
              className={`${hideSizeInput ? "flex-1" : "w-12"} flex-none border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors`}
            />
            <button
              type="button"
              onClick={() => onRemoveSize(sizeRow.id)}
              disabled={colorway.sizes.length === 1}
              className="flex-none pb-1.5 text-sm leading-none text-text-secondary hover:text-danger transition-colors disabled:opacity-30"
            >
              ×
            </button>
          </div>
        ))}
        {!hideSizeInput && (
          <button
            type="button"
            onClick={onAddSize}
            className="text-[9px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-text-primary hover:decoration-text-primary"
          >
            + Add size
          </button>
        )}
        {isThrift && colorway.sizes.map((sizeRow) => (
          <div key={sizeRow.id} className="space-y-0.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[8px] uppercase tracking-wider text-text-secondary">Condition</span>
              <span className="text-[8px] text-text-secondary">{sizeRow.conditionScore}/10 · {getConditionStatusFromScore(Number(sizeRow.conditionScore)).toUpperCase()}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={sizeRow.conditionScore}
              onChange={(e) => !conditionLocked && onUpdateSize(sizeRow.id, { conditionScore: e.target.value })}
              disabled={conditionLocked}
              className="w-full accent-accent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        ))}
      </div>

      {/* Enhance */}
      <div className="space-y-1.5 border-t border-border pt-3">
        {colorway.enhanceError && (
          <div className="border border-[#BD3100] bg-[#faf3f2] px-3 py-2 text-[10px] text-[#BD3100]">
            {colorway.enhanceError}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          {!hasEnhancedResults && canEnhance && !isUsingOriginal && colorway.enhanceStatus !== "processing" && (
            <button
              type="button"
              onClick={() => onUpdate({ enhanceStatus: "original" })}
              className="text-[8px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-text-primary hover:decoration-text-primary"
            >
              Use original
            </button>
          )}
          {hasEnhancedResults && !isUsingOriginal && canEnhance && (
            <button
              type="button"
              onClick={() => onUpdate({ enhanceStatus: "original" })}
              className="text-[8px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-text-primary hover:decoration-text-primary"
            >
              Use original
            </button>
          )}
          {hasEnhancedResults && isUsingOriginal && canEnhance && (
            <button
              type="button"
              onClick={() => onUpdate({ enhanceStatus: "completed" })}
              className="text-[8px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-text-primary hover:decoration-text-primary"
            >
              Use enhanced
            </button>
          )}
          {hasEnhancedResults && canEnhance && colorway.enhanceStatus !== "processing" && (
            <button
              type="button"
              onClick={onEnhance}
              className="text-[8px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-text-primary hover:decoration-text-primary"
            >
              Re-enhance
            </button>
          )}
          <button
            type="button"
            onClick={colorway.enhanceStatus === "processing" || hasEnhancedResults ? undefined : onEnhance}
            disabled={!canEnhance || colorway.enhanceStatus === "processing" || hasEnhancedResults}
            className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-bg-primary disabled:opacity-50 transition-opacity"
          >
            {colorway.enhanceStatus === "processing" && (
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-bg-primary/40 border-t-bg-primary" />
            )}
            {hasEnhancedResults
              ? isUsingOriginal
                ? "Original"
                : "Enhanced"
              : colorway.enhanceStatus === "processing"
              ? "Enhancing..."
              : "Enhance"}
          </button>
        </div>
      </div>

      {showGenerationPanel && (colorway.enhanceStatus === "completed" || colorway.enhanceStatus === "original" || colorway.generateStatus !== "idle") && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1.5">
            <p className="text-[9px] uppercase tracking-wider text-text-secondary">Model Generation</p>
            {companionZones && companionZones.length > 0 ? (
              <div className="space-y-3">
                {companionZones.includes("top") && (
                  <div className="space-y-2">
                    <p className="text-[9px] uppercase tracking-wider text-text-secondary">Top</p>
                    <select
                      value={colorway.companionTopType}
                      onChange={(e) => onUpdate({ companionTopType: e.target.value })}
                      className="w-full border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors"
                    >
                      <option value="">Select type</option>
                      {companionTypeOptions?.top.map((cat) => (
                        <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                      ))}
                    </select>
                    <CompanionColorPicker
                      color={colorway.companionTopColor}
                      onSelect={(color) => onUpdate({ companionTopColor: color })}
                      title="Pick a custom top color"
                    />
                  </div>
                )}
                {companionZones.includes("bottom") && (
                  <div className="space-y-2">
                    <p className="text-[9px] uppercase tracking-wider text-text-secondary">Bottom</p>
                    <select
                      value={colorway.companionBottomType}
                      onChange={(e) => onUpdate({ companionBottomType: e.target.value })}
                      className="w-full border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors"
                    >
                      <option value="">Select type</option>
                      {companionTypeOptions?.bottom.map((cat) => (
                        <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                      ))}
                    </select>
                    <CompanionColorPicker
                      color={colorway.companionBottomColor}
                      onSelect={(color) => onUpdate({ companionBottomColor: color })}
                      title="Pick a custom bottom color"
                    />
                  </div>
                )}
                {companionZones.includes("footwear") && (
                  <div className="space-y-2">
                    <p className="text-[9px] uppercase tracking-wider text-text-secondary">Footwear</p>
                    <select
                      value={colorway.companionFootwearType}
                      onChange={(e) => onUpdate({ companionFootwearType: e.target.value })}
                      className="w-full border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors"
                    >
                      <option value="">Select type</option>
                      {companionTypeOptions?.footwear.map((cat) => (
                        <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                      ))}
                    </select>
                    <CompanionColorPicker
                      color={colorway.companionFootwearColor}
                      onSelect={(color) => onUpdate({ companionFootwearColor: color })}
                      title="Pick a custom footwear color"
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-text-secondary">No companion zones available for this category.</p>
            )}
            {colorway.additionalInstructions ? (
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] uppercase tracking-wider text-text-secondary">Additional instructions</p>
                  <button
                    type="button"
                    onClick={() => onUpdate({ additionalInstructions: "" })}
                    className="text-[8px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-danger hover:decoration-danger"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={colorway.additionalInstructions}
                  onChange={(e) => onUpdate({ additionalInstructions: e.target.value })}
                  rows={3}
                  placeholder="e.g. emphasize a relaxed pose, outdoor sunset lighting, etc."
                  className="w-full border border-border bg-transparent px-2 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors resize-y"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onUpdate({ additionalInstructions: " " })}
                className="text-[9px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-text-primary hover:decoration-text-primary"
              >
                + Add custom instructions
              </button>
            )}
          </div>

          {colorway.generatedImages.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {colorway.generatedImages.map((img, i) => (
                <div key={i} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setZoomedPreview(img.url)}
                    className="group relative aspect-[4/5] overflow-hidden rounded border border-border bg-bg-secondary cursor-zoom-in transition-colors hover:border-accent/60"
                  >
                    <img src={img.url} alt={`Generated ${i + 1}`} className="h-full w-full object-cover" />
                    <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-1 rounded bg-black/60 px-2 py-1 text-center text-[8px] uppercase tracking-wider text-white opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                      Preview
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate({ generatedImages: [], generateStatus: "idle", generateError: "", generateJobId: "" })}
                    className="w-full border border-border px-2 py-1.5 text-[8px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/5"
                  >
                    Clear
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {colorway.generateStatus === "completed" && canGenerate && (
              <button
                type="button"
                onClick={onGenerate}
                className="text-[8px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-text-primary hover:decoration-text-primary"
              >
                Regenerate
              </button>
            )}
            <button
              type="button"
              onClick={canGenerate && colorway.generateStatus !== "completed" ? onGenerate : undefined}
              disabled={!canGenerate || colorway.generateStatus === "processing" || colorway.generateStatus === "completed"}
              className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-bg-primary disabled:opacity-50 transition-opacity"
            >
              {colorway.generateStatus === "processing" && (
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-bg-primary/40 border-t-bg-primary" />
              )}
              {colorway.generateStatus === "completed"
                ? "Generated"
                : colorway.generateStatus === "processing"
                ? "Generating..."
                : "Generate"}
            </button>
          </div>
        </div>
      )}
      <ImageColorSampler
        open={samplerOpen}
        onClose={() => setSamplerOpen(false)}
        onPick={(hex) => onUpdate({ hex: hex.toUpperCase() })}
        sources={samplerSources}
        title={`Pick color — Product ${index + 1}`}
      />
    </div>
  );
}

export default function NewProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [productMediaStatus, setProductMediaStatus] = useState<ProductMediaStatus>("idle");
  const [productMediaJobId, setProductMediaJobId] = useState("");
  const [productMediaError, setProductMediaError] = useState("");
  const [showProductMediaSection, setShowProductMediaSection] = useState(false);
  type SectionErrorKey = "basics" | "media" | "model" | "colorways" | "general";
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<SectionErrorKey, string>>>({});
  const setError = (msg: string, section: SectionErrorKey = "general") => {
    if (!msg) { setSectionErrors({}); return; }
    setSectionErrors({ [section]: msg });
  };
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [userStoreName, setUserStoreName] = useState("");
  const [userStoreType, setUserStoreType] = useState<"thrift" | "retail" | "">("");
  const [authLoaded, setAuthLoaded] = useState(false);
  const [colorways, setColorways] = useState<Colorway[]>(() => [createEmptyColorway()]);
  const generationAbortRef = useRef<AbortController | null>(null);
  const productBasicsRef = useRef<HTMLDivElement | null>(null);
  const colorwaysSectionRef = useRef<HTMLDivElement | null>(null);
  const modelPicturesSectionRef = useRef<HTMLDivElement | null>(null);
  const productMediaSectionRef = useRef<HTMLDivElement | null>(null);
  const categorySelectRef = useRef<HTMLInputElement | null>(null);
  const isStoreOwner = userRole === "store_owner";
  const isRetailStoreOwner = isStoreOwner && userStoreType === "retail";
  const isThriftStoreOwner = isStoreOwner && userStoreType === "thrift";
  const storeOwnerPayoutPrice = getStoreOwnerPayoutPrice(form.price);

  useEffect(() => {
    fetch("/api/categories", withAuthRequest())
      .then((r) => r.json())
      .then((d) => {
        const cats = d.categories || [];
        setCategories(cats);
      });

    fetch("/api/models", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setModels(d.models || []));

    fetch("/api/admin/auth/me", withAuthRequest())
      .then((r) => r.json())
      .then((d) => {
        const role = d.user?.role || "";
        const storeName = d.user?.storeName || "";
        const storeType = d.user?.storeType || "";
        setUserRole(role);
        setUserStoreName(storeName);
        setUserStoreType(storeType);
        if (role === "store_owner") {
          setForm((current) => ({
            ...current,
            tag: "NEW",
            newTagDurationDays: "3",
          }));
          return;
        }

        fetch("/api/generated-images", withAuthRequest())
          .then((r) => r.json())
          .then((data) => setGeneratedImages(data.generatedImages || []));
      })
      .catch(() => {})
      .finally(() => setAuthLoaded(true));
  }, []);

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
  const selectedModelGender: "male" | "female" | "child" =
    selectedCategoryGender === "men"
      ? "male"
      : selectedCategoryGender === "women"
        ? "female"
        : "child";
  const generationRequirements = useMemo(
    () => getZoneRequirements(selectedCategoryZone),
    [selectedCategoryZone]
  );
  const usesAccessoryImageWorkflow = useMemo(
    () => hasAccessoryWorkflowCategory(categories, selectedCategorySlug, selectedCategoryZone),
    [categories, selectedCategorySlug, selectedCategoryZone]
  );
  const isSizelessCategory = usesAccessoryImageWorkflow;
  const requiresFourImageInputs = selectedCategoryZone === "footwear" || usesAccessoryImageWorkflow;
  const needsModelSelection = generationRequirements.needsModel;
  const canRunAnyGeneration = needsModelSelection;
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
  const filteredCategoryOptions = useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    if (!term) return categoryOptions;

    const filtered = categoryOptions.filter(
      (category) =>
        category.label.toLowerCase().includes(term) || category.slug.toLowerCase().includes(term)
    );
    const selected = categoryOptions.find((category) => category.slug === selectedCategorySlug);
    if (selected && !filtered.some((category) => category.slug === selected.slug)) {
      filtered.unshift(selected);
    }
    return filtered;
  }, [categoryOptions, categorySearch, selectedCategorySlug]);
  const filteredModels = useMemo(
    () =>
      selectedModelGender === "child"
        ? models
        : models.filter(
            (model) => model.gender === selectedModelGender || model.gender === "child"
          ),
    [models, selectedModelGender]
  );
  const selectedModel = filteredModels.find((model) => model._id === selectedModelId);
  useEffect(() => {
    if (!isStoreOwner || !selectedCategorySlug || form.productType !== "fashion" || !needsModelSelection) return;

    const firstModel = filteredModels[0];
    if (!firstModel) {
      if (selectedModelId) setSelectedModelId("");
      return;
    }

    if (!filteredModels.some((model) => model._id === selectedModelId)) {
      setSelectedModelId(firstModel._id);
    }
  }, [filteredModels, form.productType, isStoreOwner, needsModelSelection, selectedCategorySlug, selectedModelId]);
  const requiredOriginPictureKeys = useMemo(
    () =>
      requiresFourImageInputs
        ? FOUR_IMAGE_VIEWS
        : (["front", "back"] as OriginPictureKey[]),
    [requiresFourImageInputs]
  );
  const hasRequiredOriginPictures = usesAccessoryImageWorkflow
    ? requiredOriginPictureKeys.some((key) => Boolean(generationInputs[key].file || generationInputs[key].previewUrl || form.originPictures[key]))
    : requiredOriginPictureKeys.every((key) => Boolean(generationInputs[key].file || generationInputs[key].previewUrl || form.originPictures[key]));
  const storeOwnerColorwaysReady = useMemo(() => {
    if (!isStoreOwner) return true;
    if (!selectedCategorySlug) return false;
    if (colorways.length === 0) return false;

    return colorways.every((cw) =>
      (usesAccessoryImageWorkflow
        ? FOUR_IMAGE_VIEWS.some((view) => Boolean(cw[`${view}File` as keyof Colorway] || cw[`${view}Preview` as keyof Colorway]))
        : Boolean(cw.frontFile || cw.frontPreview) &&
          Boolean(cw.backFile || cw.backPreview) &&
          (selectedCategoryZone !== "footwear" || (Boolean(cw.leftFile || cw.leftPreview) && Boolean(cw.rightFile || cw.rightPreview)))) &&
      cw.sizes.some((sizeRow) => (isSizelessCategory ? sizeRow.stock.trim() : sizeRow.size.trim() && sizeRow.stock.trim())) &&
      (!needsModelSelection || (cw.hex.trim() ? cw.generateStatus !== "idle" : colorways.length === 1))
    );
  }, [colorways, isSizelessCategory, isStoreOwner, needsModelSelection, selectedCategorySlug, selectedCategoryZone, usesAccessoryImageWorkflow]);
  const storeOwnerBasicsReady = useMemo(() => {
    if (!isStoreOwner) return true;
    if (!form.name.trim()) return false;
    if (!form.price.trim()) return false;
    if (!selectedCategorySlug) return false;
    return true;
  }, [form.name, form.price, isStoreOwner, selectedCategorySlug]);
  const storeOwnerCanAddColorway = useMemo(() => {
    if (!isStoreOwner) return true;
    return colorways.every((cw) => cw.hex.trim());
  }, [colorways, isStoreOwner]);
  const addColorwayLabel = useMemo(
    () => (colorways.some((cw) => !cw.hex.trim()) ? "Select color first" : "Add colorway"),
    [colorways]
  );
  const variantInspectorSources = useMemo<InspectorSource[]>(() => {
    const sources: InspectorSource[] = [];
    colorways.forEach((cw, idx) => {
      const base = `Product ${idx + 1}`;
      const entries: Array<[string, string]> = [
        [cw.enhancedFrontUrl, `${base} front (enhanced)`],
        [cw.enhancedBackUrl, `${base} back (enhanced)`],
        [cw.enhancedLeftUrl, `${base} left (enhanced)`],
        [cw.enhancedRightUrl, `${base} right (enhanced)`],
        [cw.frontPreview, `${base} front`],
        [cw.backPreview, `${base} back`],
        [cw.leftPreview, `${base} left`],
        [cw.rightPreview, `${base} right`],
      ];
      for (const [url, label] of entries) {
        if (url) sources.push({ url, label });
      }
    });
    return sources;
  }, [colorways]);
  const shouldShowModelPictures = Boolean(selectedCategorySlug) && canRunAnyGeneration;
  const storeOwnerGenerationReady = useMemo(() => {
    if (!isStoreOwner) return true;
    if (!selectedCategorySlug) return false;
    if (colorways.length === 0) return false;
    if (!needsModelSelection) return true;

    return colorways.every((cw) => cw.generateStatus === "completed");
  }, [colorways, isStoreOwner, needsModelSelection, selectedCategorySlug]);
  const hasRequiredEnhanceInputs = Boolean(selectedParentSlug) && form.productType === "fashion";
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
        kind: "generated" as const,
      })),
      ...(generationInputs.front.previewUrl
        ? [{ label: "Enhanced front", url: generationInputs.front.previewUrl, kind: "enhanced" as const, slot: "front" as const }]
        : []),
      ...(generationInputs.back.previewUrl
        ? [{ label: "Enhanced back", url: generationInputs.back.previewUrl, kind: "enhanced" as const, slot: "back" as const }]
        : []),
      ...(generationInputs.left.previewUrl
        ? [{ label: usesAccessoryImageWorkflow ? "Enhanced image 3" : "Enhanced left", url: generationInputs.left.previewUrl, kind: "enhanced" as const, slot: "left" as const }]
        : []),
      ...(generationInputs.right.previewUrl
        ? [{ label: usesAccessoryImageWorkflow ? "Enhanced image 4" : "Enhanced right", url: generationInputs.right.previewUrl, kind: "enhanced" as const, slot: "right" as const }]
        : []),
    ],
    [
      generatedModelMedia,
      generationInputs.front.previewUrl,
      generationInputs.back.previewUrl,
      generationInputs.left.previewUrl,
      generationInputs.right.previewUrl,
      usesAccessoryImageWorkflow,
    ]
  );

  const scrollToElement = (element: HTMLElement | null | undefined) => {
    if (!element) return false;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  };

  const scrollToColorwayCard = (colorwayId: string | undefined) => {
    if (!colorwayId) return false;
    return scrollToElement(document.querySelector(`[data-colorway-id="${colorwayId}"]`) as HTMLElement | null);
  };

  const updateColorway = (id: string, patch: Partial<Colorway>) => {
    setColorways((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const applyColorwayEnhancementFailure = (colorwayId: string, error: string) => {
    updateColorway(colorwayId, {
      enhanceStatus: "failed",
      enhanceError: error,
      enhanceJobId: "",
    });
  };

  const applyColorwayEnhancementCompletion = async (
    colorwayId: string,
    images: Record<string, string> | undefined
  ) => {
    const frontUrl = images?.front || "";
    const backUrl = images?.back || "";
    const leftUrl = images?.left || "";
    const rightUrl = images?.right || "";
    const [frontFile, backFile, leftFile, rightFile] = await Promise.all([
      frontUrl ? imageUrlToFile(frontUrl, "front-enhanced") : Promise.resolve(null),
      backUrl ? imageUrlToFile(backUrl, "back-enhanced") : Promise.resolve(null),
      leftUrl ? imageUrlToFile(leftUrl, "left-enhanced") : Promise.resolve(null),
      rightUrl ? imageUrlToFile(rightUrl, "right-enhanced") : Promise.resolve(null),
    ]);

    updateColorway(colorwayId, {
      enhanceStatus: "completed",
      enhanceJobId: "",
      enhanceError: "",
      enhancedFrontUrl: frontUrl,
      enhancedBackUrl: backUrl,
      enhancedLeftUrl: leftUrl,
      enhancedRightUrl: rightUrl,
      enhancedFrontFile: frontFile,
      enhancedBackFile: backFile,
      enhancedLeftFile: leftFile,
      enhancedRightFile: rightFile,
    });
  };

  const applyColorwayGenerationFailure = (colorwayId: string, error: string) => {
    updateColorway(colorwayId, {
      generateStatus: "failed",
      generateError: error,
      generateJobId: "",
    });
  };

  const applyColorwayGenerationCompletion = async (
    colorwayId: string,
    viewList: string[],
    images: Record<string, string> | undefined
  ) => {
    const results = await Promise.all(
      viewList.map(async (view, i) => {
        const image = images?.[view];
        if (!image) return null;
        const file = await generatedResultToFile(image, i);
        return { url: URL.createObjectURL(file), file };
      })
    );

    updateColorway(colorwayId, {
      generateStatus: "completed",
      generateJobId: "",
      generateError: "",
      generatedImages: results.filter((r): r is { url: string; file: File } => r !== null),
    });
  };

  const addColorway = () =>
    setColorways((prev) => [...prev, createEmptyColorway()]);
  const handleAddColorway = () => {
    if (isStoreOwner && !storeOwnerCanAddColorway) return;
    const blankColorway = colorways.find((cw) => !cw.hex.trim());
    if (blankColorway) {
      setError("Please assign a color to the current colorway before adding another.", "colorways");
      scrollToColorwayCard(blankColorway.id);
      return;
    }
    addColorway();
  };

  const removeColorway = (id: string) => {
    setColorways((prev) => (prev.length === 1 ? prev : prev.filter((c) => c.id !== id)));
  };

  const addSizeRow = (colorwayId: string) => {
    setColorways((prev) =>
      prev.map((c) =>
        c.id === colorwayId
          ? { ...c, sizes: [...c.sizes, { id: generateId(), size: "", stock: "", conditionScore: "9" }] }
          : c
      )
    );
  };

  const removeSizeRow = (colorwayId: string, sizeId: string) => {
    setColorways((prev) =>
      prev.map((c) =>
        c.id === colorwayId
          ? { ...c, sizes: c.sizes.length === 1 ? c.sizes : c.sizes.filter((s) => s.id !== sizeId) }
          : c
      )
    );
  };

  const updateSizeRow = (colorwayId: string, sizeId: string, patch: Partial<SizeRow>) => {
    setColorways((prev) =>
      prev.map((c) =>
        c.id === colorwayId
          ? { ...c, sizes: c.sizes.map((s) => (s.id === sizeId ? { ...s, ...patch } : s)) }
          : c
      )
    );
  };

  const handleEnhanceColorway = async (colorwayId: string) => {
    const cw = colorways.find((c) => c.id === colorwayId);
    if (!cw) return;
    const isShoes = selectedCategoryZone === "footwear";
    const uploadedViews = FOUR_IMAGE_VIEWS.filter((view) => Boolean(cw[`${view}File` as keyof Colorway]));
    const frontSrc = cw.frontFile;
    const backSrc = cw.backFile;
    if (usesAccessoryImageWorkflow && uploadedViews.length === 0) {
      updateColorway(colorwayId, {
        enhanceStatus: "failed",
        enhanceError: "Please upload at least one image first.",
      });
      return;
    }
    if (!usesAccessoryImageWorkflow && (!frontSrc || !backSrc)) return;
    if (isShoes && (!cw.leftFile || !cw.rightFile)) {
      updateColorway(colorwayId, {
        enhanceStatus: "failed",
        enhanceError: "Please upload front, back, left, and right images first.",
      });
      return;
    }

    updateColorway(colorwayId, { enhanceStatus: "processing", enhanceError: "", enhanceJobId: "" });

    try {
      if (isShoes) {
        const [front, back, left, right] = await Promise.all([
          compressImageFile(frontSrc!),
          compressImageFile(backSrc!),
          compressImageFile(cw.leftFile!),
          compressImageFile(cw.rightFile!),
        ]);
        const body = new FormData();
        body.append("front", front);
        body.append("back", back);
        body.append("left", left);
        body.append("right", right);
        const res = await fetch("/api/products/enhance-shoes", withAuthRequest({ method: "POST", body }));
        const data = await res.json();
        if (!res.ok) {
          updateColorway(colorwayId, {
            enhanceStatus: "failed",
            enhanceError: data.error || "Unable to start enhancement.",
          });
          return;
        }
        updateColorway(colorwayId, {
          enhanceJobId: data.job_id || "",
          enhanceStatus: data.status || "processing",
        });
      } else if (usesAccessoryImageWorkflow) {
        const compressedEntries = await Promise.all(
          uploadedViews.map(async (view) => [
            view,
            await compressImageFile(cw[`${view}File` as keyof Colorway] as File),
          ] as const)
        );
        const body = new FormData();
        body.append("mode", "accessory");
        compressedEntries.forEach(([view, file]) => body.append(view, file));
        const res = await fetch("/api/products/enhance", withAuthRequest({ method: "POST", body }));
        const data = await res.json();
        if (!res.ok) {
          updateColorway(colorwayId, {
            enhanceStatus: "failed",
            enhanceError: data.error || "Unable to start enhancement.",
          });
          return;
        }
        updateColorway(colorwayId, {
          enhanceJobId: data.job_id || "",
          enhanceStatus: data.status || "processing",
        });
      } else {
        const [front, back] = await Promise.all([
          compressImageFile(frontSrc!),
          compressImageFile(backSrc!),
        ]);
        const body = new FormData();
        body.append("front", front);
        body.append("back", back);
        const res = await fetch("/api/products/enhance", withAuthRequest({ method: "POST", body }));
        const data = await res.json();
        if (!res.ok) {
          updateColorway(colorwayId, {
            enhanceStatus: "failed",
            enhanceError: data.error || "Unable to start enhancement.",
          });
          return;
        }
        updateColorway(colorwayId, {
          enhanceJobId: data.job_id || "",
          enhanceStatus: data.status || "processing",
        });
      }
    } catch {
      updateColorway(colorwayId, { enhanceStatus: "failed", enhanceError: "Network error" });
    }
  };

  useEffect(() => {
    const processing = colorways.filter((c) => c.enhanceStatus === "processing" && c.enhanceJobId);
    if (processing.length === 0) return;

    const unsubscribers = processing.map((cw) =>
      subscribeToJob(cw.enhanceJobId, (update) => {
        if (update.status === "failed") {
          applyColorwayEnhancementFailure(cw.id, update.error || "Enhancement failed.");
          return;
        }
        if (update.status !== "completed") return;
        void applyColorwayEnhancementCompletion(cw.id, update.images);
      })
    );

    return () => {
      unsubscribers.forEach((fn) => fn());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorways]);
 

  const canGenerateColorway = (cw: Colorway) => {
    if (!needsModelSelection) return false;
    if (!selectedModelId) return false;
    const hasFront = Boolean(cw.enhancedFrontFile || cw.enhancedFrontUrl || cw.frontPreview);
    const hasBack = Boolean(cw.enhancedBackFile || cw.enhancedBackUrl || cw.backPreview);
    if (cw.enhanceStatus !== "completed" && cw.enhanceStatus !== "original") return false;
    if (!hasFront || !hasBack) return false;
    if (form.fashionSubtype !== "clothes") return true;
    if (companionZones.includes("top") && (!cw.companionTopType || !cw.companionTopColor)) return false;
    if (companionZones.includes("bottom") && (!cw.companionBottomType || !cw.companionBottomColor)) return false;
    if (companionZones.includes("footwear") && (!cw.companionFootwearType || !cw.companionFootwearColor)) return false;
    return true;
  };

  const handleGenerateColorway = async (colorwayId: string) => {
    const cw = colorways.find((c) => c.id === colorwayId);
    if (!cw || !selectedModelId || !needsModelSelection) return;
    const frontSrc = getColorwayViewInputFile(cw, "front");
    const backSrc = getColorwayViewInputFile(cw, "back");
    if (!frontSrc || !backSrc) return;

    updateColorway(colorwayId, { generateStatus: "processing", generateError: "", generateJobId: "" });

    try {
      const body = new FormData();
      body.append("modelId", selectedModelId);
      body.append("type", "fashion");
      body.append("fashionSubtype", form.fashionSubtype || "clothes");
      body.append("generationTarget", generationRequirements.generationTarget);
      body.append("garmentZone", generationRequirements.generationTarget === "bottom" ? "bottom" : "top");

      if (form.fashionSubtype === "clothes") {
        if (companionZones.includes("top") && cw.companionTopType) {
          body.append("companionTopType", cw.companionTopType);
        }
        if (companionZones.includes("bottom") && cw.companionBottomType) {
          body.append("companionBottomType", cw.companionBottomType);
        }
        if (companionZones.includes("footwear") && cw.companionFootwearType) {
          body.append("footwearType", cw.companionFootwearType);
        }
        if (companionZones.includes("top") && cw.companionTopColor) {
          body.append("topColorName", cw.companionTopColor.name);
          body.append("topColorHex", cw.companionTopColor.hex);
        }
        if (companionZones.includes("bottom") && cw.companionBottomColor) {
          body.append("bottomColorName", cw.companionBottomColor.name);
          body.append("bottomColorHex", cw.companionBottomColor.hex);
        }
        if (companionZones.includes("footwear") && cw.companionFootwearColor) {
          body.append("shoesColorName", cw.companionFootwearColor.name);
          body.append("shoesColorHex", cw.companionFootwearColor.hex);
        }
        if (cw.additionalInstructions && cw.additionalInstructions.trim()) {
          body.append("additionalInstructions", cw.additionalInstructions.trim());
        }
      }

      const [frontFile, backFile] = await Promise.all([
        compressImageFile(frontSrc),
        compressImageFile(backSrc),
      ]);
      body.append("front", frontFile);
      body.append("back", backFile);

      const res = await fetch("/api/products/generate", withAuthRequest({ method: "POST", body }));
      const data = await res.json();
      if (!res.ok) {
        updateColorway(colorwayId, {
          generateStatus: "failed",
          generateError: data.error || "Unable to start generation.",
        });
        return;
      }
      updateColorway(colorwayId, { generateJobId: data.job_id || "", generateStatus: "processing" });
    } catch {
      updateColorway(colorwayId, { generateStatus: "failed", generateError: "Network error" });
    }
  };

  useEffect(() => {
    const processing = colorways.filter((c) => c.generateStatus === "processing" && c.generateJobId);
    if (processing.length === 0) return;

    const unsubscribers = processing.map((cw) =>
      subscribeToJob(cw.generateJobId, (update) => {
        if (update.status === "failed") {
          applyColorwayGenerationFailure(cw.id, update.error || "Generation failed.");
          return;
        }
        if (update.status !== "completed") return;
        const viewList = form.fashionSubtype === "shoes"
          ? ["front", "back", "left", "right"]
          : ["front", "back"];
        void applyColorwayGenerationCompletion(cw.id, viewList, update.images);
      })
    );

    return () => {
      unsubscribers.forEach((fn) => fn());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorways]);

  const handleImageSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newImages = Array.from(files).map((file) => ({
      id: generateId(),
      file,
      url: URL.createObjectURL(file),
      kind: "generated" as const,
    }));

    setImages((current) => [...current, ...newImages]);
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
      setError(`Unable to use this image for the ${key} origin picture.`, "media");
    }
  };

  const importGeneratedImage = async (imageUrl: string) => {
    try {
      setImportingGeneratedImage(imageUrl);
      const blob = await fetch(imageUrl, { cache: "reload" }).then((response) => response.blob());
      const extension = blob.type.split("/")[1] || "png";
      const file = new File([blob], `generated-import-${Date.now()}.${extension}`, {
        type: blob.type || "image/png",
      });

      setImages((current) => [
        ...current,
        {
          id: generateId(),
          file,
          url: URL.createObjectURL(file),
          kind: "generated",
        },
      ]);
    } catch {
      setError("Unable to import generated image.", "media");
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

  const clearEnhancedProductMedia = (key: keyof GenerationInputs) => {
    setGenerationInputs((current) => {
      const next = {
        ...current,
        [key]: createEmptySlot(),
      };
      const hasRemainingEnhanced = requiredOriginPictureKeys.some(
        (originKey) => originKey !== key && Boolean(next[originKey].previewUrl)
      );
      setShowProductMediaSection(generatedModelMedia.length > 0 || hasRemainingEnhanced);
      return next;
    });
    setImages((current) => current.filter((image) => !(image.kind === "source" && image.slot === key)));
    setProductMediaStatus("idle");
    setProductMediaError("");
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
      setError(`Unable to use this image for the ${key} slot.`, "media");
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

  const clearGeneratedModelMedia = (hideProductMedia = false) => {
    const generatedIds = new Set(generatedModelMedia.map((image) => image.id));
    const generatedUrls = new Set(generatedModelMedia.map((image) => image.url));
    const hasEnhancedMedia = requiredOriginPictureKeys.some((key) => Boolean(generationInputs[key].previewUrl));

    setImages((current) =>
      current.filter((image) => !generatedIds.has(image.id) && !generatedUrls.has(image.url))
    );
    setGeneratedModelMedia([]);
    setShowProductMediaSection(hideProductMedia ? false : hasEnhancedMedia);
  };

  const handleRegenerateModel = () => {
    clearGeneratedModelMedia(true);
  };

  const clearProductMediaEnhancement = () => {
    setProductMediaStatus("idle");
    setProductMediaJobId("");
    setProductMediaError("");
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
      setProductMediaError("Please fill the product details before enhancing the images.");
      return;
    }

    const isShoes = form.fashionSubtype === "shoes";

    const uploadedViews = requiredOriginPictureKeys.filter((key) => Boolean(generationInputs[key].file));
    if (usesAccessoryImageWorkflow && uploadedViews.length === 0) {
      setProductMediaError("Please upload at least one image first.");
      return;
    }

    if (!usesAccessoryImageWorkflow && (!generationInputs.front.file || !generationInputs.back.file)) {
      setProductMediaError(isShoes ? "Please upload front, back, left, and right images first." : "Please upload front and back images first.");
      return;
    }

    if (isShoes && (!generationInputs.left.file || !generationInputs.right.file)) {
      setProductMediaError("Please upload front, back, left, and right images first.");
      return;
    }

    setProductMediaError("");
    setProductMediaStatus("processing");

    try {
      if (isShoes) {
        const [frontFile, backFile, leftFile, rightFile] = await Promise.all([
          compressImageFile(generationInputs.front.file!),
          compressImageFile(generationInputs.back.file!),
          compressImageFile(generationInputs.left.file!),
          compressImageFile(generationInputs.right.file!),
        ]);

        const body = new FormData();
        body.append("front", frontFile);
        body.append("back", backFile);
        body.append("left", leftFile);
        body.append("right", rightFile);

        const res = await fetch("/api/products/enhance-shoes", withAuthRequest({ method: "POST", body }));
        const data = await res.json();

        if (!res.ok) {
          setProductMediaStatus("failed");
          setProductMediaError(data.error || "Unable to start shoe image enhancement.");
          return;
        }

        setProductMediaJobId(data.job_id || "");
        setProductMediaStatus(data.status || "processing");
      } else if (usesAccessoryImageWorkflow) {
        const compressedEntries = await Promise.all(
          uploadedViews.map(async (view) => [view, await compressImageFile(generationInputs[view].file!)] as const)
        );
        const body = new FormData();
        body.append("mode", "accessory");
        compressedEntries.forEach(([view, file]) => body.append(view, file));

        const res = await fetch("/api/products/enhance", withAuthRequest({ method: "POST", body }));
        const data = await res.json();

        if (!res.ok) {
          setProductMediaStatus("failed");
          setProductMediaError(data.error || "Unable to start product media enhancement.");
          return;
        }

        setProductMediaJobId(data.job_id || "");
        setProductMediaStatus(data.status || "processing");
      } else {
        const [frontFile, backFile] = await Promise.all([
          compressImageFile(generationInputs.front.file!),
          compressImageFile(generationInputs.back.file!),
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
      }
    } catch {
      setProductMediaStatus("failed");
      setProductMediaError("Network error");
    }
  };

  const getColorwayViewInputFile = (
    colorway: Colorway,
    side: ColorwayView
  ): File | null => {
    const enhancedFileKey = `enhanced${side.charAt(0).toUpperCase()}${side.slice(1)}File` as
      | "enhancedFrontFile"
      | "enhancedBackFile"
      | "enhancedLeftFile"
      | "enhancedRightFile";
    const fileKey = `${side}File` as "frontFile" | "backFile" | "leftFile" | "rightFile";
    if (colorway.enhanceStatus === "original") {
      return colorway[fileKey];
    }

    return colorway[enhancedFileKey] || colorway[fileKey];
  };

  useEffect(() => {
    if (form.productType !== "fashion" || (form.fashionSubtype !== "clothes" && form.fashionSubtype !== "shoes")) {
      clearProductMediaEnhancement();
      return;
    }
  }, [form.productType, form.fashionSubtype]);

  useEffect(() => {
    if (productMediaStatus !== "processing" || !productMediaJobId) return;

    const unsubscribe = subscribeToJob(productMediaJobId, (update) => {
      if (update.status === "failed") {
        setProductMediaStatus("failed");
        setProductMediaError(update.error || "Product media enhancement failed.");
        setProductMediaJobId("");
        return;
      }
      if (update.status !== "completed") return;
      const frontUrl = update.images?.front || "";
      const backUrl = update.images?.back || "";
      const leftUrl = update.images?.left || "";
      const rightUrl = update.images?.right || "";
      Promise.all([
        frontUrl ? imageUrlToFile(frontUrl, "front-enhanced") : Promise.resolve(null),
        backUrl ? imageUrlToFile(backUrl, "back-enhanced") : Promise.resolve(null),
        leftUrl ? imageUrlToFile(leftUrl, "left-enhanced") : Promise.resolve(null),
        rightUrl ? imageUrlToFile(rightUrl, "right-enhanced") : Promise.resolve(null),
      ])
        .then(([frontFile, backFile, leftFile, rightFile]) => {
          if (frontUrl) {
            setForm((current) => ({
              ...current,
              originPictures: { ...current.originPictures, front: frontUrl },
            }));
            setOriginPictureFiles((current) => ({ ...current, front: null }));
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
              originPictures: { ...current.originPictures, back: backUrl },
            }));
            setOriginPictureFiles((current) => ({ ...current, back: null }));
            if (backFile) {
              setGenerationInputs((current) => ({
                ...current,
                back: { file: backFile, previewUrl: backUrl },
              }));
            }
          }
          if (leftUrl) {
            setForm((current) => ({
              ...current,
              originPictures: { ...current.originPictures, left: leftUrl },
            }));
            setOriginPictureFiles((current) => ({ ...current, left: null }));
            if (leftFile) {
              setGenerationInputs((current) => ({
                ...current,
                left: { file: leftFile, previewUrl: leftUrl },
              }));
            }
          }
          if (rightUrl) {
            setForm((current) => ({
              ...current,
              originPictures: { ...current.originPictures, right: rightUrl },
            }));
            setOriginPictureFiles((current) => ({ ...current, right: null }));
            if (rightFile) {
              setGenerationInputs((current) => ({
                ...current,
                right: { file: rightFile, previewUrl: rightUrl },
              }));
            }
          }
        })
        .finally(() => {
          setProductMediaStatus("completed");
          setProductMediaError("");
          setProductMediaJobId("");
        });
    });

    return () => unsubscribe();
  }, [productMediaJobId, productMediaStatus]);

  const handleGenerate = async () => {
    setError("");

    if (!form.fashionSubtype) {
      setError("Please select what you want to generate first.", "model");
      return;
    }

    if (needsModelSelection && form.fashionSubtype === "clothes" && !selectedModelId) {
      setError("Please select a model first.", "model");
      return;
    }

    if (needsModelSelection && form.fashionSubtype === "clothes") {
      if (companionZones.includes("top") && (!companionTopType || !secondaryTopColor)) {
        setError("Please select the top type and color.", "model");
        return;
      }

      if (companionZones.includes("bottom") && (!companionBottomType || !secondaryBottomColor)) {
        setError("Please select the bottom type and color.", "model");
        return;
      }

      if (companionZones.includes("footwear") && (!footwearType || !shoesColor)) {
        setError("Please select the footwear type and color.", "model");
        return;
      }
    }

    if (
      (usesAccessoryImageWorkflow && !requiredOriginPictureKeys.some((key) => Boolean(generationInputs[key].file))) ||
      (!usesAccessoryImageWorkflow &&
        (!generationInputs.front.file ||
          !generationInputs.back.file ||
          (form.fashionSubtype === "shoes" && (!generationInputs.left.file || !generationInputs.right.file))))
    ) {
      setError(
        usesAccessoryImageWorkflow
          ? "Please upload at least one image."
          : form.fashionSubtype === "shoes"
          ? "Please upload front, back, left, and right product images before generating."
          : "Please upload front and back product images before generating.",
        "media"
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
        compressImageFile(generationInputs.front.file!),
        compressImageFile(generationInputs.back.file!),
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
        setError(triggerData.error || "Unable to start generation.", "model");
        return;
      }

      const jobId = triggerData.job_id;

      // 2. Wait for completion via SSE, with one-shot backfill in case the
      // webhook fired before the SSE connection was established.
      let finalImages: Record<string, string> | null = null;
      try {
        const result = await waitForJob(jobId, { signal: controller.signal });
        finalImages = result.images || null;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError((err as Error)?.message || "Generation failed. Please try again.", "model");
        setGenerating(false);
        return;
      }

      // 3. Process completed images
      const viewList = form.fashionSubtype === "shoes" 
        ? ["front", "back", "left", "right"] 
        : ["front", "back"];
      
      const generatedImages = await Promise.all(
        viewList.map(async (view, index) => {
          const image = finalImages?.[view];
          if (!image) return null;
          const file = await generatedResultToFile(image, index);
          return {
            id: generateId(),
            file,
            url: URL.createObjectURL(file),
            kind: "generated" as const,
          };
        })
      );

      type GeneratedProductImage = NonNullable<(typeof generatedImages)[number]>;
      const nextGeneratedImages = generatedImages.filter((img): img is GeneratedProductImage => img !== null);
      setImages((current) => [...current, ...nextGeneratedImages]);
      setGeneratedModelMedia(nextGeneratedImages);
      setShowProductMediaSection(true);
    } catch {
      if (!controller.signal.aborted) {
        setError("Generation request failed.", "model");
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
    setFieldErrors({});
    setLoading(true);

    if (isStoreOwner) {
      const nextFieldErrors: Record<string, string> = {};
      if (!form.name.trim()) nextFieldErrors.name = "Product name is required.";
      if (!form.price.trim()) nextFieldErrors.price = "Price is required.";
      if (!selectedParentSlug) nextFieldErrors.category = "Category is required.";
      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        scrollToElement(productBasicsRef.current);
        setLoading(false);
        return;
      }
      if (colorways.length === 0) {
        setError("Please add at least one colorway.", "colorways");
        scrollToElement(colorwaysSectionRef.current);
        setLoading(false);
        return;
      }
      if (needsModelSelection && !selectedModelId) {
        setError("Please select a model first.", "model");
        scrollToElement(modelPicturesSectionRef.current);
        setLoading(false);
        return;
      }
      if (colorways.length > 1 && colorways.some((cw) => !cw.hex.trim())) {
        setError("Please assign a color to every colorway before adding more than one.", "colorways");
        scrollToColorwayCard(colorways.find((cw) => !cw.hex.trim())?.id);
        setLoading(false);
        return;
      }
      if (needsModelSelection) {
        const pendingGeneration = colorways.find((cw) => cw.hex.trim() && cw.generateStatus === "idle");
        if (pendingGeneration) {
          setError("Please complete model generation for each colorway before creating the product.", "colorways");
          scrollToColorwayCard(pendingGeneration.id);
          setLoading(false);
          return;
        }
        const incompleteGeneration = colorways.find((cw) => cw.generateStatus !== "completed");
        if (incompleteGeneration) {
          setError("Please complete model generation for each colorway before creating the product.", "colorways");
          scrollToColorwayCard(incompleteGeneration.id);
          setLoading(false);
          return;
        }
      }
      for (const cw of colorways) {
        if (usesAccessoryImageWorkflow) {
          if (!FOUR_IMAGE_VIEWS.some((view) => Boolean(cw[`${view}File` as keyof Colorway] || cw[`${view}Preview` as keyof Colorway]))) {
            setError("Please upload at least one image for each product.", "colorways");
            scrollToColorwayCard(cw.id);
            setLoading(false);
            return;
          }
        } else {
          if (!cw.frontFile && !cw.frontPreview) {
            setError("Please upload a front image for each colorway.", "colorways");
            scrollToColorwayCard(cw.id);
            setLoading(false);
            return;
          }
          if (!cw.backFile && !cw.backPreview) {
            setError("Please upload a back image for each colorway.", "colorways");
            scrollToColorwayCard(cw.id);
            setLoading(false);
            return;
          }
          if (selectedCategoryZone === "footwear" && (!(cw.leftFile || cw.leftPreview) || !(cw.rightFile || cw.rightPreview))) {
            setError("Please upload front, back, left, and right images for each colorway.", "colorways");
            scrollToColorwayCard(cw.id);
            setLoading(false);
            return;
          }
        }
        if (cw.sizes.filter((s) => (isSizelessCategory ? s.stock.trim() : s.size.trim() && s.stock.trim())).length === 0) {
          setError(isSizelessCategory ? "Please add stock for each product." : "Please add at least one size and stock for each colorway.", "colorways");
          scrollToColorwayCard(cw.id);
          setLoading(false);
          return;
        }
      }
      try {
        const productCategories = [
          selectedParentSlug,
          selectedChildSlug,
          selectedGrandchildSlug,
          selectedGreatGrandchildSlug,
        ].filter(Boolean);

        type VariantEntry = { size: string; color: string; stock: number; conditionScore: number };
        const allVariants: VariantEntry[] = [];
        for (const cw of colorways) {
          for (const s of cw.sizes.filter((s) => (isSizelessCategory ? s.stock.trim() : s.size.trim() && s.stock.trim()))) {
            const size = isSizelessCategory ? "" : s.size.trim();
            const color = normalizeHex(cw.hex);
            allVariants.push({
              size,
              color,
              stock: Math.max(0, Number(s.stock || 0)),
              conditionScore: Math.max(1, Math.min(10, Number(s.conditionScore || 9))),
            });
          }
        }

        const totalStock = allVariants.reduce((sum, v) => sum + v.stock, 0);

        // Build per-color image-index map first, then attach indices to each variant.
        const imageFiles: File[] = [];
        const imagesByHex: Record<string, number[]> = {};
        for (const cw of colorways) {
          const hex = cw.hex.trim().toLowerCase();
          const indices: number[] = [];
          for (const gi of cw.generatedImages) {
            if (gi.file) { indices.push(imageFiles.length); imageFiles.push(gi.file); }
          }
          for (const view of requiredOriginPictureKeys) {
            const imageFile = getColorwayViewInputFile(cw, view);
            if (imageFile) { indices.push(imageFiles.length); imageFiles.push(imageFile); }
          }
          if (indices.length > 0) imagesByHex[hex] = indices;
        }

        const variantsPayload = allVariants.map((v) => {
          const hex = normalizeHex(v.color);
          return {
            size: v.size,
            color: hex || null,
            fullStock: v.stock,
            conditionScore: v.conditionScore,
            images: imagesByHex[hex] || [],
          };
        });

        const body = new FormData();
        body.append("name", form.name);
        body.append("price", form.price);
        body.append("brand", form.brand);
        body.append("reference", form.reference);
        body.append("description", "");
        body.append("tag", "NEW");
        body.append("newTagDurationDays", "3");
        body.append("productType", "fashion");
        body.append("fashionSubtype", form.fashionSubtype || "clothes");
        body.append("stock", String(totalStock));
        body.append("fullStock", String(totalStock));
        body.append("categories", JSON.stringify(productCategories));
        body.append("variants", JSON.stringify(variantsPayload));
        body.append("mainImageIndex", "0");
        if (selectedModelId) body.append("modelId", selectedModelId);
        const companionSettingsPayload: Record<string, object> = {};
        for (const cw of colorways) {
          const colorKey = cw.hex.trim() || "__global__";
          companionSettingsPayload[colorKey] = {
            topType: cw.companionTopType,
            topColor: cw.companionTopColor,
            bottomType: cw.companionBottomType,
            bottomColor: cw.companionBottomColor,
            footwearType: cw.companionFootwearType,
            footwearColor: cw.companionFootwearColor,
            additionalInstructions: (cw.additionalInstructions || "").trim(),
          };
        }
        body.append("companionSettings", JSON.stringify(companionSettingsPayload));

        const compressedImages = await Promise.all(imageFiles.map((f) => compressImageFile(f)));
        compressedImages.forEach((f) => body.append("images", f));

        const firstCw = colorways[0];
        const frontOrigin = firstCw.frontFile;
        const backOrigin = firstCw.backFile;
        const leftOrigin = firstCw.leftFile;
        const rightOrigin = firstCw.rightFile;
        if (frontOrigin) body.append("originPictureFrontFile", await compressImageFile(frontOrigin));
        if (backOrigin) body.append("originPictureBackFile", await compressImageFile(backOrigin));
        if (leftOrigin) body.append("originPictureLeftFile", await compressImageFile(leftOrigin));
        if (rightOrigin) body.append("originPictureRightFile", await compressImageFile(rightOrigin));

      const res = await fetch("/api/products", withAuthRequest({ method: "POST", body }));
      if (!res.ok) {
        const d = await res.json();
        const message = d.error || "Unable to create product.";
        const isBasicsError = res.status === 409 || /reference must be unique within the same store/i.test(message);
        setError(message, isBasicsError ? "basics" : "general");
        if (isBasicsError) scrollToElement(productBasicsRef.current);
        setLoading(false);
        return;
      }
        router.push("/dashboard/products");
      } catch {
        setError("Network error", "general");
        setLoading(false);
      }
      return;
    }

    setLoading(false);
  };

  if (!authLoaded) {
    return <p className="text-xs text-text-secondary animate-pulse">Loading product setup...</p>;
  }

  if (userRole === "admin") {
    return (
      <div className="rounded-2xl border border-border bg-bg-card p-8 space-y-4 max-w-2xl">
        <p className="text-xs uppercase tracking-[0.22em] text-text-secondary">Admin Access</p>
        <h1 className="text-xl font-semibold tracking-wide">Products are read-only</h1>
        <p className="text-sm text-text-secondary">
          Admin accounts can review products, approve or reject them, and manage visibility.
          Only store owners can add new products.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard/products")}
            className="bg-black text-white px-4 py-2 text-xs font-medium tracking-wide uppercase"
          >
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  if (isStoreOwner) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">Add New Product</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {sectionErrors.general && (
            <div className="border border-[#8B3520]/40 bg-[#8B3520]/5 px-4 py-3 text-xs text-[#8B3520]">
              {sectionErrors.general}
            </div>
          )}

          <div ref={productBasicsRef}>
            <SectionCard
              title="Product Basics"
              description="Set the core product info first, then add colorways and other variants."
              error={sectionErrors.basics}
            >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="sm:col-span-2 xl:col-span-3">
                <FieldLabel>Product Name</FieldLabel>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-line"
                  placeholder="e.g. Oversized Linen Shirt"
                />
                <FieldError message={fieldErrors.name} />
              </div>
              {isStoreOwner && (
                <div>
                  <FieldLabel>Store</FieldLabel>
                  <input
                    type="text"
                    readOnly
                    value={userStoreName}
                    className="input-line opacity-60 cursor-not-allowed"
                  />
                </div>
              )}
              {isStoreOwner && (
                <div>
                  <FieldLabel>Brand</FieldLabel>
                  <input
                    type="text"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    className="input-line"
                    placeholder="e.g. Zara (optional)"
                  />
                  <FieldError message={fieldErrors.brand} />
                </div>
              )}
              <div>
                <FieldLabel>Reference</FieldLabel>
                <input
                  type="text"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  className="input-line"
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
                  className="input-line"
                  placeholder="0.00"
                />
                {storeOwnerPayoutPrice && (
                  <div className="mt-2 border border-border bg-bg-secondary px-3 py-2 text-[11px] text-text-secondary">
                    <div className="flex items-center justify-between gap-3">
                      <span>You receive after commission</span>
                      <span className="font-semibold text-text-primary">{storeOwnerPayoutPrice} TND</span>
                    </div>
                  </div>
                )}
                <FieldError message={fieldErrors.price} />
              </div>
              <div className={isThriftStoreOwner ? "" : "sm:col-span-2 xl:col-span-3"}>
                <FieldLabel>Category</FieldLabel>
                <div className="relative">
                  <input
                    ref={categorySelectRef}
                    type="text"
                    value={categorySearch}
                    onChange={(e) => {
                      setCategorySearch(e.target.value);
                      setCategoryDropdownOpen(true);
                      if (!e.target.value.trim()) {
                        setSelectedParentSlug("");
                        setSelectedChildSlug("");
                        setSelectedGrandchildSlug("");
                        setSelectedGreatGrandchildSlug("");
                      }
                    }}
                    onFocus={() => setCategoryDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setCategoryDropdownOpen(false), 150)}
                    placeholder="Type to search categories..."
                    className="input-line"
                  />
                  {categoryDropdownOpen && filteredCategoryOptions.length > 0 && (
                    <div className="absolute z-20 mt-0.5 w-full border border-border bg-bg-card shadow-lg max-h-52 overflow-y-auto">
                      {filteredCategoryOptions.map((cat) => (
                        <button
                          key={cat.slug}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            const path = getCategoryPath(categories, [cat.slug]);
                            setSelectedParentSlug(path.parent);
                            setSelectedChildSlug(path.child);
                            setSelectedGrandchildSlug(path.grandchild);
                            setSelectedGreatGrandchildSlug(path.greatGrandchild || "");
                            setCategorySearch(cat.label);
                            setCategoryDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-bg-hover ${selectedCategorySlug === cat.slug ? "text-accent" : "text-text-primary"}`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <FieldError message={fieldErrors.category} />
              </div>
            </div>
            </SectionCard>
          </div>

          {shouldShowModelPictures && (
            <div ref={modelPicturesSectionRef}>
              <SectionCard
                title="Model Pictures"
                description="Choose one model for all colorways, then configure each colorway's companion outfit and generate."
                error={sectionErrors.model}
              >
                {/* Shared model selector */}
                <div className="space-y-2">
                  <div className="flex gap-3 overflow-x-auto pb-2">
                        {filteredModels.map((model) => {
                          const active = selectedModelId === model._id;
                          return (
                            <button
                              key={model._id}
                              type="button"
                              onClick={() => setSelectedModelId(model._id)}
                              className={`flex-none w-[288px] overflow-hidden rounded border text-left transition-colors ${
                                active
                                  ? "border-accent bg-accent/5 ring-1 ring-accent/40"
                                  : "border-border hover:border-accent"
                              }`}
                            >
                              <div className="aspect-[4/5] bg-bg-secondary">
                                <img
                                  src={model.frontImage || model.images?.[0] || ""}
                                  alt={model.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-2 p-1.5">
                                <p className="truncate text-[9px] font-medium">{model.name}</p>
                                {active && (
                                  <span className="flex-none text-[8px] uppercase tracking-wider text-accent">
                                    Selected
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                  </div>
                </div>

                {/* Per-colorway generation cards — only shown once a model is picked */}
                {selectedModelId && !isStoreOwner && needsModelSelection && (
                  <div className="mt-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:overflow-x-auto pb-2">
                    {colorways.map((cw, cwIndex) => (
                      <ColorwayGenerationCard
                        key={cw.id}
                        colorway={cw}
                        index={cwIndex}
                        companionZones={companionZones}
                        companionTypeOptions={companionTypeOptions}
                        onUpdate={(patch) => updateColorway(cw.id, patch)}
                        canGenerate={canGenerateColorway(cw)}
                        onGenerate={() => {
                          if (!canGenerateColorway(cw)) return;
                          void handleGenerateColorway(cw.id);
                        }}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {selectedCategorySlug && (
            <div ref={colorwaysSectionRef}>
              <SectionCard
                title="Colorways"
                description="Each colorway is a color variant with its own images and sizes. Use the eyedropper on the swatch to pick the color directly from the uploaded photo."
                error={sectionErrors.colorways}
              >
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:overflow-x-auto pb-2">
                {colorways.map((cw, cwIndex) => (
                  <ColorwayCard
                    key={cw.id}
                    colorway={cw}
                    index={cwIndex}
                    canRemove={colorways.length > 1}
                    isThrift={isStoreOwner}
                    conditionLocked={Boolean(cw.hex.trim())}
                    requiredViews={requiresFourImageInputs ? ["front", "back", "left", "right"] : ["front", "back"]}
                    viewLabels={usesAccessoryImageWorkflow ? ACCESSORY_VIEW_LABELS : undefined}
                    enhanceRequiresAllViews={!usesAccessoryImageWorkflow}
                    hideSizeInput={isSizelessCategory}
                    onRemove={() => removeColorway(cw.id)}
                  onUpdate={(patch) => updateColorway(cw.id, patch)}
                  onEnhance={() => void handleEnhanceColorway(cw.id)}
                  showGenerationPanel={isStoreOwner && needsModelSelection}
                  companionZones={companionZones}
                  companionTypeOptions={companionTypeOptions}
                  canGenerate={canGenerateColorway(cw)}
                  onGenerate={() => { if (!canGenerateColorway(cw)) return; void handleGenerateColorway(cw.id); }}
                  onAddSize={() => addSizeRow(cw.id)}
                  onRemoveSize={(sizeId) => removeSizeRow(cw.id, sizeId)}
                  onUpdateSize={(sizeId, patch) => updateSizeRow(cw.id, sizeId, patch)}
                />
                ))}
                <button
                  type="button"
                  onClick={handleAddColorway}
                  disabled={!storeOwnerCanAddColorway}
                  className="group mt-0 flex h-10 flex-none items-center gap-2 rounded border border-dashed border-border px-3 text-lg text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-secondary"
                >
                  <span className="leading-none">+</span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-text-secondary transition-colors group-hover:text-accent">
                    {addColorwayLabel}
                  </span>
                </button>
              </div>
              </SectionCard>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="bg-text-primary text-bg-primary px-8 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50"
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

  return null;
}
