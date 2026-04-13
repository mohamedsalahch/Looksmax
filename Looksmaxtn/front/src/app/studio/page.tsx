"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {useAuth} from "@/providers/AuthContext";
import ProductCard from "@/components/ProductCard";
import {
    addStudioTryOnItem,
    getStudioTryOnItems,
    StudioTryOnItem,
    subscribeToStudioTryOn,
} from "@/lib/studioTryOn";
import {formatTndPrice} from "@/lib/formatPrice";
import { withAuthRequest } from "@/lib/authClient";

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
    cartCount?: number;
    tag?: string;
    sizes?: string[];
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
    outfitSnapshot?: Record<
        string,
        {
            status?: boolean;
            productId?: string;
            fashionSubtype?: string;
            size?: string;
        } | null
    >;
    isPublic: boolean;
    shareToken?: string;
    updatedAt: string;
}

const BODY_ZONES = [
    {id: "headwear", label: "Headwear"},
    {id: "outerwear", label: "Veste"},
    {id: "top", label: "Pull / Top"},
    {id: "bottom", label: "Jeans / Bottom"},
    {id: "footwear", label: "Shoes"},
] as const;

const ZONE_BUTTON_LABELS: Record<(typeof BODY_ZONES)[number]["id"], string> = {
    headwear: "Headwear",
    outerwear: "Outerwear",
    top: "Top",
    bottom: "Bottom",
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

const ZONE_CATEGORY_KEYWORDS: Record<
    (typeof BODY_ZONES)[number]["id"],
    string[]
> = {
    headwear: ["headwear", "hat", "hats", "cap", "caps", "beanie", "beanies"],
    outerwear: ["outerwear", "jacket", "jackets", "coat", "coats", "veste", "vestes", "blazer", "blazers"],
    top: [
        "top",
        "tops",
        "shirt",
        "shirts",
        "pull",
        "pulls",
        "hoodie",
        "hoodies",
        "sweatshirt",
        "sweatshirts",
        "sweater",
        "sweaters",
        "knitwear",
        "polo",
        "polos",
        "tee",
        "t-shirt",
        "tshirts",
    ],
    bottom: ["bottom", "bottoms", "pant", "pants", "jean", "jeans", "trouser", "trousers", "short", "shorts"],
    footwear: ["shoe", "shoes", "sneaker", "sneakers", "footwear", "loafer", "loafers", "boot", "boots"],
};

const WOMEN_HAND_BAG_KEYWORDS = [
    "handbag",
    "handbags",
    "purse",
    "purses",
    "tote",
    "totes",
    "satchel",
    "satchels",
    "clutch",
    "clutches",
    "shoulder bag",
    "shoulder bags",
    "crossbody",
    "crossbody bag",
    "mini bag",
    "mini bags",
    "bag",
    "bags",
];

const WOMEN_OUTERWEAR_COLOR = "#2c3e50";
const STORED_GENERATION_KEY = "looksmax-studio-generation-job";

type StoredGenerationState = {
    jobId: string;
    images: string[];
    errorMessage: string;
    generating: boolean;
    name: string;
    pendingRecovery: boolean;
};

function getZoneButtonLabel(
    zoneId: (typeof BODY_ZONES)[number]["id"],
    isWomen: boolean
) {
    if (isWomen && zoneId === "headwear") return "Handbag";
    return ZONE_BUTTON_LABELS[zoneId];
}

function getZonePreviewLabel(
    zoneId: (typeof BODY_ZONES)[number]["id"],
    isWomen: boolean
) {
    if (isWomen && zoneId === "headwear") return "Handbag";
    return ZONE_PREVIEW_POSITIONS[zoneId].label;
}

function getZonePreviewPosition(
    zoneId: (typeof BODY_ZONES)[number]["id"],
    isWomen: boolean
) {
    if (isWomen && zoneId === "headwear") {
        return {
            className: "right-[-6px] top-[236px]",
            label: "Handbag",
        };
    }

    return ZONE_PREVIEW_POSITIONS[zoneId];
}

function getZoneDetails(
    zoneId: (typeof BODY_ZONES)[number]["id"],
    isWomen: boolean
) {
    if (isWomen && zoneId === "headwear") {
        return {
            title: "Handbag",
            type: "Accessory Layer",
            fit: "Carried accessory",
            season: "All seasons",
            care: "Best paired as a finishing piece",
        };
    }

    return ZONE_DETAILS[zoneId];
}

function getZoneCategoryKeywords(
    zoneId: (typeof BODY_ZONES)[number]["id"],
    isWomen: boolean
) {
    if (isWomen && zoneId === "headwear") {
        return WOMEN_HAND_BAG_KEYWORDS;
    }

    return ZONE_CATEGORY_KEYWORDS[zoneId];
}

function getStoredGenerationKey(userId: string) {
    return `${STORED_GENERATION_KEY}:${userId}`;
}

function readStoredGenerationState(userId: string): StoredGenerationState | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.localStorage.getItem(getStoredGenerationKey(userId));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<StoredGenerationState>;
        if (!parsed.jobId && !parsed.pendingRecovery) return null;

        return {
            jobId: parsed.jobId || "",
            images: Array.isArray(parsed.images) ? parsed.images.filter((image): image is string => typeof image === "string") : [],
            errorMessage: typeof parsed.errorMessage === "string" ? parsed.errorMessage : "",
            generating: Boolean(parsed.generating),
            name: typeof parsed.name === "string" ? parsed.name : "Outfit",
            pendingRecovery: Boolean(parsed.pendingRecovery),
        };
    } catch {
        return null;
    }
}

