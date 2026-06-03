"use client";

import { useEffect, useMemo, useRef, useState, use, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { getConditionStatusFromScore } from "@/lib/productCondition";
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
  getSharedLeaves,
  getZoneRequirements,
  mapLeafAcrossGenders,
} from "@/lib/categoryClassification";
import {
  normalizeHex,
  parseApiVariants,
  toOutgoingVariant,
  type OutgoingVariant,
  type VariantRow,
} from "@/lib/adminVariants";

interface Category {
  _id: string;
  name: string;
  slug: string;
  isActive?: boolean;
  parentSlug?: string | null;
}

interface ProductImage {
  id?: string;
  url: string;
  isMain?: boolean;
  isPublic?: boolean;
  source?: string;
  color?: string | null;
  sourceKey?: string;
  gender?: "men" | "women" | null;
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
  enhancedOtherImages: Array<{ url: string; file: File | null }>;
  sizes: SizeRow[];
  generateStatus: ColorwayEnhanceStatus;
  generateJobId: string;
  /** Second generation job for unisex (the female-model pass). */
  altGenerateJobId: string;
  generateError: string;
  otherImages: Array<{ url: string; file: File | null }>;
  generatedImages: Array<{ url: string; file: File | null; gender?: "men" | "women" | null }>;
  publicImageOrder: Record<string, string>;
  companionTopType: string;
  companionBottomType: string;
  companionFootwearType: string;
  companionTopColor: PaletteColor | null;
  companionBottomColor: PaletteColor | null;
  companionFootwearColor: PaletteColor | null;
  additionalInstructions: string;
  generationMode: "auto" | "manual";
};

