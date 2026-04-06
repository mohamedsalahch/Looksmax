"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/providers/AuthContext";
import ProductCard from "@/components/ProductCard";
import {
  addStudioRailItem,
  getStudioRailItems,
  StudioRailItem,
  subscribeToStudioRail,
} from "@/lib/studioRail";
import { formatTndPrice } from "@/lib/formatPrice";

interface CategoryNode {
  _id: string;
  name: string;
  slug: string;
  children?: CategoryNode[];
}

interface ProductImage {
  url: string;
  isMain: boolean;
}

interface StudioProduct {
  _id: string;
  name: string;
  price: number;
  categories: string[];
  images?: ProductImage[];
  brand?: string;
  stock?: number;
  reservationExpiresAt?: string | null;
  tag?: string;
  conditionScore?: number | null;
  conditionStatus?: string | null;
  productType?: "fashion" | "perfume" | "clothing" | "shoes";
  fashionSubtype?: "clothes" | "shoes" | null;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
}

interface OutfitSlotItem {
  id: string;
  name: string;
  image?: string;
  fashionSubtype?: "clothes" | "shoes" | null;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
}

interface SavedOutfitItem {
  id: string;
  name: string;
  images: {
    front?: string;
    back?: string;
  };
  isPublic: boolean;
  shareToken?: string;
  updatedAt: string;
}

const BODY_ZONES = [
  { id: "headwear", label: "Headwear" },
  { id: "outerwear", label: "Veste" },
  { id: "top", label: "Pull / Top" },
  { id: "bottom", label: "Jeans / Bottom" },
  { id: "footwear", label: "Shoes" },
] as const;

const ZONE_BUTTON_LABELS: Record<(typeof BODY_ZONES)[number]["id"], string> = {
  headwear: "Hat",
  outerwear: "Jacket",
  top: "Top",
  bottom: "Pants",
  footwear: "Shoes",
};

const ZONE_PREVIEW_POSITIONS: Record<
  (typeof BODY_ZONES)[number]["id"],
  { className: string; label: string }
> = {
  headwear: {
    className: "left-[-6px] top-[34px]",
    label: "Hat",
  },
  outerwear: {
    className: "right-[-8px] top-[112px]",
    label: "Jacket",
  },
  top: {
    className: "left-[-14px] top-[176px]",
    label: "Top",
  },
  bottom: {
    className: "right-[-10px] top-[248px]",
    label: "Pants",
  },
  footwear: {
    className: "left-1/2 top-[350px] -translate-x-1/2",
    label: "Shoes",
  },
};

const ZONE_DETAILS: Record<
  (typeof BODY_ZONES)[number]["id"],
  { title: string; type: string; fit: string; season: string; care: string }
> = {
  headwear: {
    title: "Headwear",
    type: "Accessory Layer",
    fit: "Top silhouette",
    season: "All seasons",
    care: "Optional piece",
  },
  outerwear: {
    title: "Outerwear",
    type: "Jacket / Veste",
    fit: "Top layer",
    season: "Cool weather",
    care: "Best with structure",
  },
  top: {
    title: "Top",
    type: "Pull / Shirt",
    fit: "Core layer",
    season: "All seasons",
    care: "Front and back views",
  },
  bottom: {
    title: "Bottom",
    type: "Jeans / Pants",
    fit: "Lower silhouette",
    season: "All seasons",
    care: "Front and back views",
  },
  footwear: {
    title: "Shoes",
    type: "Footwear",
    fit: "Grounding piece",
    season: "All seasons",
    care: "All angles supported",
  },
};

function getMainImage(images?: ProductImage[]) {
  return images?.find((image) => image.isMain)?.url || images?.[0]?.url;
}

function extractGeneratedImages(data: unknown) {
  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  const candidates = [
    ...(Array.isArray(record.imageBase64s) ? record.imageBase64s : []),
    record.front_image,
    record.back_image,
    record.imageFront,
    record.imageBack,
    record.imageBase64,
    record.image,
  ];

  return candidates
    .filter((image): image is string => typeof image === "string" && image.length > 0)
    .map((image) => (image.startsWith("data:") ? image : `data:image/png;base64,${image}`));
}

function getAvailableOutfitImages(images?: { front?: string; back?: string }) {
  return [images?.front, images?.back].filter(
    (image): image is string => typeof image === "string" && image.length > 0
  );
}

