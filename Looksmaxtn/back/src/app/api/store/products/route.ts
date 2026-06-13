import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import { scoreProductSearch } from "@/store/lib/productSearch";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import {
  buildVariantAvailability,
  getDisplayStock,
  type VariantLike,
} from "@/lib/variantAvailability";
import {
  averageVariantConditionScore,
  deriveColors,
  deriveSizes,
  normalizeStoredVariants,
  normalizeStoredVariantColor,
} from "@/lib/productVariants";

const DAY_MS = 86400000;
const NEW_TAG_FALLBACK_DAYS = 3;

function uniqueSortedValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function uniqueSortedHexes(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function filterPublicProductMedia<I extends { isPublic?: boolean }>(
  images: I[],
  variants: ReadonlyArray<VariantLike & { images?: number[] }>,
) {
  const publicEntries = (images || [])
    .map((image, imageIndex) => ({ image, imageIndex }))
    .filter(({ image }) => image.isPublic !== false);
  const publicIndexByOriginal = new Map(
    publicEntries.map(({ imageIndex }, publicIndex) => [imageIndex, publicIndex])
  );
  return {
    images: publicEntries.map(({ image }) => image),
    variants: variants.map((variant) => ({
      ...variant,
      images: (variant.images || [])
        .map((imageIndex) => publicIndexByOriginal.get(imageIndex))
        .filter((imageIndex): imageIndex is number => typeof imageIndex === "number"),
    })) as Array<VariantLike & { images: number[] }>,
  };
}

type TaggedDoc = { tag?: string; createdAt?: Date; newTagDurationDays?: number };

function isNewTagExpired(doc: TaggedDoc, nowMs: number) {
  if (String(doc.tag || "").toUpperCase() !== "NEW") return false;
  const durationDays = Math.max(1, Number(doc.newTagDurationDays) || NEW_TAG_FALLBACK_DAYS);
  const createdMs = doc.createdAt ? new Date(doc.createdAt).getTime() : 0;
  return createdMs > 0 && nowMs - createdMs > durationDays * DAY_MS;
}

function effectiveTagRank(doc: TaggedDoc, nowMs: number) {
  const value = String(doc.tag || "").toUpperCase();
  if (value === "NEW" && !isNewTagExpired(doc, nowMs)) return 0;
  if (value === "FAVORITE") return 1;
  return 2;
}

// Aggregation twin of effectiveTagRank: NEW (not expired) → 0, FAVORITE → 1, else 2.
const TAG_RANK_EXPR = {
  $switch: {
    branches: [
      {
        case: {
          $and: [
            { $eq: [{ $toUpper: { $ifNull: ["$tag", ""] } }, "NEW"] },
            {
              $gt: [
                {
                  $add: [
                    { $ifNull: ["$createdAt", new Date(0)] },
                    {
                      $multiply: [
                        { $max: [1, { $ifNull: ["$newTagDurationDays", NEW_TAG_FALLBACK_DAYS] }] },
                        DAY_MS,
                      ],
                    },
                  ],
                },
                "$$NOW",
              ],
            },
          ],
        },
        then: 0,
      },
      { case: { $eq: [{ $toUpper: { $ifNull: ["$tag", ""] } }, "FAVORITE"] }, then: 1 },
    ],
    default: 2,
  },
};

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const brand = searchParams.get("brand");
    const store = searchParams.get("store");
    const size = searchParams.get("size");
    const sizes = size
      ? size.split(",").map((value) => value.trim()).filter(Boolean)
      : [];
    const color = searchParams.get("color");
    const availability = searchParams.get("availability");
    const priceMin = Number(searchParams.get("priceMin") || "");
    const priceMax = Number(searchParams.get("priceMax") || "");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const rawLimit = searchParams.get("limit");
    const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : 0;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 0;
    const includeFacets = searchParams.get("includeFacets") === "1";
    const rk = searchParams.get("rk");

    const skip = limit > 0 ? (page - 1) * limit : 0;
    const nowMs = Date.now();

    // Everything below is filtered, sorted, and paginated inside MongoDB; only
    // the returned page is hydrated and enriched with availability data.
    const baseClauses: Record<string, unknown>[] = [
      { $or: [{ approvalStatus: "approved" }, { approvalStatus: { $exists: false } }] },
      { ownerApproved: { $ne: false } },
      { isActive: { $ne: false } },
    ];
    if (category === "new-arrivals" || category === "new") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      baseClauses.push({ createdAt: { $gte: weekAgo } });
    } else if (category) {
      baseClauses.push({ categories: category });
    }

    // The storefront "store" value is the owner's storeName with a
    // createdBy.name fallback, so the filter resolves owners first.
    let storeOwnerIds: string[] = [];
    if (store) {
      const storeOwners = await User.find({ storeName: store }).select("_id").lean();
      storeOwnerIds = storeOwners.map((owner) => owner._id.toString());
    }
    const storeClause = store
      ? { $or: [{ "createdBy.id": { $in: storeOwnerIds } }, { "createdBy.name": store }] }
      : null;

    const attributeClauses: Record<string, unknown>[] = [];
    if (storeClause) attributeClauses.push(storeClause);
    if (brand) attributeClauses.push({ brand });
    if (sizes.length > 0) attributeClauses.push({ "variants.size": { $in: sizes } });
    if (color) {
      const normalized = (normalizeStoredVariantColor(color) || color).toLowerCase();
      const colorForms = [...new Set([normalized, normalized.replace(/^#/, "")])];
      attributeClauses.push({ "variants.color": { $in: colorForms } });
    }
    // Availability ignores short-lived cart reservations here; the per-page
    // availability payload below still reflects them.
    const inStockClause = {
      $or: [
        { "variants.stock": { $gt: 0 } },
        { $and: [{ "variants.0": { $exists: false } }, { stock: { $gt: 0 } }] },
      ],
    };
    if (availability === "in-stock") attributeClauses.push(inStockClause);
    if (availability === "out-of-stock") attributeClauses.push({ $nor: [inStockClause] });
    const priceClause: Record<string, number> = {};
    if (Number.isFinite(priceMin)) priceClause.$gte = priceMin;
    if (Number.isFinite(priceMax) && priceMax > 0) priceClause.$lte = priceMax;
    if (Object.keys(priceClause).length > 0) attributeClauses.push({ price: priceClause });

    const baseQuery = { $and: baseClauses };
    const listingQuery = { $and: [...baseClauses, ...attributeClauses] };

    let pageIds: string[] = [];
    let total = 0;
    let searchMatchedIds: unknown[] | null = null;

    if (search) {
      // Fuzzy ranking (synonyms + typo tolerance) stays in JS, but only over a
      // light projection of the base-filtered set — never full documents.
      const candidates = await Product.find(baseQuery)
        .select(
          "name brand categories description tag cloneSourceName price stock createdAt newTagDurationDays variants.size variants.color variants.stock createdBy"
        )
        .lean();
      const matched = candidates
        .map((doc) => {
          const variants = Array.isArray(doc.variants) ? doc.variants : [];
          return {
            doc,
            sizes: deriveSizes(variants),
            colors: deriveColors(variants),
          };
        })
        .filter((entry) =>
          scoreProductSearch(
            { ...entry.doc, _id: String(entry.doc._id), sizes: entry.sizes, colors: entry.colors },
            search
          ) > 0
        );
      searchMatchedIds = matched.map((entry) => entry.doc._id);

      const storeOwnerIdSet = new Set(storeOwnerIds);
      const normalizedColor = color ? (normalizeStoredVariantColor(color) || color).toLowerCase() : "";
      const filtered = matched.filter(({ doc, sizes: docSizes, colors: docColors }) => {
        if (store) {
          const ownerId = doc.createdBy?.id || "";
          if (!storeOwnerIdSet.has(ownerId) && doc.createdBy?.name !== store) return false;
        }
        if (brand && doc.brand !== brand) return false;
        if (sizes.length > 0 && !sizes.some((value) => docSizes.includes(value))) return false;
        if (color && !docColors.some((value) => value.toLowerCase() === normalizedColor)) return false;
        if (availability === "in-stock" || availability === "out-of-stock") {
          const variants = Array.isArray(doc.variants) ? doc.variants : [];
          const inStock = variants.length > 0
            ? variants.some((variant) => (variant.stock ?? 0) > 0)
            : (doc.stock ?? 0) > 0;
          if (availability === "in-stock" && !inStock) return false;
          if (availability === "out-of-stock" && inStock) return false;
        }
        if (Number.isFinite(priceMin) && (doc.price ?? 0) < priceMin) return false;
        if (Number.isFinite(priceMax) && priceMax > 0 && (doc.price ?? 0) > priceMax) return false;
        return true;
      });

      const ranked = filtered
        .map(({ doc }) => doc)
        .sort((a, b) => {
          const rankDiff = effectiveTagRank(a, nowMs) - effectiveTagRank(b, nowMs);
          if (rankDiff !== 0) return rankDiff;
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (bTime !== aTime) return bTime - aTime;
          return String(b._id).localeCompare(String(a._id));
        });

      total = ranked.length;
      const pageDocs = limit > 0 ? ranked.slice(skip, skip + limit) : ranked;
      pageIds = pageDocs.map((doc) => String(doc._id));
    } else {
      const [idRows, count] = await Promise.all([
        Product.aggregate<{ _id: mongoose.Types.ObjectId }>([
          { $match: listingQuery },
          { $project: { tag: 1, createdAt: 1, newTagDurationDays: 1 } },
          { $addFields: { _tagRank: TAG_RANK_EXPR } },
          { $sort: { _tagRank: 1, createdAt: -1, _id: -1 } },
          ...(limit > 0 ? [{ $skip: skip }, { $limit: limit }] : []),
          { $project: { _id: 1 } },
        ]),
        Product.countDocuments(listingQuery),
      ]);
      pageIds = idRows.map((row) => String(row._id));
      total = count;
    }

    const pageObjectIds = pageIds.map((id) => new mongoose.Types.ObjectId(id));
    const pageDocs = pageObjectIds.length > 0
      ? await Product.find({ _id: { $in: pageObjectIds } }).lean()
      : [];
    const docsById = new Map(pageDocs.map((doc) => [String(doc._id), doc]));
    const orderedDocs = pageIds
      .map((id) => docsById.get(id))
      .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc));

    const ownerIds = [...new Set(
      orderedDocs
        .map((product) => product.createdBy?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )].filter((id) => mongoose.Types.ObjectId.isValid(id));
    const owners = ownerIds.length > 0
      ? await User.find({ _id: { $in: ownerIds } })
          .select("_id role storeType storeName name")
          .lean()
      : [];
    const ownerMap = new Map(owners.map((owner) => [owner._id.toString(), owner]));

    // Reservation and order-hold lookups are scoped to the returned page only.
    const now = new Date();
    const activeReservations = pageObjectIds.length > 0
      ? await ProductReservation.find({
          product: { $in: pageObjectIds },
          reservedUntil: { $gt: now },
        })
          .select("product reservationKey quantity variant")
          .lean()
      : [];
    const activeOrderHoldMap = await getActiveOrderHoldMapByProductIds(
      pageIds,
      session?.userId || null
    );
    const reservationKey = session?.userId ? `user:${session.userId}` : (rk || null);
    const reservationMap = activeReservations.reduce((map, reservation) => {
      const productId = reservation.product.toString();
      const current =
        map.get(productId) || {
          totalQuantity: 0,
          ownedQuantity: 0,
          entries: [] as Array<{ reservationKey: string; quantity: number; variant: unknown }>,
        };
      const quantity = Math.max(1, Number(reservation.quantity) || 1);
      current.totalQuantity += quantity;
      if (reservationKey && reservation.reservationKey === reservationKey) {
        current.ownedQuantity += quantity;
      }
      current.entries.push({
        reservationKey: reservation.reservationKey,
        quantity,
        variant: reservation.variant,
      });
      map.set(productId, current);
      return map;
    }, new Map<string, {
      totalQuantity: number;
      ownedQuantity: number;
      entries: Array<{ reservationKey: string; quantity: number; variant: unknown }>;
    }>());

    const returnedProducts = orderedDocs.map((product) => {
      const ownerId = product.createdBy?.id || "";
      const storedVariants = normalizeStoredVariants(product.variants) as Array<VariantLike & { images: number[] }>;
      const publicMedia = filterPublicProductMedia(product.images || [], storedVariants);
      const variants = publicMedia.variants;
      const stock = Math.max(product.stock ?? 0, 0);
      const reservationInfo = reservationMap.get(product._id.toString()) || {
        totalQuantity: 0,
        ownedQuantity: 0,
        entries: [],
      };
      const activeOrderHold = activeOrderHoldMap.get(product._id.toString());
      const variantAvailability = variants.length > 0
        ? buildVariantAvailability(variants, reservationInfo.entries, reservationKey)
        : null;
      const reservedByOthers = reservationInfo.totalQuantity - reservationInfo.ownedQuantity;
      const displayStock = variantAvailability
        ? getDisplayStock(stock, variantAvailability)
        : Math.max(stock - reservedByOthers, 0);

      const hasSelectableVariant = variantAvailability
        ? Object.values(variantAvailability).some((entry) => entry.available)
        : displayStock > 0;
      const blockedByOrder = variantAvailability
        ? Boolean(activeOrderHold) && !hasSelectableVariant
        : Boolean(activeOrderHold) && displayStock <= 0;

      const owner = ownerMap.get(ownerId);
      const derivedSizes = deriveSizes(variants);
      const derivedColors = deriveColors(variants);

      const conditionScore = product.conditionScore != null
        ? product.conditionScore
        : averageVariantConditionScore(variants);

      return {
        ...product,
        images: publicMedia.images,
        conditionScore,
        stock: displayStock,
        cartCount: reservationInfo.totalQuantity,
        blockedByOrder,
        ownedReservation: reservationInfo.ownedQuantity > 0,
        variantAvailability,
        variants,
        sizes: derivedSizes,
        colors: derivedColors,
        tag: isNewTagExpired(product, nowMs) ? "" : product.tag,
        storeType: owner?.role === "store_owner" ? (owner as { storeType?: string }).storeType || null : null,
        storeName: (owner as { storeName?: string; name?: string } | undefined)?.storeName || product.createdBy?.name || "",
      };
    });

    let facets;
    if (includeFacets) {
      // Facets respect the category/search/store scope (matching the previous
      // behavior) and are computed inside MongoDB instead of over hydrated docs.
      const facetClauses: Record<string, unknown>[] = [...baseClauses];
      if (searchMatchedIds) facetClauses.push({ _id: { $in: searchMatchedIds } });
      if (storeClause) facetClauses.push(storeClause);
      const [facetRow] = await Product.aggregate<{
        categories: Array<{ _id: string }>;
        brands: Array<{ _id: string }>;
        owners: Array<{ _id: { id?: string; name?: string } | null }>;
        sizes: Array<{ _id: string }>;
        colors: Array<{ _id: string | null }>;
        price: Array<{ min: number; max: number }>;
      }>([
        { $match: { $and: facetClauses } },
        {
          $facet: {
            categories: [{ $unwind: "$categories" }, { $group: { _id: "$categories" } }],
            brands: [{ $group: { _id: "$brand" } }],
            owners: [{ $group: { _id: { id: "$createdBy.id", name: "$createdBy.name" } } }],
            sizes: [{ $unwind: "$variants" }, { $group: { _id: "$variants.size" } }],
            colors: [{ $unwind: "$variants" }, { $group: { _id: "$variants.color" } }],
            price: [{ $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } }],
          },
        },
      ]);

      const ownerPairs = (facetRow?.owners || [])
        .map((row) => row._id)
        .filter((pair): pair is { id?: string; name?: string } => Boolean(pair));
      const facetOwnerIds = [...new Set(
        ownerPairs
          .map((pair) => pair.id)
          .filter((id): id is string => typeof id === "string" && mongoose.Types.ObjectId.isValid(id))
      )];
      const facetOwners = facetOwnerIds.length > 0
        ? await User.find({ _id: { $in: facetOwnerIds } }).select("_id storeName").lean()
        : [];
      const storeNameByOwnerId = new Map(
        facetOwners.map((owner) => [owner._id.toString(), owner.storeName || ""])
      );

      facets = {
        categories: uniqueSortedValues((facetRow?.categories || []).map((row) => String(row._id || ""))),
        brands: uniqueSortedValues((facetRow?.brands || []).map((row) => String(row._id || ""))),
        stores: uniqueSortedValues(
          ownerPairs.map((pair) => storeNameByOwnerId.get(pair.id || "") || pair.name || "")
        ),
        sizes: uniqueSortedValues((facetRow?.sizes || []).map((row) => String(row._id || "").trim())),
        colors: uniqueSortedHexes(
          (facetRow?.colors || []).map((row) => normalizeStoredVariantColor(row._id) || "")
        ),
        priceRange: {
          min: facetRow?.price?.[0]?.min ?? 0,
          max: facetRow?.price?.[0]?.max ?? 0,
        },
      };
    }

    const response = NextResponse.json({
      products: returnedProducts,
      total,
      page,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
      facets,
    });
    // Anonymous, reservation-free listings are generic — let the CDN absorb them.
    if (!session && !rk) {
      response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    }
    return response;
  } catch (error: unknown) {
    console.error("Get products error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await req.json();
    const product = await Product.create(body);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error: unknown) {
    console.error("Create product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