function createEmptyColorway(hex = ""): Colorway {
  return {
    id: generateId(),
    hex,
    frontFile: null, frontPreview: "",
    backFile: null, backPreview: "",
    leftFile: null, leftPreview: "",
    rightFile: null, rightPreview: "",
    enhanceStatus: "idle", enhanceJobId: "", enhanceError: "",
    enhancedFrontUrl: "", enhancedBackUrl: "",
    enhancedLeftUrl: "", enhancedRightUrl: "",
    enhancedFrontFile: null, enhancedBackFile: null,
    enhancedLeftFile: null, enhancedRightFile: null,
    enhancedOtherImages: [],
    sizes: [{ id: generateId(), size: "", stock: "", conditionScore: "10" }],
    generateStatus: "idle", generateJobId: "", altGenerateJobId: "", generateError: "",
    otherImages: [],
    generatedImages: [],
    publicImageOrder: {},
    companionTopType: "", companionBottomType: "", companionFootwearType: "",
    companionTopColor: null, companionBottomColor: null, companionFootwearColor: null,
    additionalInstructions: "",
    generationMode: "auto",
  };
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

function ColorwayGenerationCard({
  colorway, index, companionZones, companionTypeOptions, onUpdate, onGenerate, canGenerate,
}: {
  colorway: Colorway; index: number;
  companionZones: CompanionZone[];
  companionTypeOptions: { top: { slug: string; name: string }[]; bottom: { slug: string; name: string }[]; footwear: { slug: string; name: string }[] };
  onUpdate: (patch: Partial<Colorway>) => void;
  onGenerate: () => void;
  canGenerate: boolean;
}) {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const hasColor = Boolean(colorway.hex.trim());
  const enhancedFrontPreview = colorway.enhancedFrontUrl || colorway.frontPreview;
  const enhancedBackPreview = colorway.enhancedBackUrl || colorway.backPreview;
  return (
    <div data-colorway-id={colorway.id} className="w-full sm:flex-none sm:w-[270px] rounded-2xl border border-border bg-bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span
          className={`h-4 w-4 flex-none border border-border/60 ${hasColor ? "rounded-full" : "rounded border-dashed bg-transparent"}`}
          style={hasColor ? { backgroundColor: colorway.hex } : undefined}
        />
        <span className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Product {index + 1}</span>
        <span className="ml-auto text-[9px] font-mono text-text-secondary/60">{hasColor ? colorway.hex : "No color"}</span>
      </div>
      {(enhancedFrontPreview || enhancedBackPreview) && (
        <div className="space-y-1.5">
          <p className="text-[9px] uppercase tracking-wider text-text-secondary">Generation source</p>
          <div className="grid grid-cols-2 gap-1.5">
            {enhancedFrontPreview && (
              <div className="space-y-1">
                <button type="button" onClick={() => setZoomedUrl(enhancedFrontPreview)} className="group relative aspect-[4/5] overflow-hidden rounded border border-border bg-bg-secondary cursor-zoom-in transition-colors hover:border-accent/60">
                  <img src={enhancedFrontPreview} alt="Enhanced front" className="h-full w-full object-cover" />
                  <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-1 rounded bg-black/60 px-2 py-1 text-center text-[8px] uppercase tracking-wider text-white opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                    Preview
                  </span>
                </button>
                <button type="button" onClick={() => onUpdate({ enhanceStatus: "original" })} className="w-full border border-border px-2 py-1.5 text-[8px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/5">
                  Clear
                </button>
              </div>
            )}
            {enhancedBackPreview && (
              <div className="space-y-1">
                <button type="button" onClick={() => setZoomedUrl(enhancedBackPreview)} className="group relative aspect-[4/5] overflow-hidden rounded border border-border bg-bg-secondary cursor-zoom-in transition-colors hover:border-accent/60">
                  <img src={enhancedBackPreview} alt="Enhanced back" className="h-full w-full object-cover" />
                  <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-1 rounded bg-black/60 px-2 py-1 text-center text-[8px] uppercase tracking-wider text-white opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                    Preview
                  </span>
                </button>
                <button type="button" onClick={() => onUpdate({ enhanceStatus: "original" })} className="w-full border border-border px-2 py-1.5 text-[8px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/5">
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {companionZones.length > 0 && (
        <div className="space-y-3">
          <p className="text-[9px] uppercase tracking-wider text-text-secondary">Model Generation</p>
          {companionZones.includes("top") && (
            <div className="space-y-2">
              <p className="text-[9px] uppercase tracking-wider text-text-secondary">Top</p>
              <select value={colorway.companionTopType} onChange={(e) => onUpdate({ companionTopType: e.target.value })} className="w-full border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors">
                <option value="">Select type</option>
                {companionTypeOptions.top.map((cat) => <option key={cat.slug} value={cat.slug}>{cat.name}</option>)}
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
              <select value={colorway.companionBottomType} onChange={(e) => onUpdate({ companionBottomType: e.target.value })} className="w-full border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors">
                <option value="">Select type</option>
                {companionTypeOptions.bottom.map((cat) => <option key={cat.slug} value={cat.slug}>{cat.name}</option>)}
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
              <select value={colorway.companionFootwearType} onChange={(e) => onUpdate({ companionFootwearType: e.target.value })} className="w-full border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors">
                <option value="">Select type</option>
                {companionTypeOptions.footwear.map((cat) => <option key={cat.slug} value={cat.slug}>{cat.name}</option>)}
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
      <div className="space-y-1 border-t border-border pt-3">
        {colorway.generateError && (
          <div className="border border-[#BD3100] bg-[#faf3f2] px-3 py-2 text-[10px] text-[#BD3100]">
            {colorway.generateError}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={colorway.generateStatus === "processing" ? undefined : onGenerate} disabled={colorway.generateStatus === "processing"} className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-bg-primary disabled:opacity-50 transition-opacity">
            {colorway.generateStatus === "processing" && <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-bg-primary/40 border-t-bg-primary" />}
            {colorway.generateStatus === "processing" ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
      {zoomedUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomedUrl(null)}>
          <div className="relative max-h-[92vh] w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setZoomedUrl(null)} className="absolute right-0 top-0 z-10 h-9 w-9 border border-white/30 bg-black/60 text-xl leading-none text-white hover:bg-black transition-colors">×</button>
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
  colorway, index, canRemove, isThrift, showGenerationPanel, companionZones, companionTypeOptions, canGenerate, requiredViews, viewLabels, enhanceRequiresAllViews = true, hideSizeInput = false, onRemove, onUpdate, onEnhance, onGenerate, onAddSize, onRemoveSize, onUpdateSize,
}: {
  colorway: Colorway; index: number; canRemove: boolean; isThrift: boolean;
  showGenerationPanel?: boolean;
  companionZones?: CompanionZone[];
  companionTypeOptions?: { top: { slug: string; name: string }[]; bottom: { slug: string; name: string }[]; footwear: { slug: string; name: string }[] };
  canGenerate?: boolean;
  requiredViews?: ColorwayView[];
  viewLabels?: Partial<Record<ColorwayView, string>>;
  enhanceRequiresAllViews?: boolean;
  hideSizeInput?: boolean;
  onRemove: () => void; onUpdate: (patch: Partial<Colorway>) => void; onEnhance: (pictureIndexes?: number[]) => void;
  onGenerate?: () => void;
  onAddSize: () => void; onRemoveSize: (sizeId: string) => void; onUpdateSize: (sizeId: string, patch: Partial<SizeRow>) => void;
}) {
  const views: ColorwayView[] = requiredViews && requiredViews.length > 0 ? requiredViews : ["front", "back"];
  const [zoomedPreview, setZoomedPreview] = useState<string | null>(null);
  const [samplerOpen, setSamplerOpen] = useState(false);
  const [selectedPictureIndexes, setSelectedPictureIndexes] = useState<number[]>([]);
  const hasColor = Boolean(colorway.hex.trim());
  const generationMode = colorway.generationMode === "manual" ? "manual" : "auto";

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
    colorway.enhancedOtherImages.length > 0 ||
    uploadedViews.some((view) => Boolean(colorway[enhancedUrlKeyFor(view)] || colorway[enhancedFileKeyFor(view)]));

  const getDisplayedPreview = (view: ColorwayView) => colorway[previewKeyFor(view)];

  const canEnhance = enhanceRequiresAllViews ? uploadedViews.length === views.length : uploadedViews.length > 0;

  const samplerSources: SamplerSource[] = [];
  views.forEach((view) => {
    const enhancedUrl = colorway[enhancedUrlKeyFor(view)];
    if (enhancedUrl) samplerSources.push({ url: enhancedUrl, label: `${view} (enhanced)` });
    const preview = colorway[previewKeyFor(view)];
    if (preview) samplerSources.push({ url: preview, label: view });
  });

  const handlePickColor = () => setSamplerOpen(true);
  const togglePictureSelection = (pictureIndex: number) =>
    setSelectedPictureIndexes((current) =>
      current.includes(pictureIndex)
        ? current.filter((index) => index !== pictureIndex)
        : [...current, pictureIndex]
    );

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
          enhancedOtherImages: [],
        };
    if (!file) {
      onUpdate({ [fileKey]: null, [previewKey]: "", ...enhanceReset } as Partial<Colorway>);
      return;
    }
    onUpdate({ [fileKey]: file, [previewKey]: URL.createObjectURL(file), ...enhanceReset } as Partial<Colorway>);
  };

  type PictureValue = { url: string; file: File | null };
  const pictureSlots = [
    ...views.map((view) => ({ kind: "view" as const, view })),
    ...colorway.otherImages.map((_, index) => ({ kind: "other" as const, index })),
  ];
  type EnhancedPictureSlot =
    | { kind: "enhancedView"; view: ColorwayView }
    | { kind: "enhancedOther"; index: number };
  const enhancedPictureSlots: EnhancedPictureSlot[] = [
    ...views.flatMap((view) => {
      const url = colorway[enhancedUrlKeyFor(view)];
      return url ? [{ kind: "enhancedView" as const, view }] : [];
    }),
    ...colorway.enhancedOtherImages.map((_, index) => ({ kind: "enhancedOther" as const, index })),
  ];
  const pictureValueForSlot = (slot: (typeof pictureSlots)[number]): PictureValue => {
    if (slot.kind === "other") {
      const image = colorway.otherImages[slot.index];
      return { url: image?.url || "", file: image?.file || null };
    }
    const fileKey = fileKeyFor(slot.view);
    const previewKey = previewKeyFor(slot.view);
    return {
      url: String(colorway[previewKey] || ""),
      file: colorway[fileKey],
    };
  };
  const enhancedPictureValueForSlot = (slot: EnhancedPictureSlot): PictureValue => {
    if (slot.kind === "enhancedOther") {
      const image = colorway.enhancedOtherImages[slot.index];
      return { url: image?.url || "", file: image?.file || null };
    }
    const urlKey = enhancedUrlKeyFor(slot.view);
    const fileKey = enhancedFileKeyFor(slot.view);
    return {
      url: String(colorway[urlKey] || ""),
      file: colorway[fileKey],
    };
  };
  const visibleOriginalPictureCount = pictureSlots.filter((slot) => {
    const value = pictureValueForSlot(slot);
    return Boolean(value.url || value.file);
  }).length;
  const visibleEnhancedPictureCount = enhancedPictureSlots.filter((slot) => {
    const value = enhancedPictureValueForSlot(slot);
    return Boolean(value.url || value.file);
  }).length;
  const visibleGeneratedPictureCount = colorway.generatedImages.filter((image) => image.url || image.file).length;
  const publicPictureCount = visibleOriginalPictureCount + visibleEnhancedPictureCount + visibleGeneratedPictureCount;
  const ordinalLabel = (value: number) => {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
    switch (value % 10) {
      case 1:
        return `${value}st`;
      case 2:
        return `${value}nd`;
      case 3:
        return `${value}rd`;
      default:
        return `${value}th`;
    }
  };
  const publicOrderOptions = [
    { value: "", label: "Hidden" },
    { value: "main", label: "Main / front view" },
    ...Array.from({ length: Math.max(0, publicPictureCount - 1) }, (_, optionIndex) => ({
      value: String(optionIndex + 2),
      label: ordinalLabel(optionIndex + 2),
    })),
  ];
  const setPublicImageOrder = (key: string, value: string) => {
    const nextOrder = { ...colorway.publicImageOrder };
    if (value) {
      Object.keys(nextOrder).forEach((existingKey) => {
        if (existingKey !== key && nextOrder[existingKey] === value) {
          nextOrder[existingKey] = "";
        }
      });
    }
    nextOrder[key] = value;
    onUpdate({ publicImageOrder: nextOrder });
  };
  const renderPublicOrderSelect = (key: string) => (
    <select
      value={colorway.publicImageOrder[key] || ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setPublicImageOrder(key, e.target.value)}
      className="w-full border border-border bg-bg-card px-1.5 py-1 text-[8px] uppercase tracking-wider text-text-secondary outline-none transition-colors focus:border-accent"
    >
      {publicOrderOptions.map((option) => (
        <option key={option.value || "hidden"} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
  // Unisex generated pictures get a per-gender front/back on their own dedicated
  // tokens, so they never clash with each other or with the product pictures'
  // "main" — and they always sort ahead of the product pictures (see orderRank).
  const renderGeneratedOrderSelect = (key: string, gender?: "men" | "women" | null) => {
    if (gender !== "men" && gender !== "women") return renderPublicOrderSelect(key);
    const isWomen = gender === "women";
    const options = [
      { value: "", label: "Hidden" },
      { value: isWomen ? "model-women-front" : "model-men-front", label: "Front view" },
      { value: isWomen ? "model-women-back" : "model-men-back", label: "Back view (2nd)" },
    ];
    return (
      <select
        value={colorway.publicImageOrder[key] || ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setPublicImageOrder(key, e.target.value)}
        className="w-full border border-border bg-bg-card px-1.5 py-1 text-[8px] uppercase tracking-wider text-text-secondary outline-none transition-colors focus:border-accent"
      >
        {options.map((option) => (
          <option key={option.value || "hidden"} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  };
  const applyPictureValues = (values: PictureValue[]) => {
    const patch: Partial<Colorway> = {
      otherImages: values.slice(views.length).filter((value) => value.url || value.file),
    };
    views.forEach((view, index) => {
      const value = values[index] || { url: "", file: null };
      Object.assign(patch, {
        [previewKeyFor(view)]: value.url,
        [fileKeyFor(view)]: value.file,
      });
    });
    onUpdate(patch);
  };
  const applyEnhancedPictureValues = (values: PictureValue[]) => {
    const viewValues = new Map<ColorwayView, PictureValue>();
    const otherValues: PictureValue[] = [];
    enhancedPictureSlots.forEach((slot, index) => {
      const value = values[index] || { url: "", file: null };
      if (slot.kind === "enhancedView") viewValues.set(slot.view, value);
      else if (value.url || value.file) otherValues.push(value);
    });
    const patch: Partial<Colorway> = {
      enhancedOtherImages: otherValues,
    };
    views.forEach((view) => {
      const value = viewValues.get(view) || { url: "", file: null };
      Object.assign(patch, {
        [enhancedUrlKeyFor(view)]: value.url,
        [enhancedFileKeyFor(view)]: value.file,
      });
    });
    onUpdate(patch);
  };
  const swapOriginalPicture = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const values = pictureSlots.map(pictureValueForSlot);
    if (!values[fromIndex] || !values[toIndex]) return;
    [values[fromIndex], values[toIndex]] = [values[toIndex], values[fromIndex]];
    applyPictureValues(values);
  };
  const swapEnhancedPicture = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const values = enhancedPictureSlots.map(enhancedPictureValueForSlot);
    if (!values[fromIndex] || !values[toIndex]) return;
    [values[fromIndex], values[toIndex]] = [values[toIndex], values[fromIndex]];
    applyEnhancedPictureValues(values);
  };
  const handleOriginalPictureDrop = (
    event: DragEvent,
    toIndex: number,
    fallback?: () => void
  ) => {
    event.preventDefault();
    const enhancedSourceValue = event.dataTransfer.getData("application/x-enhanced-picture-index");
    if (enhancedSourceValue !== "") {
      const enhancedSourceIndex = Number(enhancedSourceValue);
      const enhancedSlot = enhancedPictureSlots[enhancedSourceIndex];
      if (!enhancedSlot) return;
      const enhancedValue = enhancedPictureValueForSlot(enhancedSlot);
      if (!enhancedValue.url && !enhancedValue.file) return;
      const originalValues = pictureSlots.map(pictureValueForSlot);
      const enhancedValues = enhancedPictureSlots.map(enhancedPictureValueForSlot);
      const originalTarget = originalValues[toIndex] || { url: "", file: null };
      originalValues[toIndex] = enhancedValue;
      enhancedValues[enhancedSourceIndex] = originalTarget;
      applyPictureValues(originalValues);
      applyEnhancedPictureValues(enhancedValues);
      setSelectedPictureIndexes([]);
      return;
    }
    const sourceValue = event.dataTransfer.getData("text/plain");
    if (sourceValue !== "") {
      const sourceIndex = Number(sourceValue);
      swapOriginalPicture(sourceIndex, toIndex);
      setSelectedPictureIndexes([]);
      return;
    }
    fallback?.();
  };
  const handleEnhancedPictureDrop = (event: DragEvent, toIndex: number) => {
    event.preventDefault();
    const sourceValue = event.dataTransfer.getData("application/x-enhanced-picture-index");
    if (sourceValue !== "") {
      const sourceIndex = Number(sourceValue);
      swapEnhancedPicture(sourceIndex, toIndex);
      return;
    }
    const originalSourceValue = event.dataTransfer.getData("text/plain");
    if (originalSourceValue !== "") {
      const originalSourceIndex = Number(originalSourceValue);
      const originalSlot = pictureSlots[originalSourceIndex];
      if (!originalSlot) return;
      const originalValue = pictureValueForSlot(originalSlot);
      if (!originalValue.url && !originalValue.file) return;
      const originalValues = pictureSlots.map(pictureValueForSlot);
      const enhancedValues = enhancedPictureSlots.map(enhancedPictureValueForSlot);
      const enhancedTarget = enhancedValues[toIndex] || { url: "", file: null };
      enhancedValues[toIndex] = originalValue;
      originalValues[originalSourceIndex] = enhancedTarget;
      applyPictureValues(originalValues);
      applyEnhancedPictureValues(enhancedValues);
      setSelectedPictureIndexes([]);
    }
  };
  const removeOtherPicture = (imageIndex: number) => {
    onUpdate({
      otherImages: colorway.otherImages.filter((_, index) => index !== imageIndex),
      enhanceStatus: "idle",
      enhancedFrontUrl: "",
      enhancedBackUrl: "",
      enhancedLeftUrl: "",
      enhancedRightUrl: "",
      enhancedOtherImages: [],
    });
    setSelectedPictureIndexes((current) =>
      current
        .filter((index) => index !== imageIndex + 2)
        .map((index) => (index > imageIndex + 2 ? index - 1 : index))
    );
  };
  const removeEnhancedPicture = (slot: EnhancedPictureSlot) => {
    if (slot.kind === "enhancedView") {
      onUpdate({
        [enhancedUrlKeyFor(slot.view)]: "",
        [enhancedFileKeyFor(slot.view)]: null,
      } as Partial<Colorway>);
      return;
    }
    onUpdate({
      enhancedOtherImages: colorway.enhancedOtherImages.filter((_, index) => index !== slot.index),
    });
  };
  const removeGeneratedPicture = (imageIndex: number) => {
    const nextGenerated = colorway.generatedImages.filter((_, index) => index !== imageIndex);
    onUpdate({
      generatedImages: nextGenerated,
      ...(nextGenerated.length === 0 ? { generateStatus: "idle" as const, generateError: "", generateJobId: "" } : {}),
    });
  };
  const enhancedPictures = [
    ...enhancedPictureSlots.map((slot, imageIndex) => ({
      ...enhancedPictureValueForSlot(slot),
      index: imageIndex,
    })),
  ].filter((image) => image.url || image.file);

  return (
    <div data-colorway-id={colorway.id} className="w-full sm:flex-none sm:w-[270px] rounded-2xl border border-border bg-bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {canRemove && <button type="button" onClick={onRemove} title="Remove colorway" className="text-sm leading-none text-text-secondary hover:text-danger transition-colors">×</button>}
          <span className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Product {index + 1}</span>
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
      {views.length === 4 && !viewLabels && (
        <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2 text-[10px] leading-relaxed text-text-secondary">
          {FOOTWEAR_VIEW_VERIFICATION_COPY}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {views.map((slot) => {
          const slotIndex = views.indexOf(slot);
          const inputId = `cw-${slot}-${colorway.id}`;
          const preview = getDisplayedPreview(slot);
          const selected = selectedPictureIndexes.includes(slotIndex);
          const publicKey = `original:${slot}`;
          return (
            <div key={slot} className="space-y-1">
              <p className="text-[9px] uppercase tracking-wider text-text-secondary">{viewLabels?.[slot] || slot}</p>
              <input id={inputId} type="file" accept="image/*" className="hidden" onChange={(e) => handleViewFile(slot, e.target.files?.[0] || null)} onClick={(e) => { e.currentTarget.value = ""; }} />
              <div
                draggable={Boolean(preview) && slotIndex >= 0}
                onDragStart={(e) => {
                  if (slotIndex >= 0) e.dataTransfer.setData("text/plain", String(slotIndex));
                }}
                onClick={() => { if (preview) { setZoomedPreview(preview); } else { document.getElementById(inputId)?.click(); } }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  if (slotIndex >= 0) {
                    handleOriginalPictureDrop(e, slotIndex, () => handleViewFile(slot, e.dataTransfer.files?.[0] || null));
                    return;
                  }
                  e.preventDefault();
                  handleViewFile(slot, e.dataTransfer.files?.[0] || null);
                }}
                className={`group relative aspect-[4/5] overflow-hidden rounded border bg-bg-secondary transition-colors flex items-center justify-center ${preview ? "border-border cursor-grab hover:border-accent/60 active:cursor-grabbing" : "border-dashed border-border cursor-pointer hover:border-accent"}`}
              >
                {preview ? (
                  <>
                    <img src={preview} alt={slot} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePictureSelection(slotIndex);
                      }}
                      className={`absolute left-1.5 top-1.5 h-5 w-5 rounded border text-[10px] font-semibold transition-colors ${selected ? "border-accent bg-accent text-bg-primary" : "border-white/70 bg-black/45 text-white hover:border-accent"}`}
                      aria-label={selected ? "Unselect picture" : "Select picture"}
                    >
                      {selected ? "✓" : ""}
                    </button>
                    <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-1 rounded bg-black/60 px-2 py-1 text-center text-[8px] uppercase tracking-wider text-white opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                      Preview
                    </span>
                  </>
                ) : <span className="text-[8px] uppercase tracking-wider text-text-secondary/60">Upload</span>}
              </div>
              {preview && renderPublicOrderSelect(publicKey)}
              {preview && <button type="button" onClick={() => handleViewFile(slot, null)} className="w-full border border-border px-2 py-1.5 text-[8px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/5">Clear</button>}
            </div>
          );
        })}
      </div>
      {colorway.otherImages.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] uppercase tracking-wider text-text-secondary">Other pictures</p>
          <div className="grid grid-cols-2 gap-2">
            {colorway.otherImages.map((image, imageIndex) => {
              const pictureIndex = imageIndex + views.length;
              const selected = selectedPictureIndexes.includes(pictureIndex);
              const publicKey = `originalOther:${imageIndex}`;
              return (
                <div key={`${image.url}-${imageIndex}`} className="space-y-1">
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", String(pictureIndex))}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      handleOriginalPictureDrop(e, pictureIndex);
                    }}
                    onClick={() => setZoomedPreview(image.url)}
                    className="group relative aspect-[4/5] w-full cursor-grab overflow-hidden rounded border border-border bg-bg-secondary transition-colors hover:border-accent/60 active:cursor-grabbing"
                  >
                    <img src={image.url} alt={`Other picture ${imageIndex + 1}`} className="h-full w-full object-cover" />
                    <span
                      role="checkbox"
                      aria-checked={selected}
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePictureSelection(pictureIndex);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        e.stopPropagation();
                        togglePictureSelection(pictureIndex);
                      }}
                      className={`absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border text-[10px] font-semibold transition-colors ${selected ? "border-accent bg-accent text-bg-primary" : "border-white/70 bg-black/45 text-white hover:border-accent"}`}
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-1 rounded bg-black/60 px-2 py-1 text-center text-[8px] uppercase tracking-wider text-white opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                      Drag to reorder
                    </span>
                  </button>
                  {renderPublicOrderSelect(publicKey)}
                  <button type="button" onClick={() => removeOtherPicture(imageIndex)} className="w-full border border-border px-2 py-1.5 text-[8px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/5">
                    Clear
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {enhancedPictures.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] uppercase tracking-wider text-text-secondary">Enhanced pictures</p>
          <div className="grid grid-cols-2 gap-2">
            {enhancedPictures.map((image, imageIndex) => (
              <div key={`${image.url}-${imageIndex}`} className="space-y-1">
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-enhanced-picture-index", String(image.index));
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleEnhancedPictureDrop(e, image.index)}
                  onClick={() => setZoomedPreview(image.url)}
                  className="group relative aspect-[4/5] w-full cursor-grab overflow-hidden rounded border border-accent/40 bg-bg-secondary transition-colors hover:border-accent active:cursor-grabbing"
                >
                  <img src={image.url} alt={`Enhanced picture ${imageIndex + 1}`} className="h-full w-full object-cover" />
                </button>
                {renderPublicOrderSelect(
                  enhancedPictureSlots[image.index]?.kind === "enhancedView"
                    ? `enhanced:${(enhancedPictureSlots[image.index] as { kind: "enhancedView"; view: ColorwayView }).view}`
                    : `enhancedOther:${(enhancedPictureSlots[image.index] as { kind: "enhancedOther"; index: number }).index}`
                )}
                <button
                  type="button"
                  onClick={() => {
                    const slot = enhancedPictureSlots[image.index];
                    if (slot) removeEnhancedPicture(slot);
                  }}
                  className="w-full border border-border px-2 py-1.5 text-[8px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/5"
                >
                  Clear
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {colorway.generatedImages.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] uppercase tracking-wider text-text-secondary">Model generated pictures</p>
          <div className="grid grid-cols-2 gap-2">
            {colorway.generatedImages.map((img, imageIndex) => (
              <div key={`${img.url}-${imageIndex}`} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setZoomedPreview(img.url)}
                  className="group relative aspect-[4/5] w-full overflow-hidden rounded border border-border bg-bg-secondary transition-colors hover:border-accent/60"
                >
                  <img src={img.url} alt={`Generated model ${imageIndex + 1}`} className="h-full w-full object-cover" />
                  {(img.gender === "men" || img.gender === "women") && (
                    <span className="absolute top-1 left-1 bg-black px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
                      {img.gender === "women" ? "Women" : "Men"}
                    </span>
                  )}
                </button>
                {renderGeneratedOrderSelect(`generated:${imageIndex}`, img.gender)}
                <button
                  type="button"
                  onClick={() => removeGeneratedPicture(imageIndex)}
                  className="w-full border border-border px-2 py-1.5 text-[8px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/5"
                >
                  Clear
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {zoomedPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomedPreview(null)}>
          <div className="relative max-h-[92vh] w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setZoomedPreview(null)} aria-label="Close preview" className="absolute right-0 top-0 z-10 h-9 w-9 border border-white/30 bg-black/60 text-xl leading-none text-white hover:bg-black transition-colors">×</button>
            <div className="flex max-h-[92vh] items-center justify-center bg-bg-card p-4">
              <img src={zoomedPreview} alt="Image preview" className="max-h-[86vh] max-w-full object-contain" />
            </div>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-[9px] uppercase tracking-wider text-text-secondary">{hideSizeInput ? "Stock" : "Sizes"}</p>
        {colorway.sizes.map((sizeRow) => (
          <div key={sizeRow.id} className="flex items-end gap-2">
            {!hideSizeInput && <input type="text" value={sizeRow.size} onChange={(e) => onUpdateSize(sizeRow.id, { size: e.target.value })} placeholder="Size" className="min-w-0 flex-1 border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors" />}
            <input type="number" min="0" value={sizeRow.stock} onChange={(e) => onUpdateSize(sizeRow.id, { stock: e.target.value })} placeholder="Qty" className={`${hideSizeInput ? "flex-1" : "w-12"} flex-none border-0 border-b border-border bg-transparent px-1 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-text-primary focus:outline-none transition-colors`} />
            <button type="button" onClick={() => onRemoveSize(sizeRow.id)} disabled={colorway.sizes.length === 1} className="flex-none pb-1.5 text-sm leading-none text-text-secondary hover:text-danger transition-colors disabled:opacity-30">×</button>
          </div>
        ))}
        {!hideSizeInput && <button type="button" onClick={onAddSize} className="text-[9px] uppercase tracking-wider text-text-secondary underline underline-offset-4 decoration-text-secondary/40 decoration-1 transition-colors hover:text-text-primary hover:decoration-text-primary">+ Add size</button>}
        {isThrift && colorway.sizes.map((sizeRow) => (
          <div key={sizeRow.id} className="space-y-0.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[8px] uppercase tracking-wider text-text-secondary">Condition</span>
              <span className="text-[8px] text-text-secondary">{sizeRow.conditionScore}/10 · {getConditionStatusFromScore(Number(sizeRow.conditionScore)).toUpperCase()}</span>
            </div>
            <input type="range" min="1" max="10" step="1" value={sizeRow.conditionScore} onChange={(e) => onUpdateSize(sizeRow.id, { conditionScore: e.target.value })} className="w-full accent-accent cursor-pointer" />
          </div>
        ))}
      </div>
      <div className="space-y-1.5 border-t border-border pt-3">
        {colorway.enhanceError && (
          <div className="border border-[#BD3100] bg-[#faf3f2] px-3 py-2 text-[10px] text-[#BD3100]">
            {colorway.enhanceError}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          {selectedPictureIndexes.length > 0 && (
            <button
              type="button"
              onClick={() => onEnhance(selectedPictureIndexes)}
              disabled={colorway.enhanceStatus === "processing"}
              className="border border-border px-2 py-1.5 text-[8px] uppercase tracking-wider text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Enhance selected
            </button>
          )}
          <button
            type="button"
            onClick={colorway.enhanceStatus === "processing" ? undefined : () => onEnhance()}
            disabled={!canEnhance || colorway.enhanceStatus === "processing"}
            className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-bg-primary disabled:opacity-50 transition-opacity"
          >
            {colorway.enhanceStatus === "processing" && <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-bg-primary/40 border-t-bg-primary" />}
            {colorway.enhanceStatus === "processing"
              ? "Enhancing..."
              : "Enhance all"}
          </button>
        </div>
      </div>

      {showGenerationPanel && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] uppercase tracking-wider text-text-secondary">Model Generation</p>
              <div className="flex items-center gap-0.5 rounded-full border border-border p-0.5">
                {(["auto", "manual"] as const).map((mode) => {
                  const active = generationMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdate({ generationMode: mode })}
                      className={`rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider transition-colors ${active ? "bg-accent text-bg-primary" : "text-text-secondary hover:text-text-primary"}`}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>
            {generationMode === "auto" ? (
              <p className="text-[10px] text-text-secondary">
                The AI styles a companion outfit automatically and keeps the product as the hero. Only the selected model and this colorway&apos;s front and back pictures are used.
              </p>
            ) : companionZones && companionZones.length > 0 ? (
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
            {generationMode === "manual" && (colorway.additionalInstructions ? (
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
            ))}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={colorway.generateStatus === "processing" ? undefined : onGenerate} disabled={colorway.generateStatus === "processing"} className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-bg-primary disabled:opacity-50 transition-opacity">
              {colorway.generateStatus === "processing" && <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-bg-primary/40 border-t-bg-primary" />}
              {colorway.generateStatus === "processing" ? "Generating..." : "Generate"}
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
  const [initialCategorySlugs, setInitialCategorySlugs] = useState<string[]>([]);
  const [productGender, setProductGender] = useState<"men" | "women" | "children" | "unisex" | null>(null);
  const [savedFashionSubtype, setSavedFashionSubtype] = useState<FashionSubtype>("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedFemaleModelId, setSelectedFemaleModelId] = useState("");
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
  const categorySelectRef = useRef<HTMLInputElement | null>(null);
  const productBasicsRef = useRef<HTMLDivElement | null>(null);
  const colorwaysSectionRef = useRef<HTMLDivElement | null>(null);
  const modelPicturesSectionRef = useRef<HTMLDivElement | null>(null);
  const productMediaSectionRef = useRef<HTMLDivElement | null>(null);
  const [soldQuantity, setSoldQuantity] = useState(0);
  const [existingVariants, setExistingVariants] = useState<VariantRow[]>([]);
  const [restockAmount, setRestockAmount] = useState("0");
  const [restocking, setRestocking] = useState(false);
  const [colorways, setColorways] = useState<Colorway[]>([createEmptyColorway()]);
  const generationAbortRef = useRef<AbortController | null>(null);
  const hasHydratedProductRef = useRef(false);
  const hasSyncedInitialCategoriesRef = useRef(false);
  const previousProductTypeRef = useRef<ProductType | null>(null);
  const previousFashionSubtypeRef = useRef<FashionSubtype | null>(null);
  const previousGenerationTargetRef = useRef<GenerationTarget | null>(null);
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
  const usesStoreOwnerEditFlow = userRole === "admin";
  const isRetailStoreOwner = isStoreOwner && userStoreType === "retail";
  const isThriftStoreOwner = isStoreOwner && userStoreType === "thrift";
  const storeOwnerPayoutPrice = getStoreOwnerPayoutPrice(form.price);
  const updateExistingVariant = (uiId: string, patch: Partial<VariantRow>) =>
    setExistingVariants((current) =>
      current.map((row) => (row.uiId === uiId ? { ...row, ...patch } : row))
    );
  const existingStockTotal = useMemo(
    () => existingVariants.reduce((sum, row) => sum + Math.max(0, Number(row.fullStock || 0)), 0),
    [existingVariants]
  );

  const updateColorway = (id: string, patch: Partial<Colorway>) =>
    setColorways((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addColorway = () =>
    setColorways((prev) => [...prev, createEmptyColorway()]);
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
  const handleAddColorway = () => {
    const blankColorway = colorways.find((cw) => !cw.hex.trim());
    if (blankColorway) {
      setError("Please assign a color to the current colorway before adding another.", "colorways");
      scrollToColorwayCard(blankColorway.id);
      return;
    }
    addColorway();
  };
  const removeColorway = (id: string) => setColorways((prev) => prev.length === 1 ? prev : prev.filter((c) => c.id !== id));
  const addSizeRow = (colorwayId: string) => setColorways((prev) => prev.map((c) => c.id === colorwayId ? { ...c, sizes: [...c.sizes, { id: generateId(), size: "", stock: "", conditionScore: "10" }] } : c));
  const removeSizeRow = (colorwayId: string, sizeId: string) => setColorways((prev) => prev.map((c) => c.id === colorwayId ? { ...c, sizes: c.sizes.length === 1 ? c.sizes : c.sizes.filter((s) => s.id !== sizeId) } : c));
  const updateSizeRow = (colorwayId: string, sizeId: string, patch: Partial<SizeRow>) => setColorways((prev) => prev.map((c) => c.id === colorwayId ? { ...c, sizes: c.sizes.map((s) => s.id === sizeId ? { ...s, ...patch } : s) } : c));
  const applyColorwayEnhancementFailure = (colorwayId: string, error: string) =>
    updateColorway(colorwayId, {
      enhanceStatus: "failed",
      enhanceError: error,
      enhanceJobId: "",
    });
  const applyColorwayEnhancementCompletion = async (
    colorwayId: string,
    images: Record<string, string> | undefined,
    otherImages: Array<{ url: string; file: File | null }> = []
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
      enhancedOtherImages: otherImages,
    });
  };
  const applyColorwayGenerationFailure = (colorwayId: string, error: string) =>
    updateColorway(colorwayId, {
      generateStatus: "failed",
      generateError: error,
      generateJobId: "",
      altGenerateJobId: "",
    });
  const applyColorwayGenerationCompletion = async (
    colorwayId: string,
    viewList: string[],
    images: Record<string, string> | undefined,
    opts: { gender: "men" | "women" | null; jobField: "generateJobId" | "altGenerateJobId" } = {
      gender: null,
      jobField: "generateJobId",
    }
  ) => {
    const results = await Promise.all(
      viewList.map(async (view, i) => {
        const image = images?.[view];
        if (!image) return null;
        const file = await generatedResultToFile(image, i);
        return { url: URL.createObjectURL(file), file, gender: opts.gender };
      })
    );

    const nextResults = results.filter(
      (r): r is { url: string; file: File; gender: "men" | "women" | null } => r !== null
    );
    setColorways((prev) =>
      prev.map((cw) => {
        if (cw.id !== colorwayId) return cw;
        const cleared = { ...cw, [opts.jobField]: "" };
        // A unisex colorway runs two passes; stay "processing" until both finish.
        const otherJob = opts.jobField === "generateJobId" ? cleared.altGenerateJobId : cleared.generateJobId;
        return {
          ...cleared,
          generateStatus: otherJob ? "processing" : "completed",
          generateError: "",
          generatedImages: [...cw.generatedImages, ...nextResults],
        };
      })
    );
  };
  const handleEnhanceColorway = async (colorwayId: string, selectedPictureIndexes: number[] = []) => {
    const cw = colorways.find((c) => c.id === colorwayId);
    if (!cw) return;
    const isShoes = selectedCategoryZone === "footwear";
    const viewNames: OriginPictureKey[] = ["front", "back", "left", "right"];
    const getSourceFile = (file: File | null, preview: string, label: string) =>
      file ? Promise.resolve(file) : preview ? imageUrlToFile(preview, label) : Promise.resolve(null);
    const [frontSource, backSource, leftSource, rightSource] = await Promise.all([
      getSourceFile(cw.frontFile, cw.frontPreview, "front-original"),
      getSourceFile(cw.backFile, cw.backPreview, "back-original"),
      getSourceFile(cw.leftFile, cw.leftPreview, "left-original"),
      getSourceFile(cw.rightFile, cw.rightPreview, "right-original"),
    ]);
    const uploadedEntries = [
      ["front", frontSource],
      ["back", backSource],
      ["left", leftSource],
      ["right", rightSource],
    ] as const;
    const sourcesByView: Record<OriginPictureKey, File | null> = {
      front: frontSource,
      back: backSource,
      left: leftSource,
      right: rightSource,
    };
    const availableEntries = uploadedEntries.filter((entry): entry is readonly [OriginPictureKey, File] => Boolean(entry[1]));
    const otherSources = (await Promise.all(
      cw.otherImages.map(async (image, index) => {
        const file = image.file || (image.url ? await imageUrlToFile(image.url, `other-${index + 1}-original`) : null);
        return file ? { file, label: `Other ${index + 1}` } : null;
      })
    )).filter((entry): entry is { file: File; label: string } => Boolean(entry));
    const originalPictureEntries = [
      ...requiredOriginPictureKeys.map((view) => ({ kind: "view" as const, view, file: sourcesByView[view] })),
      ...otherSources.map((source, index) => ({ kind: "other" as const, index, file: source.file })),
    ];
    const allAvailableCount = availableEntries.length + otherSources.length;

    if (allAvailableCount === 0) {
      updateColorway(colorwayId, {
        enhanceStatus: "failed",
        enhanceError: "Please upload at least one image first.",
      });
      return;
    }
    const selectedIndexes = Array.from(new Set(selectedPictureIndexes)).filter(
      (index) => index >= 0 && index < originalPictureEntries.length
    );
    if (selectedIndexes.length > 0) {
      const selectedEntries = selectedIndexes
        .map((index) => ({ index, entry: originalPictureEntries[index] }))
        .filter((item): item is { index: number; entry: (typeof originalPictureEntries)[number] & { file: File } } => Boolean(item.entry?.file));
      if (selectedEntries.length === 0) {
        updateColorway(colorwayId, {
          enhanceStatus: "failed",
          enhanceError: "Please select pictures that have images first.",
        });
        return;
      }
      updateColorway(colorwayId, { enhanceStatus: "processing", enhanceError: "", enhanceJobId: "" });
      try {
        const startEnhanceJob = async (body: FormData) => {
          const res = await fetch("/api/products/enhance", withAuthRequest({ method: "POST", body }));
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Unable to start enhancement.");
          const jobId = String(data.job_id || "");
          if (!jobId) throw new Error("Enhancement job did not start.");
          return waitForJob(jobId);
        };
        const selectedResults: Array<{ index: number; url: string; file: File }> = [];
        for (let i = 0; i < selectedEntries.length; i += 1) {
          const selected = selectedEntries[i];
          const body = new FormData();
          body.append("mode", "accessory");
          const compressed = await compressImageFile(selected.entry.file);
          body.append("front", compressed);
          const result = await startEnhanceJob(body);
          const url = viewNames.map((view) => result.images?.[view] || "").find(Boolean) || "";
          if (!url) continue;
          const file = await imageUrlToFile(url, `selected-enhanced-${i + 1}`);
          selectedResults.push({ index: selected.index, url, file });
        }

        const patch: Partial<Colorway> = {
          enhanceStatus: "completed",
          enhanceJobId: "",
          enhanceError: "",
          enhancedOtherImages: [...cw.enhancedOtherImages],
        };
        selectedResults.forEach((result) => {
          const source = originalPictureEntries[result.index];
          if (!source) return;
          if (source.kind === "view") {
            Object.assign(patch, {
              [`enhanced${source.view.charAt(0).toUpperCase()}${source.view.slice(1)}Url`]: result.url,
              [`enhanced${source.view.charAt(0).toUpperCase()}${source.view.slice(1)}File`]: result.file,
            });
          } else {
            const nextOther = [...(patch.enhancedOtherImages || [])];
            nextOther[source.index] = { url: result.url, file: result.file };
            patch.enhancedOtherImages = nextOther.filter((image) => image?.url || image?.file);
          }
        });
        updateColorway(colorwayId, patch);
      } catch (error) {
        updateColorway(colorwayId, {
          enhanceStatus: "failed",
          enhanceJobId: "",
          enhanceError: (error as Error)?.message || "Network error",
        });
      }
      return;
    }
    if (!usesAccessoryImageWorkflow && (!frontSource || !backSource)) return;
    if (isShoes && (!leftSource || !rightSource)) {
      updateColorway(colorwayId, {
        enhanceStatus: "failed",
        enhanceError: "Please upload front, back, left, and right images first.",
      });
      return;
    }
    updateColorway(colorwayId, { enhanceStatus: "processing", enhanceError: "", enhanceJobId: "" });
    try {
      const startEnhanceJob = async (url: string, body: FormData) => {
        const res = await fetch(url, withAuthRequest({ method: "POST", body }));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to start enhancement.");
        const jobId = String(data.job_id || "");
        if (!jobId) throw new Error("Enhancement job did not start.");
        return waitForJob(jobId);
      };
      const enhanceAccessoryChunk = async (files: File[]) => {
        const body = new FormData();
        body.append("mode", "accessory");
        const compressed = await Promise.all(files.map((file) => compressImageFile(file)));
        compressed.forEach((file, index) => body.append(viewNames[index], file));
        const result = await startEnhanceJob("/api/products/enhance", body);
        return viewNames
          .map((view) => result.images?.[view] || "")
          .filter(Boolean);
      };
      let primaryImages: Record<string, string> | undefined;
      const enhancedOtherResults: Array<{ url: string; file: File | null }> = [];

      if (isShoes) {
        const [front, back, left, right] = await Promise.all([
          compressImageFile(frontSource!),
          compressImageFile(backSource!),
          compressImageFile(leftSource!),
          compressImageFile(rightSource!),
        ]);
        const body = new FormData();
        body.append("front", front); body.append("back", back); body.append("left", left); body.append("right", right);
        primaryImages = (await startEnhanceJob("/api/products/enhance-shoes", body)).images;
      } else if (usesAccessoryImageWorkflow) {
        if (availableEntries.length > 0) {
          const body = new FormData();
          body.append("mode", "accessory");
          const compressedEntries = await Promise.all(
            availableEntries.map(async ([view, file]) => [view, await compressImageFile(file)] as const)
          );
          compressedEntries.forEach(([view, file]) => body.append(view, file));
          primaryImages = (await startEnhanceJob("/api/products/enhance", body)).images;
        } else {
          primaryImages = {};
        }
      } else {
        const [front, back] = await Promise.all([compressImageFile(frontSource!), compressImageFile(backSource!)]);
        const body = new FormData();
        body.append("front", front); body.append("back", back);
        primaryImages = (await startEnhanceJob("/api/products/enhance", body)).images;
      }

      const extraFiles = [
        ...(!usesAccessoryImageWorkflow && !isShoes
          ? availableEntries.filter(([view]) => view === "left" || view === "right").map(([, file]) => file)
          : []),
        ...otherSources.map((source) => source.file),
      ];
      for (let i = 0; i < extraFiles.length; i += viewNames.length) {
        const urls = await enhanceAccessoryChunk(extraFiles.slice(i, i + viewNames.length));
        const files = await Promise.all(urls.map((url, index) => imageUrlToFile(url, `other-enhanced-${i + index + 1}`)));
        urls.forEach((url, index) => enhancedOtherResults.push({ url, file: files[index] || null }));
      }

      await applyColorwayEnhancementCompletion(colorwayId, primaryImages, enhancedOtherResults);
    } catch (error) {
      updateColorway(colorwayId, {
        enhanceStatus: "failed",
        enhanceJobId: "",
        enhanceError: (error as Error)?.message || "Network error",
      });
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
    if (isUnisex && !selectedFemaleModelId) return false;
    if (!Boolean(cw.frontFile || cw.frontPreview) || !Boolean(cw.backFile || cw.backPreview)) return false;
    // Auto mode lets the AI pick the companion outfit — only model + front/back are required.
    if (cw.generationMode !== "manual") return true;
    if (companionZones.includes("top") && (!cw.companionTopType || !cw.companionTopColor)) return false;
    if (companionZones.includes("bottom") && (!cw.companionBottomType || !cw.companionBottomColor)) return false;
    if (companionZones.includes("footwear") && (!cw.companionFootwearType || !cw.companionFootwearColor)) return false;
    return true;
  };

  const getColorwayViewInputFile = async (
    colorway: Colorway,
    side: ColorwayView
  ): Promise<File | null> => {
    const fileKey = `${side}File` as "frontFile" | "backFile" | "leftFile" | "rightFile";
    const previewKey = `${side}Preview` as "frontPreview" | "backPreview" | "leftPreview" | "rightPreview";
    if (colorway[fileKey]) return colorway[fileKey];
    if (colorway[previewKey]) return imageUrlToFile(colorway[previewKey], `${side}-model-source`);
    return null;
  };

  const handleGenerateColorway = async (colorwayId: string) => {
    const cw = colorways.find((c) => c.id === colorwayId);
    if (!cw) return;
    if (!needsModelSelection) {
      updateColorway(colorwayId, { generateStatus: "failed", generateError: "Please select a category that supports model generation." });
      return;
    }
    if (!selectedModelId) {
      updateColorway(colorwayId, { generateStatus: "failed", generateError: "Please select a model first." });
      return;
    }
    if (isUnisex && !selectedFemaleModelId) {
      updateColorway(colorwayId, { generateStatus: "failed", generateError: "Please select a female model first." });
      return;
    }
    const isAutoMode = cw.generationMode !== "manual";
    if (!isAutoMode) {
    if (companionZones.includes("top") && (!cw.companionTopType || !cw.companionTopColor)) {
      updateColorway(colorwayId, { generateStatus: "failed", generateError: "Please select the top type and color first." });
      return;
    }
    if (companionZones.includes("bottom") && (!cw.companionBottomType || !cw.companionBottomColor)) {
      updateColorway(colorwayId, { generateStatus: "failed", generateError: "Please select the bottom type and color first." });
      return;
    }
    if (companionZones.includes("footwear") && (!cw.companionFootwearType || !cw.companionFootwearColor)) {
      updateColorway(colorwayId, { generateStatus: "failed", generateError: "Please select the footwear type and color first." });
      return;
    }
    }
    try {
      const [frontSrc, backSrc] = await Promise.all([
        getColorwayViewInputFile(cw, "front"),
        getColorwayViewInputFile(cw, "back"),
      ]);
      if (!frontSrc || !backSrc) {
        updateColorway(colorwayId, { generateStatus: "failed", generateError: "Please select front and back pictures first." });
        return;
      }
      updateColorway(colorwayId, { generateStatus: "processing", generateError: "", generateJobId: "", altGenerateJobId: "" });
      const [frontFile, backFile] = await Promise.all([compressImageFile(frontSrc), compressImageFile(backSrc)]);
      // A fresh FormData per call (File objects can be reused across bodies).
      const buildBody = (modelId: string) => {
        const body = new FormData();
        body.append("modelId", modelId);
        body.append("type", "fashion");
        body.append("fashionSubtype", form.fashionSubtype || savedFashionSubtype || "clothes");
        body.append("mode", isAutoMode ? "auto" : "manual");
        if (!isAutoMode) {
          body.append("generationTarget", generationRequirements.generationTarget);
          body.append("garmentZone", generationRequirements.generationTarget === "bottom" ? "bottom" : "top");
          if (companionZones.includes("top") && cw.companionTopType) body.append("companionTopType", cw.companionTopType);
          if (companionZones.includes("bottom") && cw.companionBottomType) body.append("companionBottomType", cw.companionBottomType);
          if (companionZones.includes("footwear") && cw.companionFootwearType) body.append("footwearType", cw.companionFootwearType);
          if (companionZones.includes("top") && cw.companionTopColor) { body.append("topColorName", cw.companionTopColor.name); body.append("topColorHex", cw.companionTopColor.hex); }
          if (companionZones.includes("bottom") && cw.companionBottomColor) { body.append("bottomColorName", cw.companionBottomColor.name); body.append("bottomColorHex", cw.companionBottomColor.hex); }
          if (companionZones.includes("footwear") && cw.companionFootwearColor) { body.append("shoesColorName", cw.companionFootwearColor.name); body.append("shoesColorHex", cw.companionFootwearColor.hex); }
          if (cw.additionalInstructions && cw.additionalInstructions.trim()) {
            body.append("additionalInstructions", cw.additionalInstructions.trim());
          }
        }
        body.append("front", frontFile); body.append("back", backFile);
        return body;
      };
      const startJob = async (modelId: string): Promise<string> => {
        const res = await fetch("/api/products/generate", withAuthRequest({ method: "POST", body: buildBody(modelId) }));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to start generation.");
        return String(data.job_id || "");
      };

      if (isUnisex) {
        // Fire the male and female model passes in parallel.
        const [menJob, womenJob] = await Promise.all([
          startJob(selectedModelId),
          startJob(selectedFemaleModelId),
        ]);
        updateColorway(colorwayId, { generateJobId: menJob, altGenerateJobId: womenJob, generateStatus: "processing" });
      } else {
        const job = await startJob(selectedModelId);
        updateColorway(colorwayId, { generateJobId: job, generateStatus: "processing" });
      }
    } catch (error) {
      updateColorway(colorwayId, { generateStatus: "failed", generateError: error instanceof Error ? error.message : "Network error" });
    }
  };

  useEffect(() => {
    // One subscription per active generation job. Unisex colorways have two
    // (a male and a female pass); each tags its results with the right gender.
    type JobSub = {
      colorwayId: string;
      jobId: string;
      jobField: "generateJobId" | "altGenerateJobId";
      gender: "men" | "women" | null;
    };
    const jobs: JobSub[] = [];
    for (const cw of colorways) {
      if (cw.generateStatus !== "processing") continue;
      if (cw.generateJobId) {
        jobs.push({
          colorwayId: cw.id,
          jobId: cw.generateJobId,
          jobField: "generateJobId",
          gender: isUnisex ? "men" : null,
        });
      }
      if (cw.altGenerateJobId) {
        jobs.push({
          colorwayId: cw.id,
          jobId: cw.altGenerateJobId,
          jobField: "altGenerateJobId",
          gender: "women",
        });
      }
    }
    if (jobs.length === 0) return;

    const unsubscribers = jobs.map((job) =>
      subscribeToJob(job.jobId, (update) => {
        if (update.status === "failed") {
          applyColorwayGenerationFailure(job.colorwayId, update.error || "Generation failed.");
          return;
        }
        if (update.status !== "completed") return;
        const subtype = form.fashionSubtype || savedFashionSubtype || "clothes";
        const viewList = subtype === "shoes" ? ["front", "back", "left", "right"] : ["front", "back"];
        void applyColorwayGenerationCompletion(job.colorwayId, viewList, update.images, {
          gender: job.gender,
          jobField: job.jobField,
        });
      })
    );

    return () => {
      unsubscribers.forEach((fn) => fn());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorways]);

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

  useEffect(() => {
    hasHydratedProductRef.current = false;
    hasSyncedInitialCategoriesRef.current = false;
    previousProductTypeRef.current = null;
    previousFashionSubtypeRef.current = null;
    previousGenerationTargetRef.current = null;

    fetch("/api/categories", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []));

    fetch("/api/models", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setModels(d.models || []));

    const authRequest = fetch("/api/admin/auth/me", withAuthRequest())
      .then((r) => r.json())
      .then((d) => {
        const role = d.user?.role || "";
        setUserRole(role);
        setUserStoreName(d.user?.storeName || "");
        setUserStoreType(d.user?.storeType || "");
        if (role === "store_owner") return role;

        fetch("/api/generated-images", withAuthRequest())
          .then((r) => r.json())
          .then((data) => setGeneratedImages(data.generatedImages || []));

        return role;
      })
      .catch(() => "");

    authRequest
      .then((role) =>
        fetch(`/api/products/${id}`, withAuthRequest())
          .then((r) => r.json())
          .then((d) => ({ role, productResponse: d }))
      )
      .then(({ productResponse }) => {
        const d = productResponse;
        if (!d.product) return;

        const p = d.product;
        const nextVariants = parseApiVariants(p.variants);
        const nextFullStock = nextVariants.length > 0
          ? nextVariants.reduce((sum, row) => sum + Math.max(0, Number(row.fullStock || 0)), 0)
          : Math.max(Number(p.fullStock ?? p.stock ?? 1), 0);
        const loadedFormData = {
          name: p.name,
          price: p.price.toString(),
          description: p.description || "",
          brand: p.brand || "",
          reference: p.reference || "",
          stock: String(p.fullStock ?? p.stock ?? 1),
          tag: p.tag || "",
          newTagDurationDays: String(p.newTagDurationDays ?? 3),
          conditionScore: String(p.conditionScore ?? 9),
          productType: (p.productType === "perfume" ? "perfume" : "fashion") as "perfume" | "fashion",
          fashionSubtype: "" as FashionSubtype,
          originPictures: {
            front: p.originPictures?.front || "",
            back: p.originPictures?.back || "",
            left: p.originPictures?.left || "",
            right: p.originPictures?.right || "",
          },
          cloneSourceName: p.cloneSourceName || "",
          cloneSourceImage: p.cloneSourceImage || "",
        };
        loadedFormData.stock = String(nextFullStock);
        setForm(loadedFormData);
        setExistingVariants(nextVariants);
        setSoldQuantity(Math.max(Number(p.soldQuantity ?? 0), 0));
        setSavedFashionSubtype(p.fashionSubtype || "clothes");
        setInitialCategorySlugs(p.categories || []);
        setProductGender(
          ["men", "women", "children", "unisex"].includes(p.gender) ? p.gender : null
        );

        // Initialize colorways from native variants for store owners.
        if (nextVariants.length > 0) {
          const isShoesProduct = p.fashionSubtype === "shoes";
          const colorwayMap = new Map<string, { hex: string; rows: VariantRow[] }>();
          for (const row of nextVariants) {
            const hex = normalizeHex(row.color);
            const key = hex || `__images:${row.images.join(",") || row._id || row.uiId}`;
            const group = colorwayMap.get(key) || { hex, rows: [] };
            group.rows.push(row);
            colorwayMap.set(key, group);
          }
          if (colorwayMap.size > 0) {
            const productImages: ProductImage[] = p.images || [];
            const originPictureUrls: Record<ColorwayView, string> = {
              front: p.originPictures?.front || "",
              back: p.originPictures?.back || "",
              left: p.originPictures?.left || "",
              right: p.originPictures?.right || "",
            };
            type SavedCompanionSettings = {
              topType?: string; topColor?: { name: string; hex: string } | null;
              bottomType?: string; bottomColor?: { name: string; hex: string } | null;
              footwearType?: string; footwearColor?: { name: string; hex: string } | null;
              additionalInstructions?: string;
            };
            const savedCompanion = p.companionSettings as Record<string, SavedCompanionSettings> | null;
            const loadedColorways: Colorway[] = Array.from(colorwayMap.values()).map(({ hex, rows }) => {
              const indices = rows.find((row) => row.images.length > 0)?.images || [];
              const sizes = rows.map((row) => ({
                id: generateId(),
                size: row.size,
                stock: String(row.fullStock),
                conditionScore: String(row.conditionScore ?? 9),
              }));
              const colorwayViews: ColorwayView[] = isShoesProduct ? FOUR_IMAGE_VIEWS : ["front", "back"];
              const publicOrderByImageIndex = new Map<number, string>();
              const publicIndices = indices.length > 0
                ? indices
                : productImages
                    .map((image, imageIndex) => ({ image, imageIndex }))
                    .filter(({ image }) => image.isPublic !== false)
                    .map(({ imageIndex }) => imageIndex);
              publicIndices.forEach((imageIndex, orderIndex) => {
                publicOrderByImageIndex.set(imageIndex, orderIndex === 0 ? "main" : String(orderIndex + 1));
              });
              const selectedIndexSet = new Set(indices);
              const normalizedHex = hex.trim().toLowerCase();
              const colorMatches = (value: string | null | undefined) =>
                normalizeHex(value || "").trim().toLowerCase() === normalizedHex;
              const imageEntries = productImages
                .map((image, imageIndex) => ({ image, imageIndex }))
                .filter(({ image, imageIndex }) => {
                  if (!image?.url) return false;
                  if (selectedIndexSet.has(imageIndex)) return true;
                  const hasColorMeta = typeof image.color === "string" && image.color.trim().length > 0;
                  return hasColorMeta ? colorMatches(image.color) : !normalizedHex && colorwayMap.size === 1;
                });
              const publicImageOrder: Record<string, string> = {};
              const setPublicOrder = (key: string, imageIndex: number) => {
                const order = productImages[imageIndex]?.isPublic === false
                  ? ""
                  : publicOrderByImageIndex.get(imageIndex) || "";
                if (order) publicImageOrder[key] = order;
              };
              const savedViewUrls: Partial<Record<ColorwayView, string>> = {};
              const savedEnhancedViewUrls: Partial<Record<ColorwayView, string>> = {};
              const otherPictures: Array<{ url: string; file: File | null }> = [];
              const enhancedOtherPictures: Array<{ url: string; file: File | null }> = [];
              const generatedPictures: Array<{ url: string; file: File | null; gender?: "men" | "women" | null }> = [];
              const addOtherPicture = (url: string, imageIndex: number) => {
                const key = `originalOther:${otherPictures.length}`;
                otherPictures.push({ url, file: null });
                setPublicOrder(key, imageIndex);
              };
              const addEnhancedOtherPicture = (url: string, imageIndex: number) => {
                const key = `enhancedOther:${enhancedOtherPictures.length}`;
                enhancedOtherPictures.push({ url, file: null });
                setPublicOrder(key, imageIndex);
              };
              // Track per-gender model pics so the first one seen (saved front-first)
              // restores as the Front view and the next as Back view.
              let menGenSeen = 0;
              let womenGenSeen = 0;
              const addGeneratedPicture = (url: string, imageIndex: number, gender?: "men" | "women" | null) => {
                const key = `generated:${generatedPictures.length}`;
                generatedPictures.push({ url, file: null, gender: gender ?? null });
                if ((gender === "men" || gender === "women") && productImages[imageIndex]?.isPublic !== false) {
                  const isFront = (gender === "men" ? menGenSeen : womenGenSeen) === 0;
                  if (gender === "men") menGenSeen += 1;
                  else womenGenSeen += 1;
                  publicImageOrder[key] =
                    gender === "women"
                      ? isFront ? "model-women-front" : "model-women-back"
                      : isFront ? "model-men-front" : "model-men-back";
                } else {
                  setPublicOrder(key, imageIndex);
                }
              };
              const assignedImageIndexes = new Set<number>();
              imageEntries.forEach(({ image, imageIndex }) => {
                const source = image.source || "";
                const sourceKey = image.sourceKey || "";
                if (source === "generated") {
                  addGeneratedPicture(image.url, imageIndex, image.gender);
                  assignedImageIndexes.add(imageIndex);
                  return;
                }
                if (source === "enhanced") {
                  const enhancedView = sourceKey.startsWith("enhanced:")
                    ? (sourceKey.split(":")[1] as ColorwayView | undefined)
                    : undefined;
                  if (enhancedView && colorwayViews.includes(enhancedView)) {
                    savedEnhancedViewUrls[enhancedView] = image.url;
                    setPublicOrder(`enhanced:${enhancedView}`, imageIndex);
                  } else {
                    addEnhancedOtherPicture(image.url, imageIndex);
                  }
                  assignedImageIndexes.add(imageIndex);
                  return;
                }
                if (source === "original" || sourceKey.startsWith("original")) {
                  const originalView = sourceKey.startsWith("original:")
                    ? (sourceKey.split(":")[1] as ColorwayView | undefined)
                    : undefined;
                  if (originalView && colorwayViews.includes(originalView)) {
                    savedViewUrls[originalView] = image.url;
                    setPublicOrder(`original:${originalView}`, imageIndex);
                  } else {
                    addOtherPicture(image.url, imageIndex);
                  }
                  assignedImageIndexes.add(imageIndex);
                }
              });
              indices.forEach((imageIndex, offset) => {
                if (assignedImageIndexes.has(imageIndex)) return;
                const image = productImages[imageIndex];
                if (!image?.url) return;
                const view = colorwayViews[offset];
                if (view && !savedViewUrls[view]) {
                  savedViewUrls[view] = image.url;
                  setPublicOrder(`original:${view}`, imageIndex);
                  return;
                }
                addOtherPicture(image.url, imageIndex);
              });
              if (!isShoesProduct && indices.length === 1 && !savedViewUrls.front) {
                savedViewUrls.front = productImages[indices[0]]?.url || "";
                if (savedViewUrls.front) setPublicOrder("original:front", indices[0]);
              }
              const useOriginPictureFallback = colorwayMap.size === 1 && indices.length === 0;
              const resolvedViewUrls: Record<ColorwayView, string> = {
                front: savedViewUrls.front || (useOriginPictureFallback ? originPictureUrls.front : ""),
                back: savedViewUrls.back || (useOriginPictureFallback ? originPictureUrls.back : ""),
                left: savedViewUrls.left || (useOriginPictureFallback ? originPictureUrls.left : ""),
                right: savedViewUrls.right || (useOriginPictureFallback ? originPictureUrls.right : ""),
              };
              const enhanceStatus: ColorwayEnhanceStatus = "idle";
              const csEntry = savedCompanion
                ? (savedCompanion[hex] ||
                   savedCompanion[hex.toUpperCase()] ||
                   savedCompanion[hex.toLowerCase()] ||
                   savedCompanion[hex.trim()] ||
                   Object.entries(savedCompanion).find(
                     ([key]) => key.trim().toLowerCase() === normalizedHex
                   )?.[1])
                : null;
              const cs = csEntry || null;
              return {
                ...createEmptyColorway(),
                hex,
                sizes,
                frontPreview: resolvedViewUrls.front,
                backPreview: resolvedViewUrls.back,
                leftPreview: resolvedViewUrls.left,
                rightPreview: resolvedViewUrls.right,
                enhancedFrontUrl: savedEnhancedViewUrls.front || "",
                enhancedBackUrl: savedEnhancedViewUrls.back || "",
                enhancedLeftUrl: savedEnhancedViewUrls.left || "",
                enhancedRightUrl: savedEnhancedViewUrls.right || "",
                enhancedOtherImages: enhancedOtherPictures,
                enhanceStatus,
                otherImages: otherPictures,
                generatedImages: generatedPictures,
                publicImageOrder,
                generateStatus: "idle",
                companionTopType: cs?.topType || "",
                companionTopColor: cs?.topColor || null,
                companionBottomType: cs?.bottomType || "",
                companionBottomColor: cs?.bottomColor || null,
                companionFootwearType: cs?.footwearType || "",
                companionFootwearColor: cs?.footwearColor || null,
                additionalInstructions: cs?.additionalInstructions || "",
              };
            });
            setColorways(loadedColorways);

            // Restore admin-flow global companion settings
            const global = savedCompanion?.["__global__"];
            if (global) {
              if (global.topType) setCompanionTopType(global.topType as CompanionTopType);
              if (global.topColor) setSecondaryTopColor(global.topColor);
              if (global.bottomType) setCompanionBottomType(global.bottomType as CompanionBottomType);
              if (global.bottomColor) setSecondaryBottomColor(global.bottomColor);
              if (global.footwearType) setFootwearType(global.footwearType as FootwearType);
              if (global.footwearColor) setShoesColor(global.footwearColor);
            }
          }
        }

        const loadedProductMedia = (p.images || []).map((image: ProductImage) => ({
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
        const loadedGenerationInputs: GenerationInputs = {
          front: p.originPictures?.front ? { file: null, previewUrl: p.originPictures.front } : createEmptySlot(),
          back: p.originPictures?.back ? { file: null, previewUrl: p.originPictures.back } : createEmptySlot(),
          left: p.originPictures?.left ? { file: null, previewUrl: p.originPictures.left } : createEmptySlot(),
          right: p.originPictures?.right ? { file: null, previewUrl: p.originPictures.right } : createEmptySlot(),
        };
        const hasPersistedProductMedia =
          loadedProductMedia.length > 0 ||
          Boolean(p.modelId) ||
          Boolean(
            loadedGenerationInputs.front.previewUrl ||
              loadedGenerationInputs.back.previewUrl ||
              loadedGenerationInputs.left.previewUrl ||
              loadedGenerationInputs.right.previewUrl
          );
        setGeneratedModelMedia(loadedProductMedia);
        setShowProductMediaSection(hasPersistedProductMedia);
        setGenerationInputs(loadedGenerationInputs);
        if (p.modelId) setSelectedModelId(p.modelId);
        const globalCs = (p.companionSettings as Record<string, { topType?: string; topColor?: { name: string; hex: string } | null; bottomType?: string; bottomColor?: { name: string; hex: string } | null; footwearType?: string; footwearColor?: { name: string; hex: string } | null; }> | null)?.["__global__"];
        if (globalCs) {
          if (globalCs.topType) setCompanionTopType(globalCs.topType as CompanionTopType);
          if (globalCs.topColor) setSecondaryTopColor(globalCs.topColor);
          if (globalCs.bottomType) setCompanionBottomType(globalCs.bottomType as CompanionBottomType);
          if (globalCs.bottomColor) setSecondaryBottomColor(globalCs.bottomColor);
          if (globalCs.footwearType) setFootwearType(globalCs.footwearType as FootwearType);
          if (globalCs.footwearColor) setShoesColor(globalCs.footwearColor);
        }
        setImages(loadedImages);
        savedSnapshot.current = {
          form: loadedFormData,
          images: loadedImages,
          generatedModelMedia: loadedProductMedia,
          generationInputs: loadedGenerationInputs,
          initialCategorySlugs: loadedCategorySlugs,
          showProductMediaSection: hasPersistedProductMedia,
        };
        hasHydratedProductRef.current = true;
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [id]);

  useEffect(() => {
    if (categories.length === 0 || initialCategorySlugs.length === 0) return;
    // For unisex the product carries both gendered chains; collapse to the
    // men-side leaf as the canonical selection so the picker shows one entry.
    const syncSlugs =
      productGender === "unisex"
        ? (() => {
            const menLeaf = initialCategorySlugs.find(
              (slug) => mapLeafAcrossGenders(slug, categories)?.men === slug
            );
            return menLeaf ? [menLeaf] : initialCategorySlugs;
          })()
        : initialCategorySlugs;
    const path = getCategoryPath(categories, syncSlugs);
    setSelectedParentSlug(path.parent);
    setSelectedChildSlug(path.child);
    setSelectedGrandchildSlug(path.grandchild);
    setSelectedGreatGrandchildSlug(path.greatGrandchild || "");
    const leafSlug = path.greatGrandchild || path.grandchild || path.child || path.parent;
    const leaf = categories.find((c) => c.slug === leafSlug);
    if (leaf) {
      setCategorySearch(
        productGender === "unisex" ? leaf.name : getCategoryPathLabel(categories, leaf)
      );
    }
    hasSyncedInitialCategoriesRef.current = true;
  }, [categories, initialCategorySlugs, productGender]);

  const isUnisex = productGender === "unisex";
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
    // Unisex products choose from the leaves shared by Men and Women; the
    // men-side slug is the canonical pick and the label is gender-neutral.
    if (isUnisex) {
      return getSharedLeaves(categories).map((shared) => ({
        slug: shared.men,
        label: shared.name,
      }));
    }
    const visible = usesStoreOwnerEditFlow
      ? categories.filter(
        (category) => !categories.some((other) => other.parentSlug === category.slug)
      )
      : categories;
    return visible.map((category) => ({
      slug: category.slug,
      label: getCategoryPathLabel(categories, category),
    }));
  }, [categories, usesStoreOwnerEditFlow, isUnisex]);
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
  // For unisex we need a female model in addition to the (male) primary picker.
  const femaleModels = useMemo(
    () => models.filter((model) => model.gender === "female" || model.gender === "child"),
    [models]
  );
  const selectedModel = filteredModels.find((model) => model._id === selectedModelId);

  useEffect(() => {
    if (!needsModelSelection) return;
    if (selectedModelId && filteredModels.some((model) => model._id === selectedModelId)) return;
    if (filteredModels.length === 0) return;
    setSelectedModelId(filteredModels[0]._id);
  }, [filteredModels, needsModelSelection, selectedModelId]);
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
  const hasPendingEnhanceOriginPictures = requiredOriginPictureKeys.some((key) => Boolean(originPictureFiles[key]));
  const canSelectOriginPictures = Boolean(selectedCategorySlug);

  const scrollToElement = (element: HTMLElement | null | undefined) => {
    if (!element) return false;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  };

  const scrollToColorwayCard = (colorwayId: string | undefined) => {
    if (!colorwayId) return false;
    return scrollToElement(document.querySelector(`[data-colorway-id="${colorwayId}"]`) as HTMLElement | null);
  };
  const fullStock = Math.max(Number(form.stock || 0), 0);
  const availableStock = Math.max(fullStock - soldQuantity, 0);

  const syncInventoryState = (product: {
    stock?: number;
    fullStock?: number;
    soldQuantity?: number;
    variants?: unknown;
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

    if (Array.isArray(product.variants)) {
      const rows = parseApiVariants(product.variants);
      setExistingVariants(rows);
      if (rows.length > 0) {
        setForm((current) => ({
          ...current,
          stock: String(rows.reduce((sum, row) => sum + Math.max(0, Number(row.fullStock || 0)), 0)),
        }));
      }
    }
  };

  const handleSubmitSelectedSizeStock = async (uiId: string) => {
    const row = existingVariants.find((item) => item.uiId === uiId);
    if (!row) return;
    const amount = Math.max(0, Number(row.restockAmount || 0));
    if (amount <= 0) return;

    setError("");
    updateExistingVariant(uiId, { savingRestock: true });

    try {
      const response = await fetch(
        `/api/products/${id}`,
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sizeStockMode: "restock",
            variants: [
              {
                ...(row._id ? { _id: row._id } : {}),
                size: row.size,
                color: row.color,
                fullStock: amount,
                conditionScore: row.conditionScore,
                images: row.images,
              },
            ],
          }),
        })
      );
      const data = await response.json();
      if (!response.ok || !data.product) {
        setError(data.error || "Unable to save size stock.", "basics");
        return;
      }

      syncInventoryState(data.product);
    } catch {
      setError("Network error", "basics");
    } finally {
      updateExistingVariant(uiId, { savingRestock: false, restockAmount: "0" });
    }
  };

  const handleRemoveExistingSize = async (uiId: string) => {
    const remainingVariants = existingVariants
      .filter((item) => item.uiId !== uiId)
      .map(toOutgoingVariant);

    setError("");
    updateExistingVariant(uiId, { savingRestock: true });

    try {
      const response = await fetch(
        `/api/products/${id}`,
        withAuthRequest({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sizeStockMode: "full",
            variants: remainingVariants,
          }),
        })
      );
      const data = await response.json();
      if (!response.ok || !data.product) {
        setError(data.error || "Unable to remove size.", "basics");
        return;
      }

      syncInventoryState(data.product);
    } catch {
      setError("Network error", "basics");
    } finally {
      updateExistingVariant(uiId, { savingRestock: false });
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
        setError(data.error || "Unable to add stock.", "basics");
        return;
      }

      setForm((current) => ({
        ...current,
        stock: String(nextStock),
      }));
      setSoldQuantity(Math.max(Number(data.product.soldQuantity ?? soldQuantity), 0));
      setRestockAmount("0");
    } catch {
      setError("Network error", "basics");
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
      setError(`Unable to use this image for the ${key} origin picture.`, "media");
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
    if (!hasHydratedProductRef.current || !hasSyncedInitialCategoriesRef.current) return;

    const previousProductType = previousProductTypeRef.current;
    const previousFashionSubtype = previousFashionSubtypeRef.current;
    const previousGenerationTarget = previousGenerationTargetRef.current;
    previousProductTypeRef.current = form.productType;
    previousFashionSubtypeRef.current = generationRequirements.fashionSubtype;
    previousGenerationTargetRef.current = generationRequirements.generationTarget;

    const isFirstHydratedRun =
      previousProductType === null &&
      previousFashionSubtype === null &&
      previousGenerationTarget === null;
    if (isFirstHydratedRun) {
      return;
    }

    if (form.productType !== "fashion") {
      setGenerationTarget("");
      if (previousProductType && previousProductType !== form.productType) {
        setSelectedModelId("");
        setCompanionTopType("");
        setCompanionBottomType("");
        setFootwearType("");
        setSecondaryTopColor(null);
        setSecondaryBottomColor(null);
        setShoesColor(null);
        setGenerationInputs(initialGenerationInputs);
        setOriginPictureFiles(emptyOriginPictureFiles);
        setGeneratedModelMedia([]);
        setShowProductMediaSection(false);
      }
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

    const fashionSubtypeChanged =
      previousFashionSubtype !== null &&
      previousFashionSubtype !== generationRequirements.fashionSubtype;
    const generationTargetChanged =
      previousGenerationTarget !== null &&
      previousGenerationTarget !== generationRequirements.generationTarget;

    if (
      (previousProductType && previousProductType !== form.productType) ||
      fashionSubtypeChanged ||
      generationTargetChanged
    ) {
      setSelectedModelId("");
      setCompanionTopType("");
      setCompanionBottomType("");
      setFootwearType("");
      setSecondaryTopColor(null);
      setSecondaryBottomColor(null);
      setShoesColor(null);
      setGenerationInputs(initialGenerationInputs);
      setOriginPictureFiles(emptyOriginPictureFiles);
      setGeneratedModelMedia([]);
      setShowProductMediaSection(false);
    }
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
    const generatedIds = new Set(generatedModelMedia.map((image) => image.id).filter(Boolean));
    const generatedUrls = new Set(generatedModelMedia.map((image) => image.url));
    const hasEnhancedMedia = requiredOriginPictureKeys.some((key) => Boolean(generationInputs[key].previewUrl));

    setImages((current) =>
      current.filter((image) => {
        const imageId = image.id || "";
        return !generatedIds.has(imageId) && !generatedUrls.has(image.url);
      })
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setLoading(true);

    if (!usesStoreOwnerEditFlow) {
      setLoading(false);
      return;
    }

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
    if (colorways.length > 1 && colorways.some((cw) => !cw.hex.trim())) {
      setError("Please assign a color to every colorway before adding more than one.", "colorways");
      scrollToColorwayCard(colorways.find((cw) => !cw.hex.trim())?.id);
      setLoading(false);
      return;
    }
    if (needsModelSelection && !selectedModelId) {
      setError("Please select a model first.", "model");
      scrollToElement(modelPicturesSectionRef.current);
      setLoading(false);
      return;
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
      // For unisex, expand the chosen leaf to both gendered chains so the
      // product lists under Men and Women; otherwise save the single chain.
      let productCategories: string[];
      if (isUnisex && selectedCategorySlug) {
        const pair = mapLeafAcrossGenders(selectedCategorySlug, categories);
        if (pair) {
          const chainSlugs = (slug: string) =>
            getCategoryAncestors(categories, slug).map((c) => c.slug);
          productCategories = Array.from(
            new Set([...chainSlugs(pair.men), ...chainSlugs(pair.women)])
          );
        } else {
          productCategories = [selectedParentSlug, selectedChildSlug, selectedGrandchildSlug, selectedGreatGrandchildSlug].filter(Boolean);
        }
      } else {
        productCategories = [selectedParentSlug, selectedChildSlug, selectedGrandchildSlug, selectedGreatGrandchildSlug].filter(Boolean);
      }
      type VariantEntry = { size: string; color: string; stock: number; conditionScore: number };
      const allVariants: VariantEntry[] = [];
      for (const cw of colorways) {
        const colorKey = normalizeHex(cw.hex);
        for (const s of cw.sizes.filter((s) => (isSizelessCategory ? s.stock.trim() : s.size.trim() && s.stock.trim()))) {
          allVariants.push({
            size: isSizelessCategory ? "" : s.size.trim(),
            color: colorKey,
            stock: Math.max(0, Number(s.stock || 0)),
            conditionScore: Math.max(1, Math.min(10, Number(s.conditionScore || 9))),
          });
        }
      }
      const totalStock = allVariants.reduce((sum, v) => sum + v.stock, 0);
      const body = new FormData();
      body.append("name", form.name);
      body.append("price", form.price);
      body.append("brand", form.brand);
      body.append("reference", form.reference);
      body.append("description", "");
      body.append("productType", "fashion");
      body.append("fashionSubtype", form.fashionSubtype || savedFashionSubtype || "clothes");
      body.append("stock", String(totalStock));
      body.append("fullStock", String(totalStock));
      body.append("categories", JSON.stringify(productCategories));
      if (productGender) body.append("gender", productGender);
      body.append("mainImageIndex", "0");
      if (selectedModelId) body.append("modelId", selectedModelId);

      const companionSettingsPayload: Record<string, object> = {};
      for (const cw of colorways) {
        const colorKey = normalizeHex(cw.hex);
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

      const imageFiles: File[] = [];
      const imageOrder: string[] = [];
      const imageMeta: Record<string, { isPublic: boolean; source: string; color: string | null; sourceKey: string; gender: "men" | "women" | null }> = {};
      const existingImagesPayload: { url: string }[] = [];
      const existingUrlToOrderIndex = new Map<string, number>();
      const imagesByHex: Record<string, number[]> = {};
      const isUploadableUrl = (url: string) => Boolean(url) && !url.startsWith("blob:") && !url.startsWith("data:");
      const applyImageMeta = (
        orderKey: string,
        item: { key: string; order: string; source: string; gender?: "men" | "women" | null },
        colorKey: string
      ) => {
        imageMeta[orderKey] = {
          isPublic: Boolean(item.order),
          source: item.source,
          color: colorKey || null,
          sourceKey: item.key,
          gender: item.gender ?? null,
        };
      };
      const pushExisting = (url: string, item?: { key: string; order: string; source: string; gender?: "men" | "women" | null }, colorKey = ""): number => {
        const cached = existingUrlToOrderIndex.get(url);
        if (cached !== undefined) {
          const existingKey = imageOrder[cached];
          if (item && existingKey) applyImageMeta(existingKey, item, colorKey);
          return cached;
        }
        const idx = imageOrder.length;
        existingImagesPayload.push({ url });
        existingUrlToOrderIndex.set(url, idx);
        const orderKey = `existing:${url}`;
        imageOrder.push(orderKey);
        if (item) applyImageMeta(orderKey, item, colorKey);
        return idx;
      };
      const pushNew = (file: File, item?: { key: string; order: string; source: string; gender?: "men" | "women" | null }, colorKey = ""): number => {
        const idx = imageOrder.length;
        const newIdx = imageFiles.length;
        imageFiles.push(file);
        const orderKey = `new:${newIdx}`;
        imageOrder.push(orderKey);
        if (item) applyImageMeta(orderKey, item, colorKey);
        return idx;
      };
      let mainImageKey = "";
      type SavePictureItem = { key: string; order: string; file: File | null; url: string; source: string; gender: "men" | "women" | null };
      const orderRank = (order: string) => {
        // Model front/back (unisex) always come before the product pictures.
        if (order === "model-men-front") return -4;
        if (order === "model-women-front") return -3;
        if (order === "model-men-back") return -2;
        if (order === "model-women-back") return -1;
        if (order === "main") return 0;
        const numeric = Number(order);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 999;
      };
      for (const cw of colorways) {
        const colorKey = normalizeHex(cw.hex);
        const indices: number[] = [];
        const pictureItems: SavePictureItem[] = [];
        const addPictureItem = (key: string, file: File | null, url: unknown, source: string, gender: "men" | "women" | null = null) => {
          const stringUrl = typeof url === "string" ? url : "";
          if (!file && !isUploadableUrl(stringUrl)) return;
          pictureItems.push({
            key,
            order: cw.publicImageOrder[key] || "",
            file,
            url: stringUrl,
            source,
            gender,
          });
        };
        for (const view of requiredOriginPictureKeys) {
          addPictureItem(
            `original:${view}`,
            cw[`${view}File` as "frontFile" | "backFile" | "leftFile" | "rightFile"],
            cw[`${view}Preview` as keyof Colorway],
            "original"
          );
        }
        cw.otherImages.forEach((image, imageIndex) => {
          addPictureItem(`originalOther:${imageIndex}`, image.file, image.url, "original");
        });
        cw.generatedImages.forEach((image, imageIndex) => {
          addPictureItem(`generated:${imageIndex}`, image.file, image.url, "generated", image.gender ?? null);
        });
        for (const view of requiredOriginPictureKeys) {
          const enhancedFile = cw[`enhanced${view.charAt(0).toUpperCase()}${view.slice(1)}File` as keyof Colorway];
          const enhancedUrl = cw[`enhanced${view.charAt(0).toUpperCase()}${view.slice(1)}Url` as keyof Colorway];
          addPictureItem(
            `enhanced:${view}`,
            enhancedFile instanceof File ? enhancedFile : null,
            enhancedUrl,
            "enhanced"
          );
        }
        cw.enhancedOtherImages.forEach((image, imageIndex) => {
          addPictureItem(`enhancedOther:${imageIndex}`, image.file, image.url, "enhanced");
        });
        const hasManualPublicOrder = Object.values(cw.publicImageOrder).some(Boolean);
        const orderedItems = hasManualPublicOrder
          ? pictureItems
              .filter((item) => item.order)
              .sort((a, b) => orderRank(a.order) - orderRank(b.order))
          : [];
        const appendItem = (item: SavePictureItem, includeInVariant: boolean) => {
          const beforeIndex = imageOrder.length;
          let index: number | null = null;
          if (item.file) index = pushNew(item.file, item, colorKey);
          else if (isUploadableUrl(item.url)) index = pushExisting(item.url, item, colorKey);
          if (index !== null) {
            if (includeInVariant) indices.push(index);
            if (!mainImageKey && (item.order === "main" || beforeIndex === 0)) {
              mainImageKey = imageOrder[index];
            }
          }
        };
        for (const item of orderedItems) {
          appendItem(item, true);
        }
        for (const item of pictureItems) {
          if (orderedItems.includes(item)) continue;
          appendItem(item, false);
        }
        if (indices.length > 0) imagesByHex[colorKey] = indices;
      }
      if (!mainImageKey && imageOrder.length > 0) mainImageKey = imageOrder[0];
      if (mainImageKey) body.append("mainImageKey", mainImageKey);
      body.append("imageMeta", JSON.stringify(imageMeta));
      const compressedImages = await Promise.all(imageFiles.map((f) => compressImageFile(f)));
      compressedImages.forEach((f) => body.append("images", f));

      const variantsPayload = allVariants.map((v) => {
        const hex = normalizeHex(v.color);
        const existing = existingVariants.find(
          (row) => row.size.trim() === v.size && normalizeHex(row.color) === hex
        );
        return {
          ...(existing?._id ? { _id: existing._id } : {}),
          size: v.size,
          color: hex || null,
          fullStock: v.stock,
          conditionScore: v.conditionScore,
          images: imagesByHex[hex] || [],
        };
      });
      body.append("variants", JSON.stringify(variantsPayload));
      body.append("existingImages", JSON.stringify(existingImagesPayload));
      body.append("imageOrder", JSON.stringify(imageOrder));

      const firstCw = colorways[0];
      const frontOriginFile = firstCw.frontFile;
      const backOriginFile = firstCw.backFile;
      const leftOriginFile = firstCw.leftFile;
      const rightOriginFile = firstCw.rightFile;
      if (frontOriginFile) body.append("originPictureFrontFile", await compressImageFile(frontOriginFile));
      else if (isUploadableUrl(form.originPictures.front)) body.append("originPictureFront", form.originPictures.front);
      else if (isUploadableUrl(firstCw.frontPreview)) body.append("originPictureFront", firstCw.frontPreview);
      if (backOriginFile) body.append("originPictureBackFile", await compressImageFile(backOriginFile));
      else if (isUploadableUrl(form.originPictures.back)) body.append("originPictureBack", form.originPictures.back);
      else if (isUploadableUrl(firstCw.backPreview)) body.append("originPictureBack", firstCw.backPreview);
      if (leftOriginFile) body.append("originPictureLeftFile", await compressImageFile(leftOriginFile));
      else if (isUploadableUrl(form.originPictures.left)) body.append("originPictureLeft", form.originPictures.left);
      else if (isUploadableUrl(firstCw.leftPreview)) body.append("originPictureLeft", firstCw.leftPreview);
      if (rightOriginFile) body.append("originPictureRightFile", await compressImageFile(rightOriginFile));
      else if (isUploadableUrl(form.originPictures.right)) body.append("originPictureRight", form.originPictures.right);
      else if (isUploadableUrl(firstCw.rightPreview)) body.append("originPictureRight", firstCw.rightPreview);

      const res = await fetch(`/api/products/${id}`, withAuthRequest({ method: "PUT", body }));
      if (!res.ok) {
        const d = await res.json();
        const message = d.error || "Unable to save product.";
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
  };

  if (fetching) return <p className="text-xs text-text-secondary animate-pulse">Loading product...</p>;
  if (isStoreOwner) {
    return (
      <div className="rounded-2xl border border-border bg-bg-card p-8 space-y-4 max-w-2xl">
        <p className="text-xs uppercase tracking-[0.22em] text-text-secondary">Product Access</p>
        <h1 className="text-xl font-semibold tracking-wide">Products cannot be edited after submission</h1>
        <p className="text-sm text-text-secondary">
          Submitted products are reviewed and completed by the admin team before they appear on the storefront.
        </p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/products")}
          className="bg-black text-white px-4 py-2 text-xs font-medium tracking-wide uppercase"
        >
          Back to Products
        </button>
      </div>
    );
  }
  if (usesStoreOwnerEditFlow) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-xl font-semibold tracking-wide">Edit Product</h1></div>
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
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-line" placeholder="e.g. Oversized Linen Shirt" />
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
              {usesStoreOwnerEditFlow && (
                <div>
                  <FieldLabel>Brand</FieldLabel>
                  <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="input-line" placeholder="e.g. Zara (optional)" />
                  <FieldError message={fieldErrors.brand} />
                </div>
              )}
              <div>
                <FieldLabel>Reference</FieldLabel>
                <input type="text" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="input-line" placeholder="SKU or internal reference" />
              </div>
              <div>
                <FieldLabel>Price (TND)</FieldLabel>
                <input type="number" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input-line" placeholder="0.00" />
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
                <div className="flex items-center gap-2">
                  <FieldLabel>Category</FieldLabel>
                  {isUnisex && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      Unisex
                    </span>
                  )}
                </div>
                {isUnisex && (
                  <p className="mb-1 text-[11px] text-text-secondary">
                    Pick one category — it&apos;s saved for both Men and Women.
                  </p>
                )}
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

          {selectedCategorySlug && canRunAnyGeneration && (
            <div ref={modelPicturesSectionRef}>
              <SectionCard title="Model Pictures" description="Choose one model for all colorways, then configure each colorway's companion outfit and generate." error={sectionErrors.model}>
              <div className="space-y-2">
                <FieldLabel>{isUnisex ? "Male model" : "Model"}</FieldLabel>
                <p className="text-[11px] text-text-secondary">
                  {isUnisex
                    ? "Unisex products generate a male and a female model set. Pick one model for each."
                    : "Pick the model first, then generate from each colorway's front and back pictures."}
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {filteredModels.map((model) => {
                    const active = selectedModelId === model._id;
                    return (
                      <button key={model._id} type="button" onClick={() => setSelectedModelId(model._id)} className={`flex-none w-[288px] overflow-hidden rounded border text-left transition-colors ${active ? "border-accent" : "border-border hover:border-accent"}`}>
                        <div className="aspect-[4/5] bg-bg-secondary"><img src={model.frontImage || model.images?.[0] || ""} alt={model.name} className="h-full w-full object-cover" /></div>
                        <div className="p-1.5"><p className="truncate text-[9px] font-medium">{model.name}</p></div>
                      </button>
                    );
                  })}
                </div>
              </div>
              {isUnisex && (
                <div className="mt-4 space-y-2">
                  <FieldLabel>Female model</FieldLabel>
                  <p className="text-[11px] text-text-secondary">Shown to shoppers browsing the Women category.</p>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {femaleModels.map((model) => {
                      const active = selectedFemaleModelId === model._id;
                      return (
                        <button key={model._id} type="button" onClick={() => setSelectedFemaleModelId(model._id)} className={`flex-none w-[288px] overflow-hidden rounded border text-left transition-colors ${active ? "border-accent" : "border-border hover:border-accent"}`}>
                          <div className="aspect-[4/5] bg-bg-secondary"><img src={model.frontImage || model.images?.[0] || ""} alt={model.name} className="h-full w-full object-cover" /></div>
                          <div className="p-1.5"><p className="truncate text-[9px] font-medium">{model.name}</p></div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedModelId && !usesStoreOwnerEditFlow && (
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
                      onGenerate={() => { void handleGenerateColorway(cw.id); }}
                    />
                  ))}
                </div>
              )}
              </SectionCard>
            </div>
          )}

          <div ref={colorwaysSectionRef}>
            <SectionCard title="Colorways" description="Each colorway is a color variant with its own images and sizes. Use the eyedropper on the swatch to pick the color directly from the uploaded photo." error={sectionErrors.colorways}>
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:overflow-x-auto pb-2">
              {colorways.map((cw, cwIndex) => (
                <ColorwayCard
                  key={cw.id}
                  colorway={cw}
                  index={cwIndex}
                  canRemove={colorways.length > 1}
                  isThrift={usesStoreOwnerEditFlow}
                  showGenerationPanel={usesStoreOwnerEditFlow && needsModelSelection}
                  companionZones={companionZones}
                  companionTypeOptions={companionTypeOptions}
                  canGenerate={canGenerateColorway(cw)}
                  requiredViews={requiresFourImageInputs ? ["front", "back", "left", "right"] : ["front", "back"]}
                  viewLabels={usesAccessoryImageWorkflow ? ACCESSORY_VIEW_LABELS : undefined}
                  enhanceRequiresAllViews={!usesAccessoryImageWorkflow}
                  hideSizeInput={isSizelessCategory}
                  onRemove={() => removeColorway(cw.id)}
                  onUpdate={(patch) => updateColorway(cw.id, patch)}
                  onEnhance={(pictureIndexes) => void handleEnhanceColorway(cw.id, pictureIndexes)}
                  onGenerate={() => { void handleGenerateColorway(cw.id); }}
                  onAddSize={() => addSizeRow(cw.id)}
                  onRemoveSize={(sizeId) => removeSizeRow(cw.id, sizeId)}
                  onUpdateSize={(sizeId, patch) => updateSizeRow(cw.id, sizeId, patch)}
                />
              ))}
            </div>
            </SectionCard>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="bg-text-primary text-bg-primary px-8 py-3 text-xs font-semibold tracking-wide uppercase disabled:opacity-50">
              {loading ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" onClick={() => router.back()} className="border border-border px-6 py-3 text-xs text-text-secondary uppercase tracking-wider">Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  return null;
}