export default function OutfitStudioPage() {
  const { user, loading } = useAuth();
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<StudioProduct[]>([]);
  const [suggestedProducts, setSuggestedProducts] = useState<StudioProduct[]>([]);
  const [selectedParent, setSelectedParent] = useState("");
  const [selectedChild, setSelectedChild] = useState("");
  const [selectedGrandchild, setSelectedGrandchild] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [outfit, setOutfit] = useState<Record<string, OutfitSlotItem | null>>(
    Object.fromEntries(BODY_ZONES.map((zone) => [zone.id, null]))
  );
  const [selectedZoneId, setSelectedZoneId] =
    useState<(typeof BODY_ZONES)[number]["id"]>("outerwear");
  const [railItems, setRailItems] = useState<StudioRailItem[]>([]);
  const [generatingOutfit, setGeneratingOutfit] = useState(false);
  const [generatedOutfitJobId, setGeneratedOutfitJobId] = useState("");
  const [generatedOutfitImages, setGeneratedOutfitImages] = useState<string[]>([]);
  const [generatedOutfitIndex, setGeneratedOutfitIndex] = useState(0);
  const [isGeneratedZoomOpen, setIsGeneratedZoomOpen] = useState(false);
  const [zoomedSavedOutfitId, setZoomedSavedOutfitId] = useState("");
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfitItem[]>([]);
  const [savingOutfit, setSavingOutfit] = useState(false);
  const [sharingOutfitId, setSharingOutfitId] = useState("");
  const [updatingOutfitId, setUpdatingOutfitId] = useState("");
  const [deletingOutfitId, setDeletingOutfitId] = useState("");
  const [outfitNameDrafts, setOutfitNameDrafts] = useState<Record<string, string>>({});
  const [savedOutfitIndexes, setSavedOutfitIndexes] = useState<Record<string, number>>({});
  const [generationError, setGenerationError] = useState("");

  const loadSavedOutfits = () => {
    fetch(`/api/outfits?ts=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setSavedOutfits(data.outfits || []);
        setOutfitNameDrafts(
          Object.fromEntries(
            (data.outfits || []).map((outfit: SavedOutfitItem) => [outfit.id, outfit.name])
          )
        );
        setSavedOutfitIndexes((current) =>
          Object.fromEntries(
            (data.outfits || []).map((outfit: SavedOutfitItem) => [
              outfit.id,
              Math.min(current[outfit.id] || 0, Math.max(getAvailableOutfitImages(outfit.images).length - 1, 0)),
            ])
          )
        );
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch("/api/categories")
      .then((response) => response.json())
      .then((data) => setCategories(data.tree || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    loadSavedOutfits();
  }, [user]);

  useEffect(() => {
    setRailItems(getStudioRailItems());
    return subscribeToStudioRail(setRailItems);
  }, []);

  useEffect(() => {
    const handleAssignFromTray = (event: Event) => {
      const customEvent = event as CustomEvent<StudioRailItem>;
      if (!customEvent.detail) return;
      handleAssignRailItemToSelectedZone(customEvent.detail);
    };

    window.addEventListener(
      "looksmax:studio-assign-item",
      handleAssignFromTray as EventListener
    );

    return () => {
      window.removeEventListener(
        "looksmax:studio-assign-item",
        handleAssignFromTray as EventListener
      );
    };
  });

  const childCategories = useMemo(
    () => categories.find((category) => category.slug === selectedParent)?.children || [],
    [categories, selectedParent]
  );
  const grandchildCategories = useMemo(
    () => childCategories.find((category) => category.slug === selectedChild)?.children || [],
    [childCategories, selectedChild]
  );

  const activeCategory = selectedGrandchild || selectedChild || selectedParent;
  const profileReady = Boolean(
    user?.bodyProfile?.heightCm &&
      user?.bodyProfile?.weightKg &&
      user?.bodyProfile?.usualSize &&
      user?.bodyProfile?.profileImage &&
      user?.bodyProfile?.gender
  );
  const genderCollectionSlug = user?.bodyProfile?.gender === "women" ? "women" : "men";

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeCategory) params.set("category", activeCategory);
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    params.set("limit", "40");

    fetch(`/api/products?${params}`)
      .then((response) => response.json())
      .then((data) => setProducts(data.products || []))
      .catch(() => setProducts([]));
  }, [activeCategory, searchTerm]);

  useEffect(() => {
    if (!user?.bodyProfile?.gender) {
      setSuggestedProducts([]);
      return;
    }

    const params = new URLSearchParams();
    params.set("category", genderCollectionSlug);
    params.set("limit", "8");

    fetch(`/api/products?${params}`)
      .then((response) => response.json())
      .then((data) =>
        setSuggestedProducts(
          (data.products || []).filter((product: StudioProduct) => product.productType !== "perfume")
        )
      )
      .catch(() => setSuggestedProducts([]));
  }, [genderCollectionSlug, user?.bodyProfile?.gender]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => product.productType !== "perfume");
  }, [products]);
  const selectedZoneMeta = ZONE_DETAILS[selectedZoneId];
  const selectedZoneItem = outfit[selectedZoneId];

  const handleAddToRailFromProductList = (product: StudioProduct) => {
    addStudioRailItem({
      id: product._id,
      name: product.name,
      image: getMainImage(product.images),
      price: product.price.toFixed(2),
      brand: product.brand || "LOOKSMAX",
      quantity: 1,
      maxStock: Math.max(1, product.stock ?? 1),
      productType: product.productType ?? "fashion",
      fashionSubtype: product.fashionSubtype || "clothes",
      originPictures: product.originPictures || { front: "", back: "", left: "", right: "" },
    });
  };

  const handleAssignRailItemToSelectedZone = (item: StudioRailItem) => {
    if (selectedZoneItem?.id === item.id) {
      setOutfit((current) => ({
        ...current,
        [selectedZoneId]: null,
      }));
      return;
    }

    setOutfit((current) => ({
      ...current,
      [selectedZoneId]: {
        id: item.id,
        name: item.name,
        image: item.image,
        fashionSubtype: item.fashionSubtype,
        originPictures: item.originPictures,
      },
    }));
  };

  const handleSelectZone = (zoneId: (typeof BODY_ZONES)[number]["id"]) => {
    if (selectedZoneId === zoneId && outfit[zoneId]) {
      setOutfit((current) => ({
        ...current,
        [zoneId]: null,
      }));
      return;
    }

    setSelectedZoneId(zoneId);
  };

  const handleBuilderZoneClick = (zoneId: (typeof BODY_ZONES)[number]["id"]) => {
    handleSelectZone(zoneId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("looksmax:studio-rail-open"));
    }
  };

  const handleGenerateOutfit = async () => {
    setGenerationError("");
    setGeneratedOutfitImages([]);
    setGeneratedOutfitIndex(0);
    setGeneratingOutfit(true);

    try {
      const response = await fetch("/api/generate-outfit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileImage: user?.bodyProfile?.profileImage || "",
          heightCm: user?.bodyProfile?.heightCm || "",
          weightKg: user?.bodyProfile?.weightKg || "",
          usualSize: user?.bodyProfile?.usualSize || "",
          bodyZones: Object.fromEntries(
            BODY_ZONES.map((zone) => [
              zone.id,
              {
                status: Boolean(outfit[zone.id]),
                fashionSubtype: outfit[zone.id]?.fashionSubtype || "",
                originPictures: outfit[zone.id]?.originPictures || {
                  front: "",
                  back: "",
                  left: "",
                  right: "",
                },
              },
            ])
          ),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setGenerationError(data.error || "Unable to generate outfit.");
        setGeneratingOutfit(false);
        return;
      }

      if (!response.ok) {
        setGenerationError(data.error || "Unable to generate outfit.");
        setGeneratingOutfit(false);
        return;
      }

      setGeneratedOutfitJobId(String(data.jobId || ""));
    } catch {
      setGenerationError("Generation request failed.");
      setGeneratingOutfit(false);
    }
  };

  const handleSaveOutfit = async () => {
    if (generatedOutfitImages.length === 0) return;

    setSavingOutfit(true);
    try {
      const response = await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "First Outfit",
          images: {
            front: generatedOutfitImages[0] || "",
            back: generatedOutfitImages[1] || "",
          },
          outfitSnapshot: outfit,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setGenerationError(data.error || "Unable to save outfit.");
        setSavingOutfit(false);
        return;
      }

      loadSavedOutfits();
    } catch {
      setGenerationError("Unable to save outfit.");
    }
    setSavingOutfit(false);
  };

  const handleUpdateOutfit = async (id: string) => {
    setUpdatingOutfitId(id);
    try {
      const payload: {
        name: string;
        images?: { front?: string; back?: string };
        outfitSnapshot?: Record<string, OutfitSlotItem | null>;
      } = {
        name: outfitNameDrafts[id] || "First Outfit",
      };

      if (generatedOutfitImages.length > 0) {
        payload.images = {
          front: generatedOutfitImages[0] || "",
          back: generatedOutfitImages[1] || "",
        };
        payload.outfitSnapshot = outfit;
      }

      const response = await fetch(`/api/outfits/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setGenerationError(data.error || "Unable to update outfit.");
        setUpdatingOutfitId("");
        return;
      }

      loadSavedOutfits();
    } catch {
      setGenerationError("Unable to update outfit.");
    }
    setUpdatingOutfitId("");
  };

  const handleDeleteOutfit = async (id: string) => {
    setDeletingOutfitId(id);
    try {
      const response = await fetch(`/api/outfits/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setGenerationError("Unable to delete outfit.");
        setDeletingOutfitId("");
        return;
      }
      loadSavedOutfits();
    } catch {
      setGenerationError("Unable to delete outfit.");
    }
    setDeletingOutfitId("");
  };

  const handleShareOutfit = async (id: string) => {
    setSharingOutfitId(id);
    try {
      const response = await fetch(`/api/outfits/${id}/share`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setGenerationError(data.error || "Unable to share outfit.");
        setSharingOutfitId("");
        return;
      }

      await navigator.clipboard.writeText(String(data.shareUrl || ""));
      loadSavedOutfits();
    } catch {
      setGenerationError("Unable to copy share link.");
    }
    setSharingOutfitId("");
  };

  useEffect(() => {
    if (!generatedOutfitJobId || !generatingOutfit) return;

    let cancelled = false;

    const pollJob = () => {
      fetch(`/api/generate-outfit/${generatedOutfitJobId}`)
        .then((response) => response.json())
        .then((data) => {
          if (cancelled || !data.job) return;

          if (data.job.status === "failed") {
            setGenerationError(data.job.errorMessage || "Outfit generation failed.");
            setGeneratingOutfit(false);
            return;
          }

          const nextImages = [data.job.images?.front, data.job.images?.back]
            .filter((image: unknown): image is string => typeof image === "string" && image.length > 0)
            .map((image: string) => (image.startsWith("data:") ? image : `data:image/png;base64,${image}`));

          if (nextImages.length > 0) {
            setGeneratedOutfitImages(nextImages);
          }

          if (data.job.status === "completed") {
            setGeneratingOutfit(false);
          }
        })
        .catch(() => {});
    };

    pollJob();
    const interval = window.setInterval(pollJob, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [generatedOutfitJobId, generatingOutfit]);

  if (loading) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Loading studio...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="pt-[72px] min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-wide uppercase mb-3">Sign In Required</h1>
          <p className="text-sm text-text-secondary mb-6">
            Sign in to build looks around your body profile.
          </p>
          <Link
            href="/login"
            className="bg-foreground text-background px-8 py-3 text-sm font-medium tracking-wide uppercase"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (!profileReady) {
    return (
      <div className="pt-[72px] min-h-screen">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-12">
          <div className="border border-border-color bg-background p-8 text-center space-y-4">
            <p className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">
              Outfit Studio
            </p>
            <h1 className="text-2xl font-semibold tracking-wide uppercase">
              Complete Your Studio Profile First
            </h1>
            <p className="text-sm text-text-secondary max-w-xl mx-auto">
              Before using the studio, add your height, weight, usual size, gender, and profile photo in account settings.
            </p>
            <Link
              href="/account/settings"
              className="inline-flex bg-foreground text-background px-6 py-3 text-xs font-medium tracking-wide uppercase"
            >
              Update Studio Profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeGeneratedOutfitImage = generatedOutfitImages[generatedOutfitIndex] || "";
  const showGeneratedOutfitPanel = Boolean(
    generatingOutfit || activeGeneratedOutfitImage || generationError
  );
  const cycleGeneratedImage = () => {
    if (generatedOutfitImages.length <= 1) return;
    setGeneratedOutfitIndex((current) => (current + 1) % generatedOutfitImages.length);
  };
  const showPreviousGeneratedImage = () =>
    setGeneratedOutfitIndex((current) =>
      current === 0 ? generatedOutfitImages.length - 1 : current - 1
    );
  const showNextGeneratedImage = () =>
    setGeneratedOutfitIndex((current) =>
      current === generatedOutfitImages.length - 1 ? 0 : current + 1
    );

  return (
    <div className="pt-[72px] min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">New Feature</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-wide uppercase">Outfit Studio</h1>
            <p className="mt-2 text-sm text-text-secondary max-w-2xl">
              Save your body profile, filter products by category, then drag pieces onto the body map from headwear to shoes.
            </p>
          </div>
          <Link
            href="/account/settings"
            className="border border-border-color px-4 py-2 text-[10px] uppercase tracking-wider text-text-secondary hover:text-foreground"
          >
            Edit Profile
          </Link>
        </div>

        <section className="mx-auto w-full max-w-[1320px] bg-transparent">
          <div
            className={`grid grid-cols-1 gap-8 md:grid-cols-2 2xl:transition-all 2xl:duration-300 ${
              showGeneratedOutfitPanel
                ? "2xl:[grid-template-columns:repeat(4,minmax(0,1fr))]"
                : "2xl:[grid-template-columns:repeat(3,minmax(0,1fr))]"
            }`}
          >
            <div className="flex flex-col gap-4 bg-transparent px-6 py-6 2xl:min-h-[560px]">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">Selected zone</p>
                <h2 className="mt-1 font-serif text-[28px] font-normal text-[#1a1a1a]">
                  {selectedZoneMeta.title}
                </h2>
                <p className="mt-1 text-xs text-[#666]">
                  Click a body zone or a tag below, then pick a product from your rail.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {BODY_ZONES.map((zone) => (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => handleSelectZone(zone.id)}
                    className={`rounded-none px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] transition-all ${
                      selectedZoneId === zone.id
                        ? "bg-[#c9a96e] text-white"
                        : "border border-[#00000012] bg-transparent text-[#666] hover:bg-[#f1ede8]"
                    }`}
                  >
                    {ZONE_BUTTON_LABELS[zone.id]}
                  </button>
                ))}
              </div>

              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#666]">Product rail</p>
                <div className="space-y-1.5 2xl:max-h-[300px] 2xl:overflow-y-auto 2xl:pr-1">
                  {railItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAssignRailItemToSelectedZone(item)}
                      className={`flex w-full items-center gap-3 rounded-none p-3 text-left transition-colors ${
                        selectedZoneItem?.id === item.id
                          ? "bg-[#ede1ce]"
                          : "bg-transparent hover:bg-[#ede1ce]"
                      }`}
                    >
                      <div className="flex h-[64px] w-[52px] shrink-0 items-center justify-center overflow-hidden bg-[#e8dccb]">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-5 w-5 border border-[#666]/30" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] leading-5 text-[#1a1a1a]">{item.name}</div>
                        <div className="mt-1 text-[12px] text-[#1a1a1a]">
                          {formatTndPrice(item.price)}
                        </div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#666]">
                          {item.brand || "LOOKSMAX"}
                        </div>
                      </div>
                    </button>
                  ))}
                  {railItems.length === 0 && (
                    <div className="bg-[#ede1ce] px-3 py-4 text-xs text-[#666]">
                      Add products to your rail first, then assign them here.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center bg-transparent px-6 py-6 2xl:min-h-[560px]">
              <div
                className={`flex w-full max-w-[280px] transform-gpu flex-col items-center transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
                  showGeneratedOutfitPanel ? "-translate-x-6" : "translate-x-0"
                }`}
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">Outfit builder</p>

                <div className="relative mt-6 flex h-[420px] w-full items-center justify-center overflow-hidden">
                  <div className="relative h-[420px] w-[160px]">
                <svg viewBox="0 0 160 420" width="160" height="420" className="mx-auto">
                  <circle cx="80" cy="44" r="22" fill="#d4a574" />
                  <rect x="73" y="64" width="14" height="12" fill="#d4a574" />

                  <g
                    className="cursor-pointer transition-all duration-200 hover:opacity-70"
                    onClick={() => handleBuilderZoneClick("headwear")}
                    style={{
                      filter:
                        selectedZoneId === "headwear"
                          ? "drop-shadow(0 0 7px rgba(201,169,110,0.9))"
                          : undefined,
                    }}
                  >
                    <path
                      d="M55 28 Q80 10 105 28 L105 42 L55 42 Z"
                      fill={selectedZoneId === "headwear" ? "#c9a96e" : "#2c2c2c"}
                    />
                    <rect
                      x="48"
                      y="40"
                      width="64"
                      height="6"
                      rx="3"
                      fill={selectedZoneId === "headwear" ? "#c9a96e" : "#2c2c2c"}
                    />
                  </g>

                  <g
                    className="cursor-pointer transition-all duration-200 hover:opacity-70"
                    onClick={() => handleBuilderZoneClick("outerwear")}
                    style={{
                      filter:
                        selectedZoneId === "outerwear"
                          ? "drop-shadow(0 0 7px rgba(201,169,110,0.9))"
                          : undefined,
                    }}
                  >
                    <path
                      d="M32 90 L55 76 L80 84 L105 76 L128 90 L122 210 L38 210 Z"
                      fill={selectedZoneId === "outerwear" ? "#c9a96e" : "#2c3e50"}
                    />
                    <path d="M80 84 L80 210" stroke="#1a2530" strokeWidth="1.5" fill="none" />
                    <path d="M55 76 L65 105" stroke="#1a2530" strokeWidth="1" fill="none" />
                    <path d="M105 76 L95 105" stroke="#1a2530" strokeWidth="1" fill="none" />
                    <path
                      d="M55 76 L72 100 L80 84 Z"
                      fill={selectedZoneId === "outerwear" ? "#c9a96e" : "#243040"}
                    />
                    <path
                      d="M105 76 L88 100 L80 84 Z"
                      fill={selectedZoneId === "outerwear" ? "#c9a96e" : "#243040"}
                    />
                    <path
                      d="M32 90 L20 170 L38 175 L44 110 Z"
                      fill={selectedZoneId === "outerwear" ? "#c9a96e" : "#2c3e50"}
                    />
                    <path
                      d="M128 90 L140 170 L122 175 L116 110 Z"
                      fill={selectedZoneId === "outerwear" ? "#c9a96e" : "#2c3e50"}
                    />
                  </g>

                  <g
                    className="cursor-pointer transition-all duration-200 hover:opacity-70"
                    onClick={() => handleBuilderZoneClick("top")}
                    style={{
                      filter:
                        selectedZoneId === "top"
                          ? "drop-shadow(0 0 7px rgba(201,169,110,0.9))"
                          : undefined,
                    }}
                  >
                    <rect
                      x="65"
                      y="84"
                      width="30"
                      height="120"
                      rx="2"
                      fill={selectedZoneId === "top" ? "#c9a96e" : "#e8e0d5"}
                    />
                    <circle cx="80" cy="100" r="2" fill="#b0a090" />
                    <circle cx="80" cy="115" r="2" fill="#b0a090" />
                    <circle cx="80" cy="130" r="2" fill="#b0a090" />
                    <circle cx="80" cy="145" r="2" fill="#b0a090" />
                  </g>

                  <g
                    className="cursor-pointer transition-all duration-200 hover:opacity-70"
                    onClick={() => handleBuilderZoneClick("bottom")}
                    style={{
                      filter:
                        selectedZoneId === "bottom"
                          ? "drop-shadow(0 0 7px rgba(201,169,110,0.9))"
                          : undefined,
                    }}
                  >
                    <path
                      d="M50 210 L110 210 L105 335 L88 335 L80 278 L72 335 L55 335 L50 210 Z"
                      fill={selectedZoneId === "bottom" ? "#c9a96e" : "#2d3436"}
                    />
                    <line x1="80" y1="210" x2="80" y2="278" stroke="#222" strokeWidth="1.5" />
                  </g>

                  <g
                    className="cursor-pointer transition-all duration-200 hover:opacity-70"
                    onClick={() => handleBuilderZoneClick("footwear")}
                    style={{
                      filter:
                        selectedZoneId === "footwear"
                          ? "drop-shadow(0 0 7px rgba(201,169,110,0.9))"
                          : undefined,
                    }}
                  >
                    <path
                      d="M49 321 L61 321 L61 338 L46 338 L46 324 Z"
                      fill={selectedZoneId === "footwear" ? "#c9a96e" : "#1a1a1a"}
                    />
                    <path
                      d="M41 338 C48 335, 61 335, 68 338 L71 346 C62 350, 47 350, 38 345 Z"
                      fill={selectedZoneId === "footwear" ? "#c9a96e" : "#111"}
                    />
                    <path
                      d="M99 321 L111 321 L111 338 L96 338 L96 324 Z"
                      fill={selectedZoneId === "footwear" ? "#c9a96e" : "#1a1a1a"}
                    />
                    <path
                      d="M91 338 C98 335, 111 335, 118 338 L121 346 C112 350, 97 350, 88 345 Z"
                      fill={selectedZoneId === "footwear" ? "#c9a96e" : "#111"}
                    />
                  </g>
                </svg>

                {BODY_ZONES.map((zone) => {
                  const assignedItem = outfit[zone.id];
                  if (!assignedItem?.image) return null;

                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => handleBuilderZoneClick(zone.id)}
                      className={`absolute ${ZONE_PREVIEW_POSITIONS[zone.id].className} flex h-12 w-12 items-center justify-center overflow-hidden rounded-none ${
                        selectedZoneId === zone.id ? "border-[#c9a96e]" : "border-[#00000012]"
                      } bg-[#ede1ce] border`}
                      aria-label={`Open ${ZONE_PREVIEW_POSITIONS[zone.id].label} assignment`}
                    >
                      <img
                        src={assignedItem.image}
                        alt={assignedItem.name}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                })}
                  </div>
                </div>

                <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-[#999]">Click a zone to assign</p>
                <button
                  type="button"
                  onClick={handleGenerateOutfit}
                  disabled={generatingOutfit}
                  className="mt-6 w-full rounded-none bg-[#1a1a1a] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#c9a96e] disabled:opacity-50"
                >
                  {generatingOutfit ? "Generating..." : "Generate outfit"}
                </button>
              </div>
            </div>

            {showGeneratedOutfitPanel && (
              <div className="flex flex-col gap-3 bg-transparent px-6 py-6 2xl:min-h-[560px]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">Generated outfit</p>
                  <button
                    type="button"
                    onClick={handleSaveOutfit}
                    disabled={savingOutfit || generatedOutfitImages.length === 0}
                    className="rounded-none border border-[#00000012] bg-transparent px-3.5 py-2 text-[11px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e] disabled:opacity-50"
                  >
                    {savingOutfit ? "Saving..." : "Save"}
                  </button>
                </div>

                <div className="flex h-[420px] items-center justify-center bg-[#ede1ce] p-4 text-[#666]">
                  <div className="relative flex h-full w-full items-center justify-center">
                    {generatingOutfit && user.bodyProfile?.profileImage ? (
                      <>
                        <img
                          src={user.bodyProfile.profileImage}
                          alt={user.name}
                          className="max-h-full w-full object-contain blur-md opacity-60"
                        />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1a1a1a]/15 border-t-[#c9a96e]" />
                          <span className="text-[12px] text-[#666]">Generating...</span>
                        </div>
                      </>
                    ) : activeGeneratedOutfitImage ? (
                      <>
                        <button
                          type="button"
                          onClick={cycleGeneratedImage}
                          className="flex h-full w-full items-center justify-center rounded-none"
                        >
                          <img
                            src={activeGeneratedOutfitImage}
                            alt={`Generated outfit ${generatedOutfitIndex + 1}`}
                            className="max-h-full w-full object-contain"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsGeneratedZoomOpen(true)}
                          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-none border border-[#00000012] bg-[#ede1ce] text-lg text-[#1a1a1a]"
                          aria-label="Zoom generated outfit"
                        >
                          +
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {generatedOutfitImages.length > 1 && !generatingOutfit && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={showPreviousGeneratedImage}
                      className="rounded-none border border-[#00000012] bg-transparent px-3 py-2 text-sm text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e]"
                      aria-label="Show previous generated outfit"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={showNextGeneratedImage}
                      className="rounded-none border border-[#00000012] bg-transparent px-3 py-2 text-sm text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e]"
                      aria-label="Show next generated outfit"
                    >
                      →
                    </button>
                  </div>
                )}

                {generationError && (
                  <div className="bg-danger/10 px-3 py-3 text-xs text-danger">
                    {generationError}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 bg-transparent px-6 py-6 2xl:min-h-[560px]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">Saved outfits</p>
                <span className="text-[10px] uppercase tracking-[0.15em] text-[#999]">
                  {savedOutfits.length}
                </span>
              </div>
              <div className="space-y-2 2xl:max-h-[420px] 2xl:overflow-y-auto 2xl:pr-1">
                {savedOutfits.map((outfitItem) => {
                  const outfitImages = getAvailableOutfitImages(outfitItem.images);
                  const activeIndex = Math.min(
                    savedOutfitIndexes[outfitItem.id] || 0,
                    Math.max(outfitImages.length - 1, 0)
                  );
                  const activeImage = outfitImages[activeIndex] || "";

                  return (
                    <div key={outfitItem.id} className="bg-[#ede1ce] p-3">
                      <div className="relative flex h-[220px] items-center justify-center overflow-hidden bg-[#e8dccb]">
                        {activeImage ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSavedOutfitIndexes((current) => ({
                                ...current,
                                [outfitItem.id]:
                                  outfitImages.length <= 1
                                    ? 0
                                    : ((current[outfitItem.id] || 0) + 1) % outfitImages.length,
                              }))
                            }
                            className="flex h-full w-full items-center justify-center rounded-none"
                          >
                            <img
                              src={activeImage}
                              alt={outfitItem.name}
                              className="h-full w-full object-contain"
                            />
                          </button>
                        ) : (
                          <div className="text-[11px] uppercase tracking-[0.14em] text-[#999]">
                            No image
                          </div>
                        )}
                        {activeImage ? (
                          <button
                            type="button"
                            onClick={() => setZoomedSavedOutfitId(outfitItem.id)}
                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-none border border-[#00000012] bg-[#ede1ce] text-base text-[#1a1a1a]"
                            aria-label={`Zoom ${outfitItem.name}`}
                          >
                            +
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-3 space-y-2">
                        <input
                          type="text"
                          value={outfitNameDrafts[outfitItem.id] || ""}
                          onChange={(e) =>
                            setOutfitNameDrafts((current) => ({
                              ...current,
                              [outfitItem.id]: e.target.value,
                            }))
                          }
                          className="w-full bg-transparent text-sm text-[#1a1a1a] outline-none"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateOutfit(outfitItem.id)}
                            disabled={updatingOutfitId === outfitItem.id}
                            className="rounded-none border border-[#00000012] px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e] disabled:opacity-50"
                          >
                            {updatingOutfitId === outfitItem.id ? "Updating..." : "Update"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOutfit(outfitItem.id)}
                            disabled={deletingOutfitId === outfitItem.id}
                            className="rounded-none border border-[#00000012] px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e] disabled:opacity-50"
                          >
                            {deletingOutfitId === outfitItem.id ? "Deleting..." : "Delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleShareOutfit(outfitItem.id)}
                            disabled={sharingOutfitId === outfitItem.id}
                            className="rounded-none border border-[#00000012] px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e] disabled:opacity-50"
                          >
                            {sharingOutfitId === outfitItem.id ? "Sharing..." : "Share"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {savedOutfits.length === 0 && (
                  <div className="bg-[#f1ede8] px-3 py-4 text-xs text-[#666]">
                    Saved outfits will appear here after you generate and save one.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1320px] bg-transparent px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">Suggestions</p>
            </div>
            <Link
              href={`/category/${genderCollectionSlug}`}
              className="border border-[#00000012] px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e]"
            >
              See all
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 xl:grid-cols-5">
            {suggestedProducts.map((product) => (
              <div
                key={product._id}
              >
                <ProductCard
                  id={product._id}
                  name={product.name}
                  price={product.price.toFixed(2)}
                  stock={product.stock}
                  reservationExpiresAt={product.reservationExpiresAt}
                  tag={product.tag}
                  image={getMainImage(product.images)}
                  conditionScore={product.conditionScore}
                  conditionStatus={product.conditionStatus}
                  productType={product.productType}
                  fashionSubtype={product.fashionSubtype}
                  originPictures={product.originPictures}
                />
              </div>
            ))}
            {suggestedProducts.length === 0 && (
              <div className="col-span-full bg-[#ede1ce] px-4 py-6 text-sm text-[#6B6055]">
                Add a gender in your Studio Profile to unlock tailored suggestions.
              </div>
            )}
          </div>
        </section>
      </div>

      {isGeneratedZoomOpen && activeGeneratedOutfitImage && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 py-8"
          onClick={() => setIsGeneratedZoomOpen(false)}
        >
          <div
            className="relative w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsGeneratedZoomOpen(false)}
              className="absolute right-0 top-0 z-10 border border-white/20 bg-black/60 px-4 py-3 text-xs uppercase tracking-[0.24em] text-white backdrop-blur-sm"
            >
              Close
            </button>
            <div className="overflow-hidden border border-white/15 bg-black/40 p-4 md:p-8">
              <img
                src={activeGeneratedOutfitImage}
                alt={`Zoomed generated outfit ${generatedOutfitIndex + 1}`}
                className="max-h-[85vh] w-full object-contain"
              />
            </div>
            {generatedOutfitImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={showPreviousGeneratedImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 border border-white/20 bg-black/60 px-4 py-4 text-lg text-white backdrop-blur-sm"
                  aria-label="Show previous generated outfit"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={showNextGeneratedImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 border border-white/20 bg-black/60 px-4 py-4 text-lg text-white backdrop-blur-sm"
                  aria-label="Show next generated outfit"
                >
                  →
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {zoomedSavedOutfitId &&
        (() => {
          const zoomedOutfit = savedOutfits.find((outfitItem) => outfitItem.id === zoomedSavedOutfitId);
          const zoomedImages = getAvailableOutfitImages(zoomedOutfit?.images);
          const zoomedIndex = Math.min(
            savedOutfitIndexes[zoomedSavedOutfitId] || 0,
            Math.max(zoomedImages.length - 1, 0)
          );
          const zoomedImage = zoomedImages[zoomedIndex] || "";

          if (!zoomedOutfit || !zoomedImage) return null;

          const showPreviousSavedZoom = () =>
            setSavedOutfitIndexes((current) => ({
              ...current,
              [zoomedSavedOutfitId]:
                zoomedIndex === 0 ? zoomedImages.length - 1 : zoomedIndex - 1,
            }));
          const showNextSavedZoom = () =>
            setSavedOutfitIndexes((current) => ({
              ...current,
              [zoomedSavedOutfitId]:
                zoomedIndex === zoomedImages.length - 1 ? 0 : zoomedIndex + 1,
            }));

          return (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 py-8"
              onClick={() => setZoomedSavedOutfitId("")}
            >
              <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setZoomedSavedOutfitId("")}
                  className="absolute right-0 top-0 z-10 border border-white/20 bg-black/60 px-4 py-3 text-xs uppercase tracking-[0.24em] text-white backdrop-blur-sm"
                >
                  Close
                </button>
                <div className="overflow-hidden border border-white/15 bg-black/40 p-4 md:p-8">
                  <img
                    src={zoomedImage}
                    alt={`${zoomedOutfit.name} enlarged`}
                    className="max-h-[85vh] w-full object-contain"
                  />
                </div>
                {zoomedImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={showPreviousSavedZoom}
                      className="absolute left-4 top-1/2 -translate-y-1/2 border border-white/20 bg-black/60 px-4 py-4 text-lg text-white backdrop-blur-sm"
                      aria-label="Show previous saved outfit image"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={showNextSavedZoom}
                      className="absolute right-4 top-1/2 -translate-y-1/2 border border-white/20 bg-black/60 px-4 py-4 text-lg text-white backdrop-blur-sm"
                      aria-label="Show next saved outfit image"
                    >
                      →
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