function writeStoredGenerationState(userId: string, state: StoredGenerationState | null) {
    if (typeof window === "undefined") return;

    if (!state) {
        window.localStorage.removeItem(getStoredGenerationKey(userId));
        return;
    }

    window.localStorage.setItem(getStoredGenerationKey(userId), JSON.stringify(state));
}

function normalizeSearchableText(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getStudioItemSearchText(item: Pick<StudioProduct, "categories" | "name"> | Pick<StudioTryOnItem, "name"> & {
    categories?: string[]
}) {
    return normalizeSearchableText(
        [item.name, ...(item.categories || [])].filter(Boolean).join(" ")
    );
}

function doesItemMatchZone(
    zoneId: (typeof BODY_ZONES)[number]["id"],
    item: Pick<StudioProduct, "categories" | "name" | "fashionSubtype"> | Pick<StudioTryOnItem, "name" | "fashionSubtype"> & {
        categories?: string[]
    },
    isWomen: boolean
) {
    if (zoneId === "footwear") {
        return item.fashionSubtype === "shoes" || ZONE_CATEGORY_KEYWORDS.footwear.some((keyword) =>
            getStudioItemSearchText(item).includes(keyword)
        );
    }

    if (item.fashionSubtype === "shoes") {
        return false;
    }

    const haystack = getStudioItemSearchText(item);
    return getZoneCategoryKeywords(zoneId, isWomen).some((keyword) => haystack.includes(keyword));
}

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

function StudioModel({
    isWomen,
    selectedZoneId,
    onZoneClick,
}: {
    isWomen: boolean;
    selectedZoneId: (typeof BODY_ZONES)[number]["id"];
    onZoneClick: (zoneId: (typeof BODY_ZONES)[number]["id"]) => void;
}) {
    if (isWomen) {
        return (
            <svg viewBox="0 0 160 420" width="160" height="420" xmlns="http://www.w3.org/2000/svg">
                <circle cx="80" cy="44" r="22" fill="#d4a574" />
                <rect x="73" y="63" width="14" height="11" fill="#d4a574" />

                <ellipse cx="80" cy="28" rx="22" ry="19" fill="#2c1a0e" />
                <rect x="57" y="30" width="8" height="26" rx="4" fill="#2c1a0e" />
                <rect x="95" y="30" width="8" height="18" rx="4" fill="#2c1a0e" />
                <ellipse cx="80" cy="22" rx="14" ry="10" fill="#2c1a0e" />

                <g
                    style={{ filter: "drop-shadow(rgba(60,100,80,0.5) 0px 0px 6px)", cursor: "pointer" }}
                    onClick={() => onZoneClick("outerwear")}
                >
                    <path
                        d="M34 92 L57 77 L80 85 L103 77 L126 92 L120 195 L40 195 Z"
                        fill={selectedZoneId === "outerwear" ? "#f2d48f" : WOMEN_OUTERWEAR_COLOR}
                    />
                    <path d="M80 85 L80 195" stroke="#2d5a4a" strokeWidth="1.5" fill="none" />
                    <path d="M57 77 L68 106 L80 85 Z" fill={selectedZoneId === "outerwear" ? "#f2d48f" : WOMEN_OUTERWEAR_COLOR} />
                    <path d="M103 77 L92 106 L80 85 Z" fill={selectedZoneId === "outerwear" ? "#f2d48f" : WOMEN_OUTERWEAR_COLOR} />
                    <path d="M34 92 L22 168 L40 173 L46 112 Z" fill={selectedZoneId === "outerwear" ? "#f2d48f" : WOMEN_OUTERWEAR_COLOR} />
                    <path d="M126 92 L134 160 L120 165 L114 112 Z" fill={selectedZoneId === "outerwear" ? "#f2d48f" : WOMEN_OUTERWEAR_COLOR} />
                    <path d="M127 158 L132 200 L122 200 L118 162 Z" fill="#d4a574" />
                </g>

                <g
                    style={{ cursor: "pointer" }}
                    onClick={() => onZoneClick("top")}
                >
                    <rect x="66" y="85" width="28" height="108" rx="2" fill={selectedZoneId === "top" ? "#f2d48f" : "#e8e0d5"} />
                </g>
                <circle cx="80" cy="100" r="2" fill="#b0a090" />
                <circle cx="80" cy="113" r="2" fill="#b0a090" />
                <circle cx="80" cy="126" r="2" fill="#b0a090" />
                <circle cx="80" cy="139" r="2" fill="#b0a090" />

                <g
                    style={{ cursor: "pointer" }}
                    onClick={() => onZoneClick("bottom")}
                >
                    <path
                        d="M50 195 L110 195 L105 330 L88 330 L80 268 L72 330 L55 330 L50 195 Z"
                        fill={selectedZoneId === "bottom" ? "#f2d48f" : WOMEN_OUTERWEAR_COLOR}
                    />
                </g>
                <line x1="80" y1="195" x2="80" y2="268" stroke="#2d5a4a" strokeWidth="1.5" />

                <g
                    style={{ cursor: "pointer" }}
                    onClick={() => onZoneClick("footwear")}
                >
                    <path d="M55 320 L72 320 L72 330 L53 330 Z" fill={selectedZoneId === "footwear" ? "#f2d48f" : "#1a1a1a"} />
                    <path d="M46 330 C53 327, 68 327, 76 330 L78 338 C68 342, 48 342, 42 337 Z" fill={selectedZoneId === "footwear" ? "#f2d48f" : "#111"} />
                    <path d="M88 320 L105 320 L105 330 L86 330 Z" fill={selectedZoneId === "footwear" ? "#f2d48f" : "#1a1a1a"} />
                    <path d="M84 330 C91 327, 106 327, 114 330 L116 338 C106 342, 86 342, 82 337 Z" fill={selectedZoneId === "footwear" ? "#f2d48f" : "#111"} />
                </g>

                <g
                    style={{ cursor: "pointer" }}
                    onClick={() => onZoneClick("headwear")}
                >
                    <path d="M118 195 Q135 182 148 195" stroke="#2c1a0e" strokeWidth="3.5" fill="none" strokeLinecap="round" />
                    <rect x="112" y="194" width="42" height="46" rx="4" fill={selectedZoneId === "headwear" ? "#f2d48f" : "#1a1a1a"} />
                    <rect x="112" y="194" width="42" height="10" rx="4" fill={selectedZoneId === "headwear" ? "#f2d48f" : "#111"} />
                    <circle cx="133" cy="204" r="3" fill={selectedZoneId === "headwear" ? "#c9a96e" : "#f2f2f2"} />
                    <circle cx="133" cy="204" r="1.5" fill={selectedZoneId === "headwear" ? "#f2d48f" : "#1a1a1a"} />
                    <rect x="116" y="209" width="34" height="27" rx="2" fill="none" stroke="#111" strokeWidth="1" />
                    <rect x="120" y="215" width="26" height="16" rx="2" fill="#111" opacity="0.5" />
                </g>
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 160 420" width="160" height="420">
            <circle cx="80" cy="44" r="22" fill="#d4a574"/>
            <rect x="73" y="64" width="14" height="12" fill="#d4a574"/>

            <g
                style={{ cursor: "pointer" }}
                onClick={() => onZoneClick("headwear")}
            >
                <path d="M55 28 Q80 10 105 28 L105 42 L55 42 Z" fill={selectedZoneId === "headwear" ? "#f2d48f" : "#2c2c2c"} />
                <rect x="48" y="40" width="64" height="6" rx="3" fill={selectedZoneId === "headwear" ? "#f2d48f" : "#2c2c2c"} />
            </g>

            <g
                style={{ cursor: "pointer", filter: "drop-shadow(rgba(201, 169, 110, 0.9) 0px 0px 7px)" }}
                onClick={() => onZoneClick("outerwear")}
            >
                <path d="M32 90 L55 76 L80 84 L105 76 L128 90 L122 210 L38 210 Z" fill={selectedZoneId === "outerwear" ? "#f2d48f" : "#2d3436"} />
                <path d="M80 84 L80 210" stroke="#1a2530" strokeWidth="1.5" fill="none" />
                <path d="M55 76 L65 105" stroke="#1a2530" strokeWidth="1" fill="none" />
                <path d="M105 76 L95 105" stroke="#1a2530" strokeWidth="1" fill="none" />
                <path d="M55 76 L72 100 L80 84 Z" fill={selectedZoneId === "outerwear" ? "#f2d48f" : "#2d3436"} />
                <path d="M105 76 L88 100 L80 84 Z" fill={selectedZoneId === "outerwear" ? "#f2d48f" : "#2d3436"} />
                <path d="M32 90 L20 170 L38 175 L44 110 Z" fill={selectedZoneId === "outerwear" ? "#f2d48f" : "#2d3436"} />
                <path d="M128 90 L140 170 L122 175 L116 110 Z" fill={selectedZoneId === "outerwear" ? "#f2d48f" : "#2d3436"} />
            </g>

            <g
                style={{ cursor: "pointer" }}
                onClick={() => onZoneClick("top")}
            >
                <rect x="65" y="84" width="30" height="120" rx="2" fill={selectedZoneId === "top" ? "#f2d48f" : "#e8e0d5"} />
                <circle cx="80" cy="100" r="2" fill="#b0a090" />
                <circle cx="80" cy="115" r="2" fill="#b0a090" />
                <circle cx="80" cy="130" r="2" fill="#b0a090" />
                <circle cx="80" cy="145" r="2" fill="#b0a090" />
            </g>

            <g
                style={{ cursor: "pointer" }}
                onClick={() => onZoneClick("bottom")}
            >
                <path d="M50 210 L110 210 L105 338 L88 338 L80 278 L72 338 L55 338 L50 210 Z" fill={selectedZoneId === "bottom" ? "#f2d48f" : "#2d3436"} />
                <line x1="80" y1="210" x2="80" y2="278" stroke="#222" strokeWidth="1.5" />
            </g>

            <g
                style={{ cursor: "pointer" }}
                onClick={() => onZoneClick("footwear")}
            >
                <path d="M55 328 L72 328 L72 338 L53 338 Z" fill={selectedZoneId === "footwear" ? "#f2d48f" : "#1a1a1a"} />
                <path d="M46 338 C53 335, 68 335, 76 338 L78 346 C68 350, 48 350, 42 345 Z" fill={selectedZoneId === "footwear" ? "#f2d48f" : "#111"} />
                <path d="M88 328 L105 328 L105 338 L86 338 Z" fill={selectedZoneId === "footwear" ? "#f2d48f" : "#1a1a1a"} />
                <path d="M84 338 C91 335, 106 335, 114 338 L116 346 C106 350, 86 350, 82 345 Z" fill={selectedZoneId === "footwear" ? "#f2d48f" : "#111"} />
            </g>

</svg>
    );
}

export default function OutfitStudioPage() {
    const router = useRouter();
    const pathname = usePathname();
    const {user, loading, refreshUser} = useAuth();
    const isWomen = user?.bodyProfile?.gender === "women";
    const studioTitle = isWomen ? "Outfit Builder" : "Outfit Studio";
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
    const [tryOnItems, setTryOnItems] = useState<StudioTryOnItem[]>(() => getStudioTryOnItems());
    const [isTryOnOpen, setIsTryOnOpen] = useState(() => getStudioTryOnItems().length > 0);
    const [generatingOutfit, setGeneratingOutfit] = useState(false);
    const [generatedOutfitJobId, setGeneratedOutfitJobId] = useState("");
    const [generatedOutfitImages, setGeneratedOutfitImages] = useState<string[]>([]);
    const [generatedOutfitIndex, setGeneratedOutfitIndex] = useState(0);
    const [outfitNameDraft, setOutfitNameDraft] = useState("Outfit");
    const [isGeneratedZoomOpen, setIsGeneratedZoomOpen] = useState(false);
    const [needsGenerationRecovery, setNeedsGenerationRecovery] = useState(false);
    const [zoomedSavedOutfitId, setZoomedSavedOutfitId] = useState("");
    const [savedOutfits, setSavedOutfits] = useState<SavedOutfitItem[]>([]);
    const [savingOutfit, setSavingOutfit] = useState(false);
    const [sharingOutfitId, setSharingOutfitId] = useState("");
    const [deletingOutfitId, setDeletingOutfitId] = useState("");
    const [savedOutfitIndexes, setSavedOutfitIndexes] = useState<Record<string, number>>({});
    const [generationError, setGenerationError] = useState("");
    const [generationStateHydrated, setGenerationStateHydrated] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        }
    }, [loading, pathname, router, user]);

    useEffect(() => {
        if (!user?.id) return;

        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;

            const storedGeneration = readStoredGenerationState(user.id);
            if (!storedGeneration) {
                setGenerationStateHydrated(true);
                return;
            }

            setGeneratedOutfitJobId(storedGeneration.jobId);
            setGeneratedOutfitImages(storedGeneration.images);
            setGeneratingOutfit(storedGeneration.generating || storedGeneration.images.length === 0);
            setGenerationError(storedGeneration.errorMessage);
            setOutfitNameDraft(storedGeneration.name || "Outfit");
            setNeedsGenerationRecovery(Boolean(storedGeneration.pendingRecovery && !storedGeneration.jobId));
            setGenerationStateHydrated(true);
        });

        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    const loadSavedOutfits = () => {
        fetch(`/api/outfits?ts=${Date.now()}`, {cache: "no-store"})
            .then((response) => response.json())
            .then((data) => {
                const outfits = data.outfits || [];
                setSavedOutfits(outfits);
                setSavedOutfitIndexes((current) =>
                    Object.fromEntries(
                        outfits.map((outfit: SavedOutfitItem) => [
                            outfit.id,
                            Math.min(current[outfit.id] || 0, Math.max(getAvailableOutfitImages(outfit.images).length - 1, 0)),
                        ])
                    )
                );
            })
            .catch(() => {
            });
    };

    useEffect(() => {
        fetch("/api/categories")
            .then((response) => response.json())
            .then((data) => setCategories(data.tree || []))
            .catch(() => {
            });
    }, []);

    useEffect(() => {
        if (!user) return;
        loadSavedOutfits();
    }, [user]);

    useEffect(() => {
        return subscribeToStudioTryOn((items) => {
            setTryOnItems(items);
            setIsTryOnOpen(items.length > 0);
        });
    }, []);

    useEffect(() => {
        if (!user?.id) return;
        if (!generationStateHydrated) return;

        if (!generatedOutfitJobId) {
            if (!generatingOutfit && generatedOutfitImages.length === 0 && !generationError) {
                writeStoredGenerationState(user.id, null);
                setNeedsGenerationRecovery(false);
            } else if (generatingOutfit) {
                writeStoredGenerationState(user.id, {
                    jobId: "",
                    images: generatedOutfitImages,
                    errorMessage: generationError,
                    generating: true,
                    name: outfitNameDraft,
                    pendingRecovery: true,
                });
            }
            return;
        }

        writeStoredGenerationState(user.id, {
            jobId: generatedOutfitJobId,
            images: generatedOutfitImages,
            errorMessage: generationError,
            generating: generatingOutfit,
            name: outfitNameDraft,
            pendingRecovery: false,
        });
    }, [generatedOutfitImages, generatedOutfitJobId, generatingOutfit, generationError, outfitNameDraft, user?.id, generationStateHydrated]);

    useEffect(() => {
        if (!user?.id || !needsGenerationRecovery || generatedOutfitJobId) return;

        let cancelled = false;
        let completed = false;

        const recoverLatestJob = async () => {
            if (cancelled || completed) return;

            try {
                const response = await fetch("/api/generate-outfit/latest", withAuthRequest({ cache: "no-store" }));
                const data = await response.json();
                if (cancelled || !response.ok) return;

                if (!data.job) {
                    return;
                }

                const nextImages = [data.job.images?.front, data.job.images?.back]
                    .filter((image: unknown): image is string => typeof image === "string" && image.length > 0)
                    .map((image: string) => (image.startsWith("data:") ? image : `data:image/png;base64,${image}`));

                setGeneratedOutfitJobId(String(data.job.id || ""));
                setGeneratedOutfitImages(nextImages);
                setGeneratingOutfit(data.job.status === "pending" || data.job.status === "processing");
                setGenerationError(data.job.errorMessage || "");
                setNeedsGenerationRecovery(false);
                completed = true;
                writeStoredGenerationState(user.id, {
                    jobId: String(data.job.id || ""),
                    images: nextImages,
                    errorMessage: data.job.errorMessage || "",
                    generating: data.job.status === "pending" || data.job.status === "processing",
                    name: outfitNameDraft,
                    pendingRecovery: false,
                });
            } catch {
                // Keep retrying while the webhook job is still being created.
            }
        };

        recoverLatestJob();
        const interval = window.setInterval(recoverLatestJob, 2000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [generatedOutfitJobId, needsGenerationRecovery, outfitNameDraft, user?.id]);

    const imageEnhancing = Boolean(user?.bodyProfile?.imageEnhancing);

    useEffect(() => {
        if (!imageEnhancing) return;
        const interval = window.setInterval(() => {
            refreshUser();
        }, 3000);
        return () => window.clearInterval(interval);
    }, [imageEnhancing, refreshUser]);

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
        user?.bodyProfile?.topSize &&
        user?.bodyProfile?.bottomSize &&
        user?.bodyProfile?.shoeSize &&
        user?.bodyProfile?.profileImage &&
        user?.bodyProfile?.gender &&
        !imageEnhancing
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
        if (!user?.bodyProfile?.gender) return;

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
    const filteredTryOnItems = useMemo(
        () => tryOnItems.filter((item) => doesItemMatchZone(selectedZoneId, item, isWomen)),
        [tryOnItems, selectedZoneId, isWomen]
    );
    const selectedZoneMeta = getZoneDetails(selectedZoneId, isWomen);
    const selectedZoneItem = outfit[selectedZoneId];
    const hasSelectedOutfitItems = BODY_ZONES.some((zone) => Boolean(outfit[zone.id]));
    const generationLimit = 100;
    const generationRequestsUsed = Math.min(Number(user?.bodyProfile?.outfitGenerationCount || 0), generationLimit);
    const remainingGenerationRequests = Math.max(generationLimit - generationRequestsUsed, 0);
    const generationLimitReached = remainingGenerationRequests <= 0;

    const handleAddToTryOnFromProductList = (product: StudioProduct) => {
        addStudioTryOnItem({
            id: product._id,
            name: product.name,
            categories: product.categories,
            image: getMainImage(product.images),
            price: product.price.toFixed(2),
            brand: product.brand || "LOOKSMAX",
            quantity: 1,
            maxStock: Math.max(1, product.stock ?? 1),
            productType: product.productType ?? "fashion",
            fashionSubtype: product.fashionSubtype || "clothes",
            originPictures: product.originPictures || {front: "", back: "", left: "", right: ""},
        });
    };

    const handleAssignTryOnItemToSelectedZone = (item: StudioTryOnItem) => {
        if (!doesItemMatchZone(selectedZoneId, item, isWomen)) {
            return;
        }

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

    useEffect(() => {
        const handleAssignFromTray = (event: Event) => {
            const customEvent = event as CustomEvent<StudioTryOnItem>;
            if (!customEvent.detail) return;
            handleAssignTryOnItemToSelectedZone(customEvent.detail);
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
    }, [handleAssignTryOnItemToSelectedZone]);

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
            window.dispatchEvent(new CustomEvent("looksmax:studio-try-on-open"));
        }
    };

    const handleGenerateOutfit = async () => {
        if (generationLimitReached) {
            setGenerationError("Generation limit reached.");
            return;
        }

        setGenerationError("");
        setGeneratedOutfitImages([]);
        setGeneratedOutfitIndex(0);
        setGeneratingOutfit(true);
        setOutfitNameDraft("Outfit");
        setNeedsGenerationRecovery(false);

        if (user?.id) {
            writeStoredGenerationState(user.id, {
                jobId: "",
                images: [],
                errorMessage: "",
                generating: true,
                name: "Outfit",
                pendingRecovery: true,
            });
        }

        try {
            const response = await fetch("/api/generate-outfit", withAuthRequest({
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    profileImage: user?.bodyProfile?.profileImageEnhanced || user?.bodyProfile?.profileImage || "",
                    heightCm: user?.bodyProfile?.heightCm || "",
                    weightKg: user?.bodyProfile?.weightKg || "",
                    topSize: user?.bodyProfile?.topSize || "",
                    bottomSize: user?.bodyProfile?.bottomSize || "",
                    shoeSize: user?.bodyProfile?.shoeSize || "",
                    bodyZones: Object.fromEntries(
                        BODY_ZONES.map((zone) => [
                            zone.id,
                            {
                                status: Boolean(outfit[zone.id]),
                                productId: outfit[zone.id]?.id || "",
                                fashionSubtype: outfit[zone.id]?.fashionSubtype || "",
                                size:
                                    zone.id === "headwear"
                                        ? ""
                                        : zone.id === "outerwear" || zone.id === "top"
                                            ? user?.bodyProfile?.topSize || ""
                                            : zone.id === "bottom"
                                                ? user?.bodyProfile?.bottomSize || ""
                                                : zone.id === "footwear"
                                                    ? user?.bodyProfile?.shoeSize || ""
                                                    : "",
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
            }));
            const data = await response.json();

            if (!response.ok) {
                setGenerationError(data.error || "Unable to generate outfit.");
                setGeneratingOutfit(false);
                if (user?.id) {
                    writeStoredGenerationState(user.id, null);
                    void refreshUser();
                }
                return;
            }

            setGeneratedOutfitJobId(String(data.jobId || ""));
            setNeedsGenerationRecovery(false);
            if (user?.id) {
                writeStoredGenerationState(user.id, {
                    jobId: String(data.jobId || ""),
                    images: [],
                    errorMessage: "",
                    generating: true,
                    name: "Outfit",
                    pendingRecovery: false,
                });
                void refreshUser();
            }
        } catch {
            setGenerationError("Generation request failed.");
            setGeneratingOutfit(false);
            if (user?.id) {
                writeStoredGenerationState(user.id, null);
            }
        }
    };

    const handleSaveOutfit = async () => {
        if (generatedOutfitImages.length === 0) return;

        setSavingOutfit(true);
        try {
            const response = await fetch("/api/outfits", withAuthRequest({
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    name: outfitNameDraft.trim() || "Outfit",
                    images: {
                        front: generatedOutfitImages[0] || "",
                        back: generatedOutfitImages[1] || "",
                    },
                    outfitSnapshot: outfit,
                }),
            }));
            const data = await response.json();
            if (!response.ok) {
                setGenerationError(data.error || "Unable to save outfit.");
                setSavingOutfit(false);
                return;
            }

            setGeneratedOutfitJobId("");
            setGeneratedOutfitImages([]);
            setGeneratedOutfitIndex(0);
            setGenerationError("");
            setOutfitNameDraft("Outfit");
            if (user?.id) {
                writeStoredGenerationState(user.id, null);
            }

            loadSavedOutfits();
        } catch {
            setGenerationError("Unable to save outfit.");
        }
        setSavingOutfit(false);
    };

    const handleDeleteOutfit = async (id: string) => {
        setDeletingOutfitId(id);
        try {
            const response = await fetch(`/api/outfits/${id}`, withAuthRequest({ method: "DELETE" }));
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
            const response = await fetch(`/api/outfits/${id}/share`, {method: "POST"});
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
                        if (user?.id) {
                            writeStoredGenerationState(user.id, {
                                jobId: generatedOutfitJobId,
                                images: generatedOutfitImages,
                                errorMessage: data.job.errorMessage || "Outfit generation failed.",
                                generating: false,
                                name: outfitNameDraft,
                                pendingRecovery: false,
                            });
                        }
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
                        if (user?.id) {
                            writeStoredGenerationState(user.id, {
                                jobId: generatedOutfitJobId,
                                images: nextImages.length > 0 ? nextImages : generatedOutfitImages,
                                errorMessage: "",
                                generating: false,
                                name: outfitNameDraft,
                                pendingRecovery: false,
                            });
                        }
                    }
                })
                .catch(() => {
                });
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
                            {studioTitle}
                        </p>
                        <h1 className="text-2xl font-semibold tracking-wide uppercase">
                            Complete Your {studioTitle} Profile First
                        </h1>
                        <p className="text-sm text-text-secondary max-w-xl mx-auto">
                            Before using the studio, add your height, weight, top size, bottom size, shoe size, gender,
                            and profile photo in account settings.
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
    const generatingPreviewImage =
        user?.bodyProfile?.profileImageEnhanced || user?.bodyProfile?.profileImage || "";
    const isRestoringGeneration = needsGenerationRecovery && !generatedOutfitJobId;
    const showGeneratedOutfitPanel = Boolean(
        generatingOutfit || activeGeneratedOutfitImage || generationError || isRestoringGeneration
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
                        <h1 className="mt-2 text-2xl font-semibold tracking-wide uppercase">{studioTitle}</h1>
                        <p className="mt-2 text-sm text-text-secondary max-w-2xl">
                            Save your body profile, filter products by category, then drag pieces onto the body map
                            from {isWomen ? "handbag" : "headwear"} to shoes.
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
                                    Click a body zone or a tag below, then pick a product from your Try-On Picks.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                {BODY_ZONES.map((zone) => (
                                    <button
                                        key={zone.id}
                                        type="button"
                                        onClick={() => handleSelectZone(zone.id)}
                                        className={`px-0 py-1 text-[11px] uppercase tracking-[0.15em] transition-all ${
                                            selectedZoneId === zone.id
                                                ? "font-bold text-[#1a1a1a] underline underline-offset-[6px] decoration-[1px]"
                                                : "text-[#666] hover:text-[#1a1a1a]"
                                        }`}
                                    >
                                        {getZoneButtonLabel(zone.id, isWomen)}
                                    </button>
                                ))}
                            </div>

                            <div className="border border-[#00000012] bg-[#f6f1e7]">
                                <button
                                    type="button"
                                    onClick={() => setIsTryOnOpen((current) => !current)}
                                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                                    aria-expanded={isTryOnOpen}
                                    aria-controls="studio-try-on-picks"
                                >
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">Try-On
                                            Picks</p>
                                        <p className="mt-1 text-xs text-[#666]">
                                            {isTryOnOpen
                                                ? "Hide the suggestions and keep the stage clean."
                                                : "Open the picks to assign pieces to the selected zone."}
                                        </p>
                                    </div>
                                    <span className="text-[11px] uppercase tracking-[0.18em] text-[#1a1a1a]">
                    {isTryOnOpen ? "Hide" : "Show"}
                  </span>
                                </button>

                                {isTryOnOpen && (
                                    <div id="studio-try-on-picks"
                                         className="space-y-1.5 border-t border-[#00000012] px-4 py-3 2xl:max-h-[300px] 2xl:overflow-y-auto 2xl:pr-1">
                                        {filteredTryOnItems.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => handleAssignTryOnItemToSelectedZone(item)}
                                                className={`flex w-full items-center gap-3 rounded-none p-3 text-left transition-colors ${
                                                    selectedZoneItem?.id === item.id
                                                        ? "bg-[#ede1ce]"
                                                        : "bg-transparent hover:bg-[#ede1ce]"
                                                }`}
                                            >
                                                <div
                                                    className="flex h-[64px] w-[52px] shrink-0 items-center justify-center overflow-hidden bg-[#e8dccb]">
                                                    {item.image ? (
                                                        <img src={item.image} alt={item.name}
                                                             className="h-full w-full object-cover"/>
                                                    ) : (
                                                        <div className="h-5 w-5 border border-[#666]/30"/>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div
                                                        className="text-[13px] leading-5 text-[#1a1a1a]">{item.name}</div>
                                                    <div className="mt-1 text-[12px] text-[#1a1a1a]">
                                                        {formatTndPrice(item.price)}
                                                    </div>
                                                    <div
                                                        className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#666]">
                                                        {item.brand || "LOOKSMAX"}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                        {tryOnItems.length === 0 && (
                                            <div className="bg-[#ede1ce] px-3 py-4 text-xs text-[#666]">
                                                Add products to your Try-On Picks first, then assign them here.
                                            </div>
                                        )}
                                        {tryOnItems.length > 0 && filteredTryOnItems.length === 0 && (
                                            <div className="bg-[#ede1ce] px-3 py-4 text-xs text-[#666]">
                                                No matching products in your Try-On Picks
                                                for {selectedZoneMeta.title.toLowerCase()}.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col items-center bg-transparent px-6 py-6 2xl:min-h-[560px]">
                            <div
                                className={`flex w-full max-w-[280px] transform-gpu flex-col items-center transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
                                    showGeneratedOutfitPanel ? "-translate-x-6" : "translate-x-0"
                                }`}
                            >
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">{isWomen ? "Outfit builder" : "Outfit studio"}</p>

                                <div
                                    className="relative mt-6 flex h-[420px] w-full items-center justify-center overflow-hidden">
                                    <div className="relative h-[420px] w-[160px]">
                                        <StudioModel
                                            isWomen={isWomen}
                                            selectedZoneId={selectedZoneId}
                                            onZoneClick={handleBuilderZoneClick}
                                        />
                                        {BODY_ZONES.map((zone) => {
                                            const assignedItem = outfit[zone.id];
                                            if (!assignedItem?.image) return null;

                                            return (
                                                <button
                                                    key={zone.id}
                                                    type="button"
                                                    tabIndex={-1}
                                                    aria-hidden="true"
                                                    className={`pointer-events-none absolute z-30 ${getZonePreviewPosition(zone.id, isWomen).className} flex h-12 w-12 items-center justify-center overflow-hidden rounded-none border transition-colors ${
                                                        selectedZoneId === zone.id
                                                            ? "border-[#c9a96e] bg-[#f2d48f] shadow-[0_0_0_1px_rgba(201,169,110,0.45)]"
                                                            : "border-[#00000012] bg-[#ede1ce]"
                                                    }`}
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

                                <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-[#999]">Click a zone to
                                    assign</p>
                                <button
                                    type="button"
                                    onClick={handleGenerateOutfit}
                                    disabled={generatingOutfit || !hasSelectedOutfitItems || generationLimitReached}
                                    className="mt-6 w-full rounded-none bg-[#1a1a1a] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#c9a96e] disabled:opacity-50"
                                >
                                    {generatingOutfit
                                        ? "Generating..."
                                        : generationLimitReached
                                            ? "Generation limit reached"
                                        : hasSelectedOutfitItems
                                            ? "Generate outfit"
                                            : "Select at least one item"}
                                </button>
                                <p className="text-[10px] uppercase tracking-[0.18em] text-[#999]">
                                    {remainingGenerationRequests > 0
                                        ? `${remainingGenerationRequests} generation${remainingGenerationRequests === 1 ? "" : "s"} left`
                                        : "No generations left"}
                                </p>
                            </div>
                        </div>

                        {showGeneratedOutfitPanel && (
                            <div className="flex flex-col gap-3 bg-transparent px-6 py-6 2xl:min-h-[560px]">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">Generated
                                        outfit</p>
                                    <button
                                        type="button"
                                        onClick={handleSaveOutfit}
                                        disabled={savingOutfit || generatedOutfitImages.length === 0}
                                        className="rounded-none border border-[#00000012] bg-transparent px-3.5 py-2 text-[11px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e] disabled:opacity-50"
                                    >
                                        {savingOutfit ? "Saving..." : "Save"}
                                    </button>
                                </div>

                                <div
                                    className="flex h-[420px] items-center justify-center bg-[#ede1ce] p-4 text-[#666]">
                                    <div className="relative flex h-full w-full items-center justify-center">
                                        {generatingOutfit && generatingPreviewImage ? (
                                            <>
                                                <img
                                                    src={generatingPreviewImage}
                                                    alt={user.name}
                                                    className="max-h-full w-full object-contain blur-md opacity-60"
                                                />
                                                <div
                                                    className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                                    <div
                                                        className="h-8 w-8 animate-spin rounded-full border-2 border-[#1a1a1a]/15 border-t-[#c9a96e]"/>
                                                    <span className="text-[12px] text-[#666]">Generating...</span>
                                                </div>
                                            </>
                                        ) : isRestoringGeneration ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1a1a1a]/15 border-t-[#c9a96e]"/>
                                                <span className="text-[12px] text-[#666]">Restoring generation...</span>
                                            </div>
                                        ) : activeGeneratedOutfitImage ? (
                                            <>
                                                <div className="image-area relative h-full w-full">
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
                                                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-none border border-[#00000012] bg-[#ede1ce] text-base text-[#1a1a1a]"
                                                        aria-label="Zoom generated outfit"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </>
                                        ) : null}
                                    </div>
                                </div>

                                {generatedOutfitImages.length > 0 && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase tracking-[0.18em] text-[#666]">
                                            Outfit name
                                        </label>
                                        <input
                                            type="text"
                                            value={outfitNameDraft}
                                            onChange={(e) => setOutfitNameDraft(e.target.value)}
                                            className="w-full border border-[#00000012] bg-[#f7f2e8] px-3 py-2 text-sm text-[#1a1a1a] outline-none placeholder:text-[#999]"
                                            placeholder="Outfit name"
                                        />
                                    </div>
                                )}

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
                                    <div className="border border-[#BD3100] bg-[#faf3f2] px-3 py-3 text-xs text-[#BD3100]">
                                        {generationError}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col gap-3 bg-transparent px-6 py-6 2xl:min-h-[560px]">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">Saved outfits</p>
                                <div className="flex items-center gap-2">
                                    <Link
                                        href="/studio/outfits"
                                        className="border border-[#00000012] bg-transparent px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e]"
                                    >
                                        View All
                                    </Link>
                                </div>
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
                                            <div
                                                className="relative flex h-[220px] items-center justify-center overflow-hidden bg-[#e8dccb]">
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
                                                    <div
                                                        className="text-[11px] uppercase tracking-[0.14em] text-[#999]">
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
                                            <div className="mt-3 space-y-3">
                                                <p className="text-sm text-[#1a1a1a]">{outfitItem.name}</p>
                                                <div className="flex flex-wrap gap-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteOutfit(outfitItem.id)}
                                                        disabled={deletingOutfitId === outfitItem.id}
                                                        className="text-[10px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:text-[#c9a96e] disabled:opacity-50"
                                                    >
                                                        {deletingOutfitId === outfitItem.id ? "Deleting..." : "Delete"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleShareOutfit(outfitItem.id)}
                                                        disabled={sharingOutfitId === outfitItem.id}
                                                        className="text-[10px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:text-[#c9a96e] disabled:opacity-50"
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
                                    categories={product.categories}
                                    price={product.price.toFixed(2)}
                                    stock={product.stock}
                                    cartCount={product.cartCount}
                                    tag={product.tag}
                                    sizes={product.sizes}
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
