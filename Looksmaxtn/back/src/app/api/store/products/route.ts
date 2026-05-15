import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";
import { filterAndRankProducts } from "@/store/lib/productSearch";
import { getActiveOrderHoldMapByProductIds } from "@/lib/productInventory";
import {
  buildVariantAvailability,
  getDisplayStock,
  type VariantLike,
} from "@/lib/variantAvailability";
import { isStoreOwnerApproved } from "@/store/lib/storeApproval";
import {
  averageVariantConditionScore,
  deriveColors,
  deriveSizes,
  normalizeStoredVariants,
} from "@/lib/productVariants";

function uniqueSortedValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function uniqueSortedHexes(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

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
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "24");
    const includeFacets = searchParams.get("includeFacets") === "1";

    const filter: Record<string, unknown> = {
      $or: [{ approvalStatus: "approved" }, { approvalStatus: { $exists: false } }],
    };
    if (category === "new-arrivals" || category === "new") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filter.createdAt = { $gte: weekAgo };
    } else if (category) {
      filter.categories = category;
    }

    const skip = (page - 1) * limit;

    const products = await Product.find(filter)
      .sort(category === "new" ? { createdAt: -1 } : { createdAt: -1 })
      .lean();
    const ownerIds = [...new Set(
      products
        .map((product) => product.createdBy?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )];
    const owners = ownerIds.length > 0
      ? await User.find({ _id: { $in: ownerIds } })
          .select("_id role storeApprovalStatus storeType storeName name")
          .lean()
      : [];
    const approvedOwnerIds = new Set(
      owners
        .filter((owner) => isStoreOwnerApproved(owner))
        .map((owner) => owner._id.toString())
    );
    const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));
    const now = new Date();
    const activeReservations = await ProductReservation.find({ reservedUntil: { $gt: now } })
      .select("product reservationKey quantity variant")
      .lean();
    const activeOrderHoldMap = await getActiveOrderHoldMapByProductIds(
      products.map((product) => product._id.toString()),
      session?.userId || null
    );
    const reservationKey = session?.userId ? `user:${session.userId}` : (searchParams.get("rk") || null);
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

    const productsWithAvailability = products.map((product) => {
      const ownerId = product.createdBy?.id || "";
      if (ownerId && !approvedOwnerIds.has(ownerId)) {
        return null;
      }
      const variants = normalizeStoredVariants(product.variants) as VariantLike[];
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
      const reservedElsewhere = variantAvailability
        ? Object.values(variantAvailability).some((entry) => entry.reservedElsewhere)
        : reservedByOthers > 0 && (reservedByOthers >= stock || reservedByOthers + reservationInfo.ownedQuantity > stock);
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
        conditionScore,
        stock: displayStock,
        cartCount: reservationInfo.totalQuantity,
        blockedByOrder,
        reservedElsewhere,
        ownedReservation: reservationInfo.ownedQuantity > 0,
        variantAvailability,
        variants,
        sizes: derivedSizes,
        colors: derivedColors,
        storeType: owner?.role === "store_owner" ? (owner as { storeType?: string }).storeType || null : null,
        storeName: (owner as { storeName?: string; name?: string } | undefined)?.storeName || product.createdBy?.name || "",
      };
    });

    const visibleProducts = productsWithAvailability.filter(
      (product): product is NonNullable<(typeof productsWithAvailability)[number]> => product !== null
    );

    const searchMatchedProducts = search
      ? filterAndRankProducts(visibleProducts, search)
      : visibleProducts;

    const filteredProducts = searchMatchedProducts.filter((product) => {
      if (product.isActive === false) return false;
      if (product.approvalStatus && product.approvalStatus !== "approved") return false;
      const stock = Math.max(product.stock ?? 0, 0);
      const hasSelectableVariant = product.variantAvailability
        ? Object.values(product.variantAvailability).some((entry) => entry.available)
        : stock > 0;
      if (store && product.storeName !== store) return false;
      if (brand && product.brand !== brand) return false;
      if (sizes.length > 0 && !sizes.some((sizeValue) => (product.sizes || []).includes(sizeValue))) return false;
      if (color && !(product.colors || []).some((c) => c === color)) return false;
      if (availability === "out-of-stock") return !hasSelectableVariant;
      if (availability === "in-stock") return hasSelectableVariant;
      if (Number.isFinite(priceMin) && product.price < priceMin) return false;
      if (Number.isFinite(priceMax) && priceMax > 0 && product.price > priceMax) return false;
      return true;
    });

    const facetsSource = store
      ? searchMatchedProducts.filter((product) => product.storeName === store)
      : searchMatchedProducts;
    const facets = includeFacets
      ? {
          categories: uniqueSortedValues(facetsSource.flatMap((product) => product.categories || [])),
          brands: uniqueSortedValues(facetsSource.map((product) => product.brand || "")),
          stores: uniqueSortedValues(facetsSource.map((product) => product.storeName || "")),
          sizes: uniqueSortedValues(facetsSource.flatMap((product) => product.sizes || [])),
          colors: uniqueSortedHexes(facetsSource.flatMap((product) => product.colors || [])),
          priceRange: {
            min: facetsSource.length > 0 ? Math.min(...facetsSource.map((product) => product.price || 0)) : 0,
            max: facetsSource.length > 0 ? Math.max(...facetsSource.map((product) => product.price || 0)) : 0,
          },
        }
      : undefined;

    const nowMs = Date.now();
    const productsWithEffectiveTag = filteredProducts.map((product) => {
      const rawTag = typeof product.tag === "string" ? product.tag : "";
      if (rawTag.toUpperCase() === "NEW") {
        const durationDays = Math.max(1, Number(product.newTagDurationDays) || 3);
        const createdMs = product.createdAt ? new Date(product.createdAt).getTime() : 0;
        const expired = createdMs > 0 && nowMs - createdMs > durationDays * 86400000;
        if (expired) return { ...product, tag: "" };
      }
      return product;
    });

    const tagRank = (tag: unknown) => {
      const value = typeof tag === "string" ? tag.toUpperCase() : "";
      if (value === "NEW") return 0;
      if (value === "FAVORITE") return 1;
      return 2;
    };
    const sortedProducts = [...productsWithEffectiveTag].sort((a, b) => {
      const rankDiff = tagRank(a.tag) - tagRank(b.tag);
      if (rankDiff !== 0) return rankDiff;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    const total = sortedProducts.length;
    const paginatedProducts = sortedProducts.slice(skip, skip + limit);

    return NextResponse.json({
      products: paginatedProducts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      facets,
    });
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
