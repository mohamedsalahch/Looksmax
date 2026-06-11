import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import Product from "@/admin/models/Product";
import StoreApplication from "@/admin/models/StoreApplication";
import { getSession } from "@/admin/lib/auth";
import { createUniqueStoreSlug, slugifyStoreName } from "@/lib/storeSlug";

const VALID_STORE_TYPES = new Set(["thrift", "retail"] as const);
const VALID_CATEGORIES = new Set(["clothes", "fragrances", "accessories"] as const);

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function isValidCategory(value: string): value is "clothes" | "fragrances" | "accessories" {
  return VALID_CATEGORIES.has(value as "clothes" | "fragrances" | "accessories");
}

function normalizeCategories(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return raw
    .map((entry) => String(entry || "").trim())
    .filter((entry): entry is "clothes" | "fragrances" | "accessories" => isValidCategory(entry));
}

async function getProductCounts(storeOwnerId: string) {
  const rows = await Product.aggregate<{ _id: string; count: number }>([
    { $match: { "createdBy.id": storeOwnerId } },
    {
      $group: {
        _id: { $ifNull: ["$approvalStatus", "approved"] },
        count: { $sum: 1 },
      },
    },
  ]);

  const counts = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  for (const row of rows) {
    counts.total += row.count;
    if (row._id === "pending" || row._id === "approved" || row._id === "rejected") {
      counts[row._id] = row.count;
    }
  }

  return counts;
}

async function getLatestStoreApplicationDoc(email: string) {
  return StoreApplication.findOne({ email }).sort({ createdAt: -1 });
}

async function hasDuplicateStoreName(storeName: string, currentUserId: Types.ObjectId, email: string) {
  const storeSlug = slugifyStoreName(storeName);
  if (!storeSlug) return false;

  const [storeOwners, activeApplications] = await Promise.all([
    User.find({
      _id: { $ne: currentUserId },
      role: "store_owner",
      storeApprovalStatus: { $in: ["pending", "approved"] },
    })
      .select("name storeName storeSlug")
      .lean(),
    StoreApplication.find({
      email: { $ne: email },
      status: { $in: ["pending", "approved"] },
    })
      .select("name storeName")
      .lean(),
  ]);

  return [...storeOwners, ...activeApplications].some((store) => {
    const existingSlug = String("storeSlug" in store ? store.storeSlug || "" : "").trim();
    return (existingSlug || slugifyStoreName(String(store.storeName || store.name || ""))) === storeSlug;
  });
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(session.userId).select("-password");
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (user.role !== "store_owner" && user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [storeApplication, productCounts] = await Promise.all([
      user.email ? StoreApplication.findOne({ email: user.email }).sort({ createdAt: -1 }).lean() : null,
      getProductCounts(String(user._id)),
    ]);
    const storeName = storeApplication?.storeName || user.storeName || "";
    const storeType = storeApplication?.storeType || user.storeType || null;
    const categories = normalizeCategories(storeApplication?.categories || storeApplication?.category);
    const storeApprovalStatus = user.storeApprovalStatus || storeApplication?.status || null;

    return NextResponse.json({
      user: {
        id: user._id,
        name: user.name,
        storeName,
        storeType,
        storeApprovalStatus,
        email: user.email,
        role: user.role,
      },
      store: {
        ownerName: storeApplication?.name || user.name || "",
        storeName,
        email: storeApplication?.email || user.email || "",
        storeType: storeType || "retail",
        categories,
        address: storeApplication?.address || "",
        phoneNumber: storeApplication?.phoneNumber || "",
        additionalInformation: storeApplication?.additionalInformation || "",
        category: storeApplication?.category || null,
        status: storeApprovalStatus,
      },
      productCounts,
    });
  } catch (error) {
    console.error("Get admin store details error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const body = await req.json().catch(() => null);
    const name = normalizeText(body?.name);
    const storeName = normalizeText(body?.storeName);
    const storeType = normalizeText(body?.storeType);
    const address = normalizeText(body?.address);
    const phoneNumber = normalizeText(body?.phoneNumber);
    const additionalInformation = normalizeText(body?.additionalInformation);

    if (!name) {
      return NextResponse.json({ error: "Owner name is required" }, { status: 400 });
    }
    if (!storeName) {
      return NextResponse.json({ error: "Store name is required" }, { status: 400 });
    }
    if (!VALID_STORE_TYPES.has(storeType as "thrift" | "retail")) {
      return NextResponse.json({ error: "Select a valid store type" }, { status: 400 });
    }

    const user = await User.findById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (user.role !== "store_owner") {
      return NextResponse.json({ error: "Only store owners can update store details" }, { status: 403 });
    }

    if (await hasDuplicateStoreName(storeName, user._id, user.email)) {
      return NextResponse.json({ error: "A store with this name already exists." }, { status: 409 });
    }

    const storeApplication = await getLatestStoreApplicationDoc(user.email);
    const changed =
      user.name !== name ||
      user.storeName !== storeName ||
      user.storeType !== storeType ||
      (storeApplication?.address || "") !== address ||
      (storeApplication?.phoneNumber || "") !== phoneNumber ||
      (storeApplication?.additionalInformation || "") !== additionalInformation;

    user.name = name;
    user.storeName = storeName;
    user.storeSlug = await createUniqueStoreSlug(User, storeName, user._id);
    user.storeType = storeType as "thrift" | "retail";
    if (changed) {
      user.storeApprovalStatus = "pending";
      user.sessionVersion = (user.sessionVersion || 0) + 1;
    }

    if (storeApplication) {
      storeApplication.name = name;
      storeApplication.storeName = storeName;
      storeApplication.storeType = storeType as "thrift" | "retail";
      storeApplication.address = address;
      storeApplication.phoneNumber = phoneNumber;
      storeApplication.additionalInformation = additionalInformation;
      storeApplication.status = "pending";
      storeApplication.reviewedAt = null;
      await storeApplication.save();
    }

    await user.save();

    const refreshedStoreApplication = storeApplication
      ? await StoreApplication.findOne({ email: user.email }).sort({ createdAt: -1 }).lean()
      : null;
    const categories = normalizeCategories(refreshedStoreApplication?.categories || refreshedStoreApplication?.category);

    return NextResponse.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        storeName: user.storeName || "",
        storeSlug: user.storeSlug || "",
        storeType: user.storeType || null,
        storeApprovalStatus: user.storeApprovalStatus || null,
      },
      store: {
        ownerName: refreshedStoreApplication?.name || user.name || "",
        storeName: refreshedStoreApplication?.storeName || user.storeName || "",
        email: refreshedStoreApplication?.email || user.email || "",
        storeType: refreshedStoreApplication?.storeType || user.storeType || "retail",
        categories,
        address: refreshedStoreApplication?.address || "",
        phoneNumber: refreshedStoreApplication?.phoneNumber || "",
        additionalInformation: refreshedStoreApplication?.additionalInformation || "",
        category: refreshedStoreApplication?.category || null,
        status: user.storeApprovalStatus || refreshedStoreApplication?.status || null,
      },
      storeApprovalChanged: changed,
    });
  } catch (error) {
    console.error("Update admin store details error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
