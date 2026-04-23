"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {useAuth} from "@/providers/AuthContext";
import { useCart } from "@/providers/CartContext";
import ProductCard from "@/components/ProductCard";
import { consumeStudioAssignments, inferStudioAssignmentZone, StudioAssignmentItem, StudioZoneId } from "@/lib/studioAssignment";
import { getCartItemProductId } from "@/lib/cartItem";
import {formatTndPrice} from "@/lib/formatPrice";
import { withAuthRequest } from "@/lib/authClient";
import { shareOutfit } from "@/lib/share";
import { upsertSavedOutfitSession } from "@/lib/savedOutfitsSession";
import { readStudioSessionState, writeStudioSessionState, type StudioSessionZoneItem } from "@/lib/studioSession";

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
    reservedElsewhere?: boolean;
    ownedReservation?: boolean;
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
    price?: string;
    fashionSubtype?: "clothes" | "shoes" | null;
    originPictures?: {
        front?: string;
        back?: string;
        left?: string;
        right?: string;
    };
}

interface OutfitViewItem extends OutfitSlotItem {
    zoneId: StudioZoneId;
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

function matchesSearchKeyword(haystack: string, keyword: string) {
    const normalizedKeyword = normalizeSearchableText(keyword);
    if (!normalizedKeyword) return false;

    if (normalizedKeyword.includes(" ")) {
        return haystack.includes(normalizedKeyword);
    }

    return haystack.split(" ").includes(normalizedKeyword);
}

function getStudioItemSearchText(item: Pick<StudioProduct, "categories" | "name"> | Pick<StudioAssignmentItem, "name"> & {
    categories?: string[]
}) {
    return normalizeSearchableText(
        [item.name, ...(item.categories || [])].filter(Boolean).join(" ")
    );
}

function doesItemMatchZone(
    zoneId: (typeof BODY_ZONES)[number]["id"],
    item: Pick<StudioProduct, "categories" | "name" | "fashionSubtype"> | Pick<StudioAssignmentItem, "name" | "fashionSubtype"> & {
        categories?: string[]
    },
    isWomen: boolean
) {
    if (zoneId === "footwear") {
        return item.fashionSubtype === "shoes" || ZONE_CATEGORY_KEYWORDS.footwear.some((keyword) =>
            matchesSearchKeyword(getStudioItemSearchText(item), keyword)
        );
    }

    if (item.fashionSubtype === "shoes") {
        return false;
    }

    const haystack = getStudioItemSearchText(item);
    return getZoneCategoryKeywords(zoneId, isWomen).some((keyword) => matchesSearchKeyword(haystack, keyword));
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

function StudioModel({
    isWomen,
    selectedZoneId,
    onZoneClick,
}: {
    isWomen: boolean;
    selectedZoneId: string;
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
    const { items: cartItems } = useCart();
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
    const [selectedZoneId, setSelectedZoneId] = useState<string>("");
    const [zoneOverrides, setZoneOverrides] = useState<Partial<Record<StudioZoneId, StudioSessionZoneItem | null>>>({});
    const [zoneHistory, setZoneHistory] = useState<Record<StudioZoneId, OutfitSlotItem[]>>(
        () => BODY_ZONES.reduce((acc, zone) => {
            acc[zone.id] = [];
            return acc;
        }, {} as Record<StudioZoneId, OutfitSlotItem[]>)
    );
    const [generatingOutfit, setGeneratingOutfit] = useState(false);
    const [generatedOutfitJobId, setGeneratedOutfitJobId] = useState("");
    const [generatedOutfitImages, setGeneratedOutfitImages] = useState<string[]>([]);
    const [generatedOutfitIndex, setGeneratedOutfitIndex] = useState(0);
    const [outfitNameDraft, setOutfitNameDraft] = useState("Outfit");
    const [isGeneratedZoomOpen, setIsGeneratedZoomOpen] = useState(false);
    const [needsGenerationRecovery, setNeedsGenerationRecovery] = useState(false);
    const [savingOutfit, setSavingOutfit] = useState(false);
    const [sharingOutfit, setSharingOutfit] = useState(false);
    const [sharedOutfit, setSharedOutfit] = useState(false);
    const [sharedOutfitMode, setSharedOutfitMode] = useState<"copied" | "">("");
    const [generationError, setGenerationError] = useState("");
    const [generationStateHydrated, setGenerationStateHydrated] = useState(false);
    const [studioStateHydrated, setStudioStateHydrated] = useState(false);
    const [showAllSelectedItems, setShowAllSelectedItems] = useState(true);
    const sharedResetTimerRef = useRef<number | null>(null);
    const outfitGenerationStartAbortRef = useRef<AbortController | null>(null);
    const outfitGenerationPollAbortRef = useRef<AbortController | null>(null);
    const ignoredGenerationJobIdRef = useRef("");

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

    useEffect(() => {
        if (!user?.id) return;

        const storedStudioState = readStudioSessionState(user.id);
        if (storedStudioState) {
            setSelectedZoneId(storedStudioState.selectedZoneId || "");
            setShowAllSelectedItems(storedStudioState.showAllSelectedItems);
            setZoneOverrides(storedStudioState.zoneOverrides || {});
        }

        setStudioStateHydrated(true);
    }, [user?.id]);

    useEffect(() => {
        fetch("/api/categories")
            .then((response) => response.json())
            .then((data) => setCategories(data.tree || []))
            .catch(() => {
            });
    }, []);

    useEffect(() => {
        if (!user?.id || !studioStateHydrated) return;
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
    }, [generatedOutfitImages, generatedOutfitJobId, generatingOutfit, generationError, outfitNameDraft, user?.id, generationStateHydrated, studioStateHydrated]);

    useEffect(() => {
        if (!user?.id || !studioStateHydrated) return;

        writeStudioSessionState(user.id, {
            selectedZoneId: selectedZoneId as StudioZoneId | "",
            showAllSelectedItems,
            zoneOverrides,
        });
    }, [selectedZoneId, showAllSelectedItems, zoneOverrides, studioStateHydrated, user?.id]);

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
                if (ignoredGenerationJobIdRef.current && String(data.job.id || "") === ignoredGenerationJobIdRef.current) {
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
                ignoredGenerationJobIdRef.current = "";
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

        fetch(`/api/products?${params}`, { cache: "no-store" })
            .then((response) => response.json())
            .then((data) => setProducts(data.products || []))
            .catch(() => setProducts([]));
    }, [activeCategory, searchTerm]);

    useEffect(() => {
        if (!user?.bodyProfile?.gender) return;

        const params = new URLSearchParams();
        params.set("category", genderCollectionSlug);
        params.set("limit", "8");

        fetch(`/api/products?${params}`, { cache: "no-store" })
            .then((response) => response.json())
            .then((data) =>
                setSuggestedProducts(
                    (data.products || []).filter((product: StudioProduct) => product.productType !== "perfume")
                )
            )
            .catch(() => setSuggestedProducts([]));
    }, [genderCollectionSlug, user?.bodyProfile?.gender]);

    const activeZoneIdForSelection = selectedZoneId;
    const selectedZoneMeta = showAllSelectedItems
        ? {
            title: "All cart items",
            type: "Current cart",
            fit: "Cart items",
            season: "Current cart",
            care: "Tap a card to focus its zone",
        }
        : getZoneDetails(selectedZoneId as StudioZoneId, isWomen);
    const selectedZoneItem = activeZoneIdForSelection ? outfit[activeZoneIdForSelection] : null;
    const allSelectedOutfitItems: OutfitViewItem[] = cartItems.flatMap((cartItem) => {
        if (cartItem.productType === "perfume") return [];

        const productId = getCartItemProductId(cartItem.id);
        const zoneId = inferStudioAssignmentZone({
            categories: cartItem.categories,
            name: cartItem.name,
            fashionSubtype: cartItem.fashionSubtype,
        });

        return [{
            id: productId,
            name: cartItem.name,
            image: cartItem.image,
            price: cartItem.price,
            fashionSubtype: cartItem.fashionSubtype,
            originPictures: cartItem.originPictures,
            zoneId,
        }];
    });
    const selectedZoneHistory: OutfitViewItem[] = showAllSelectedItems
        ? allSelectedOutfitItems
        : allSelectedOutfitItems.filter((item) => item.zoneId === selectedZoneId);
    const hasSelectedOutfitItems = BODY_ZONES.some((zone) => Boolean(outfit[zone.id]));
    const generationLimit = 100;
    const generationRequestsUsed = Math.min(Number(user?.bodyProfile?.outfitGenerationCount || 0), generationLimit);
    const remainingGenerationRequests = Math.max(generationLimit - generationRequestsUsed, 0);
    const generationLimitReached = remainingGenerationRequests <= 0;
    const canGenerateOutfit = profileReady && hasSelectedOutfitItems && !generationLimitReached;
    const shouldOpenProfileSettings = !profileReady;

    const applyAssignmentToZone = (zoneId: StudioZoneId, item: StudioAssignmentItem) => {
        const nextItem: OutfitSlotItem = {
            id: item.id,
            name: item.name,
            image: item.image,
            price: item.price,
            fashionSubtype: item.fashionSubtype,
            originPictures: item.originPictures,
        };

        setSelectedZoneId(zoneId);
        setShowAllSelectedItems(false);
        setZoneOverrides((current) => ({
            ...current,
            [zoneId]: nextItem,
        }));
        setOutfit((current) => ({
            ...current,
            [zoneId]: nextItem,
        }));
        setZoneHistory((current) => {
            const currentZoneHistory = current[zoneId] || [];
            const nextZoneHistory = [
                nextItem,
                ...currentZoneHistory.filter((entry) => entry.id !== nextItem.id),
            ].slice(0, 5);

            if (JSON.stringify(currentZoneHistory) === JSON.stringify(nextZoneHistory)) {
                return current;
            }

            return {
                ...current,
                [zoneId]: nextZoneHistory,
            };
        });
    };

    useEffect(() => {
        if (!studioStateHydrated) return;

        const nextOutfit: Record<string, OutfitSlotItem | null> = Object.fromEntries(
            BODY_ZONES.map((zone) => [zone.id, null])
        );

        for (const zone of BODY_ZONES) {
            if (!(zone.id in zoneOverrides)) continue;

            const override = zoneOverrides[zone.id];
            nextOutfit[zone.id] = override
                ? {
                    id: override.id,
                    name: override.name,
                    image: override.image,
                    price: override.price,
                    fashionSubtype: override.fashionSubtype,
                    originPictures: override.originPictures,
                }
                : null;
        }

        setOutfit((current) => (
            JSON.stringify(current) === JSON.stringify(nextOutfit) ? current : nextOutfit
        ));
    }, [zoneOverrides, studioStateHydrated]);

    useEffect(() => {
        if (!studioStateHydrated) return;

        const syncPendingAssignments = () => {
            const pendingAssignments = consumeStudioAssignments();
            if (pendingAssignments.length === 0) return;

            let lastZoneId: StudioZoneId | null = null;
            for (const item of pendingAssignments) {
                const zoneId = item.preferredZoneId || inferStudioAssignmentZone(item);
                applyAssignmentToZone(zoneId, item);
                lastZoneId = zoneId;
            }

            if (lastZoneId) {
                setSelectedZoneId(lastZoneId);
                setShowAllSelectedItems(false);
            }
        };

        syncPendingAssignments();
        window.addEventListener("looksmax:studio-assignment-change", syncPendingAssignments as EventListener);

        return () => {
            window.removeEventListener("looksmax:studio-assignment-change", syncPendingAssignments as EventListener);
        };
    }, [isWomen, studioStateHydrated]);

    const handleSelectZone = (zoneId: (typeof BODY_ZONES)[number]["id"]) => {
        setShowAllSelectedItems(false);
        setSelectedZoneId(zoneId);
    };

    const handleSelectAllItems = () => {
        setShowAllSelectedItems(true);
        setSelectedZoneId("");
    };

    const handleBuilderZoneClick = (zoneId: (typeof BODY_ZONES)[number]["id"]) => {
        setShowAllSelectedItems(false);
        handleSelectZone(zoneId);
    };

    const handleSelectedZoneItemClick = (
        zoneId: StudioZoneId,
        item: OutfitViewItem,
        keepAllView = false
    ) => {
        const normalizedItemId = getCartItemProductId(item.id);
        setShowAllSelectedItems(keepAllView);
        setSelectedZoneId(zoneId);
        setOutfit((current) => {
            if (current[zoneId]?.id === normalizedItemId) {
                setZoneOverrides((currentOverrides) => ({
                    ...currentOverrides,
                    [zoneId]: null,
                }));
                return {
                    ...current,
                    [zoneId]: null,
                };
            }

            setZoneOverrides((currentOverrides) => ({
                ...currentOverrides,
                [zoneId]: {
                    id: normalizedItemId,
                    name: item.name,
                    image: item.image,
                    price: item.price,
                    fashionSubtype: item.fashionSubtype,
                    originPictures: item.originPictures,
                },
            }));

            return {
                ...current,
                [zoneId]: {
                    id: normalizedItemId,
                    name: item.name,
                    image: item.image,
                    price: item.price,
                    fashionSubtype: item.fashionSubtype,
                    originPictures: item.originPictures,
                },
            };
        });
    };

    const handleGenerateOutfit = async () => {
        if (!profileReady) {
            router.push("/account/settings");
            return;
        }

        if (generationLimitReached) {
            setGenerationError("Generation limit reached.");
            return;
        }

        setGenerationError("");
        setGeneratedOutfitJobId("");
        setGeneratedOutfitImages([]);
        setGeneratedOutfitIndex(0);
        setGeneratingOutfit(true);
        setOutfitNameDraft("Outfit");
        setNeedsGenerationRecovery(false);
        ignoredGenerationJobIdRef.current = "";

        const controller = new AbortController();
        outfitGenerationStartAbortRef.current?.abort();
        outfitGenerationStartAbortRef.current = controller;

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
                signal: controller.signal,
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
            if (!controller.signal.aborted) {
                setGenerationError("Generation request failed.");
                setGeneratingOutfit(false);
                if (user?.id) {
                    writeStoredGenerationState(user.id, null);
                }
            }
            if (user?.id) {
                void refreshUser();
            }
        } finally {
            if (outfitGenerationStartAbortRef.current === controller) {
                outfitGenerationStartAbortRef.current = null;
            }
        }
    };

    const persistGeneratedOutfit = async () => {
        if (generatedOutfitImages.length === 0) return;

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
                return "";
            }

            setGeneratedOutfitJobId("");
            setGeneratedOutfitImages([]);
            setGeneratedOutfitIndex(0);
            setGenerationError("");
            setOutfitNameDraft("Outfit");
            if (user?.id) {
                writeStoredGenerationState(user.id, null);
                upsertSavedOutfitSession(user.id, {
                    id: String(data.outfit?.id || ""),
                    name: String(data.outfit?.name || outfitNameDraft.trim() || "Outfit"),
                    images: {
                        front: String(data.outfit?.images?.front || generatedOutfitImages[0] || ""),
                        back: String(data.outfit?.images?.back || generatedOutfitImages[1] || ""),
                    },
                    outfitSnapshot: data.outfit?.outfitSnapshot || undefined,
                    isPublic: Boolean(data.outfit?.isPublic),
                    shareToken: String(data.outfit?.shareToken || ""),
                    createdAt: String(data.outfit?.createdAt || ""),
                    updatedAt: String(data.outfit?.updatedAt || new Date().toISOString()),
                });
            }

            return String(data.outfit?.id || "");
        } catch {
            setGenerationError("Unable to save outfit.");
            return "";
        }
    };

    const handleSaveOutfit = async () => {
        setSavingOutfit(true);
        const outfitId = await persistGeneratedOutfit();
        if (outfitId) {
            router.push("/studio/outfits");
        }
        setSavingOutfit(false);
    };

    const handleShareGeneratedOutfit = async () => {
        if (generatedOutfitImages.length === 0) return;

        setSharingOutfit(true);
        try {
            const outfitId = await persistGeneratedOutfit();
            if (!outfitId) return;

            const { copied } = await shareOutfit(outfitId);
            if (!copied) {
                setSharedOutfit(false);
                setSharedOutfitMode("");
                return;
            }
            setSharedOutfit(true);
            setSharedOutfitMode("copied");
            if (sharedResetTimerRef.current !== null) {
                window.clearTimeout(sharedResetTimerRef.current);
            }
            sharedResetTimerRef.current = window.setTimeout(() => {
                setSharedOutfit(false);
                setSharedOutfitMode("");
                sharedResetTimerRef.current = null;
            }, 1800);
        } catch {
            setGenerationError("Unable to share outfit.");
            setSharedOutfit(false);
            setSharedOutfitMode("");
        }
        setSharingOutfit(false);
    };

    const handleCancelGeneratedOutfit = () => {
        if (generatedOutfitJobId) {
            ignoredGenerationJobIdRef.current = generatedOutfitJobId;
        }

        outfitGenerationStartAbortRef.current?.abort();
        outfitGenerationStartAbortRef.current = null;
        outfitGenerationPollAbortRef.current?.abort();
        outfitGenerationPollAbortRef.current = null;
        setGeneratedOutfitJobId("");
        setGeneratedOutfitImages([]);
        setGeneratedOutfitIndex(0);
        setGenerationError("");
        setGeneratingOutfit(false);
        setOutfitNameDraft("Outfit");
        setNeedsGenerationRecovery(false);
        if (user?.id) {
            writeStoredGenerationState(user.id, null);
        }
    };

    const handleDiscardGeneratedOutfit = () => {
        ignoredGenerationJobIdRef.current = "";
        outfitGenerationStartAbortRef.current?.abort();
        outfitGenerationStartAbortRef.current = null;
        outfitGenerationPollAbortRef.current?.abort();
        outfitGenerationPollAbortRef.current = null;
        setGeneratedOutfitJobId("");
        setGeneratedOutfitImages([]);
        setGeneratedOutfitIndex(0);
        setGenerationError("");
        setGeneratingOutfit(false);
        setOutfitNameDraft("Outfit");
        setNeedsGenerationRecovery(false);
        if (user?.id) {
            writeStoredGenerationState(user.id, null);
        }
    };

    useEffect(() => {
        return () => {
            if (sharedResetTimerRef.current !== null) {
                window.clearTimeout(sharedResetTimerRef.current);
            }
        };
    }, []);


    useEffect(() => {
        if (!generatedOutfitJobId || !generatingOutfit) return;

        let cancelled = false;

        const pollJob = () => {
            const controller = new AbortController();
            outfitGenerationPollAbortRef.current?.abort();
            outfitGenerationPollAbortRef.current = controller;

            fetch(`/api/generate-outfit/${generatedOutfitJobId}`, {
                signal: controller.signal,
            })
                .then((response) => response.json())
                .then((data) => {
                    if (cancelled || controller.signal.aborted || !data.job) return;
                    if (ignoredGenerationJobIdRef.current && String(data.job.id || "") === ignoredGenerationJobIdRef.current) {
                        return;
                    }

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
                        ignoredGenerationJobIdRef.current = "";
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
                })
                .finally(() => {
                    if (outfitGenerationPollAbortRef.current === controller) {
                        outfitGenerationPollAbortRef.current = null;
                    }
                });
        };

        pollJob();
        const interval = window.setInterval(pollJob, 2000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
            outfitGenerationPollAbortRef.current?.abort();
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
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 max-w-2xl">
                        <p className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">New Feature</p>
                        <h1 className="mt-2 text-2xl font-semibold tracking-wide uppercase leading-tight">{studioTitle}</h1>
                    </div>
                    <Link
                        href="/account/settings"
                        className="mt-1 inline-flex h-10 shrink-0 items-center border border-border-color px-4 text-[10px] uppercase tracking-wider text-text-secondary hover:text-foreground md:mt-0"
                    >
                        Edit Profile
                    </Link>
                </div>

                <section className="mx-auto w-full max-w-[1320px] bg-transparent">
                    <div
                        className={`grid grid-cols-1 gap-8 md:grid-cols-2 2xl:transition-all 2xl:duration-300 ${
                            showGeneratedOutfitPanel
                                ? "2xl:[grid-template-columns:repeat(3,minmax(0,1fr))]"
                                : "2xl:[grid-template-columns:repeat(2,minmax(0,1fr))]"
                        }`}
                    >
                        <div className="flex flex-col gap-4 bg-transparent px-6 py-6 2xl:min-h-[560px]">


                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleSelectAllItems}
                                    className={`px-0 py-1 text-[11px] uppercase tracking-[0.15em] transition-all ${
                                        showAllSelectedItems
                                            ? "font-bold text-[#1a1a1a] underline underline-offset-[6px] decoration-[1px]"
                                            : "text-[#666] hover:text-[#1a1a1a]"
                                    }`}
                                >
                                    ALL
                                </button>
                                {BODY_ZONES.map((zone) => (
                                    <button
                                        key={zone.id}
                                        type="button"
                                    onClick={() => handleSelectZone(zone.id)}
                                    className={`px-0 py-1 text-[11px] uppercase tracking-[0.15em] transition-all ${
                                            activeZoneIdForSelection === zone.id
                                                ? "font-bold text-[#1a1a1a] underline underline-offset-[6px] decoration-[1px]"
                                                : "text-[#666] hover:text-[#1a1a1a]"
                                        }`}
                                    >
                                        {getZoneButtonLabel(zone.id, isWomen)}
                                    </button>
                                ))}
                            </div>

                            {selectedZoneHistory.length > 0 && (
                                <div className="border border-[#00000012] bg-[#f6f1e7] px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">
                                        {showAllSelectedItems ? "All cart items" : "Zone items"}
                                    </p>
                                    <div className="mt-3 space-y-2">
                                        {selectedZoneHistory.map((item) => {
                                            const isSelectedHistoryItem =
                                                outfit[item.zoneId]?.id === item.id ||
                                                selectedZoneItem?.id === item.id;

                                            return (
                                            <button
                                                key={`${item.zoneId}-${item.id}`}
                                                type="button"
                                                onClick={() => handleSelectedZoneItemClick(item.zoneId, item, showAllSelectedItems)}
                                                className={`flex w-full items-center gap-3 rounded-none p-2 text-left transition-colors ${
                                                    isSelectedHistoryItem
                                                        ? "bg-[#ede1ce]"
                                                        : "bg-transparent hover:bg-[#ede1ce]"
                                                }`}
                                            >
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-[#e8dccb]">
                                                    {item.image ? (
                                                        <img
                                                            src={item.image}
                                                            alt={item.name}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="h-4 w-4 border border-[#666]/30" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-[12px] leading-5 text-[#1a1a1a]">
                                                        {item.name}
                                                    </div>
                                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#666]">
                                                        {item.price ? formatTndPrice(item.price) : ""}
                                                    </div>
                                            </div>
                                            </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col items-center bg-transparent px-6 py-6 2xl:min-h-[560px]">
                            <div
                                className={`flex w-full max-w-[280px] transform-gpu flex-col items-center transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
                                    showGeneratedOutfitPanel ? "2xl:-translate-x-6" : "translate-x-0"
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
                                                    onClick={() => {
                                                        setZoneOverrides((currentOverrides) => ({
                                                            ...currentOverrides,
                                                            [zone.id]: null,
                                                        }));
                                                        setOutfit((current) => ({
                                                            ...current,
                                                            [zone.id]: null,
                                                        }));
                                                    }}
                                                    className={`absolute z-30 ${getZonePreviewPosition(zone.id, isWomen).className} flex h-12 w-12 items-center justify-center overflow-hidden rounded-none border transition-colors ${
                                                        activeZoneIdForSelection === zone.id
                                                            ? "border-[#c9a96e] bg-[#f2d48f] shadow-[0_0_0_1px_rgba(201,169,110,0.45)]"
                                                            : "border-[#00000012] bg-[#ede1ce]"
                                                    }`}
                                                    aria-label={`Remove ${assignedItem.name} from ${zone.label}`}
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

                                <button
                                    type="button"
                                    onClick={handleGenerateOutfit}
                                    disabled={generatingOutfit || (!canGenerateOutfit && !shouldOpenProfileSettings)}
                                    className={`mt-6 w-full rounded-none px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-colors ${
                                        generatingOutfit || (!canGenerateOutfit && !shouldOpenProfileSettings)
                                            ? "cursor-not-allowed bg-[#1a1a1a] opacity-50"
                                            : "bg-[#1a1a1a] hover:bg-[#c9a96e]"
                                    }`}
                                >
                                    {generatingOutfit
                                        ? "Generating..."
                                        : !profileReady
                                            ? "Update profile to generate"
                                        : generationLimitReached
                                            ? "Generation limit reached"
                                        : hasSelectedOutfitItems
                                            ? "Generate outfit"
                                            : "Select at least one item"}
                                </button>
                                <Link
                                    href="/studio/outfits"
                                    className="mt-3 inline-flex w-full items-center justify-center rounded-none border border-[#00000012] bg-transparent px-3.5 py-2 text-[11px] uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e]"
                                >
                                    SEE ALL OUTFITS
                                </Link>
                                <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[#999]">
                                    {remainingGenerationRequests > 0
                                        ? `${remainingGenerationRequests} generation${remainingGenerationRequests === 1 ? "" : "s"} left`
                                        : "No generations left"}
                                </p>
                            </div>
                        </div>

                        {showGeneratedOutfitPanel && (
                            <div className="flex flex-col gap-3 bg-transparent px-6 py-6 2xl:min-h-[560px]">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-[#666]">Generated
                                            outfit</p>
                                        {generatingOutfit && (
                                            <button
                                                type="button"
                                                onClick={handleCancelGeneratedOutfit}
                                                aria-label="Cancel generation"
                                                className="inline-flex h-7 w-7 items-center justify-center border border-[#00000012] text-[13px] leading-none text-[#666] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e]"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                    {activeGeneratedOutfitImage && !generatingOutfit && !isRestoringGeneration ? (
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={handleSaveOutfit}
                                                disabled={savingOutfit || sharingOutfit || generatedOutfitImages.length === 0}
                                                className="px-0 py-1 text-[11px] uppercase tracking-[0.15em] text-[#666] hover:text-[#1a1a1a] hover:underline hover:underline-offset-[6px] hover:decoration-[1px] disabled:opacity-50 disabled:no-underline"
                                            >
                                                {savingOutfit ? "Saving..." : "Save"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleShareGeneratedOutfit}
                                                disabled={savingOutfit || sharingOutfit || generatedOutfitImages.length === 0}
                                                aria-busy={sharingOutfit}
                                                className="px-0 py-1 text-[11px] uppercase tracking-[0.15em] text-[#666] hover:text-[#1a1a1a] hover:underline hover:underline-offset-[6px] hover:decoration-[1px] disabled:opacity-50 disabled:no-underline"
                                            >
                                                {sharedOutfit ? "Copied" : "Share"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleDiscardGeneratedOutfit}
                                                disabled={savingOutfit || sharingOutfit}
                                                className="px-0 py-1 text-[11px] uppercase tracking-[0.15em] text-[#666] hover:text-[#430C05] hover:underline hover:underline-offset-[6px] hover:decoration-[1px] disabled:opacity-50 disabled:no-underline"
                                            >
                                                Discard
                                            </button>
                                        </div>
                                    ) : null}
                                </div>

                                <div
                                    className="flex h-[420px] items-center justify-center p-0 text-[#666]">
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
                                                <div className="image-area relative inline-block max-h-full max-w-full">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (generatedOutfitImages.length > 1) {
                                                                cycleGeneratedImage();
                                                                return;
                                                            }
                                                            setIsGeneratedZoomOpen(true);
                                                        }}
                                                        className="block h-full w-full rounded-none"
                                                    >
                                                        <img
                                                            src={activeGeneratedOutfitImage}
                                                            alt={`Generated outfit ${generatedOutfitIndex + 1}`}
                                                            className="block max-h-[420px] max-w-full object-contain"
                                                        />
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
                                    <div className="border border-[#430C05] bg-[#faf3f2] px-3 py-3 text-xs text-[#430C05]">
                                        {generationError}
                                    </div>
                                )}
                            </div>
                        )}

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
                                    reservedElsewhere={product.reservedElsewhere}
                                    ownedReservation={product.ownedReservation}
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

        </div>
    );
}
