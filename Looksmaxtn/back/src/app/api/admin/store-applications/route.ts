import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import type { Types } from "mongoose";
import dbConnect from "@/admin/lib/mongodb";
import { getSession, hashPassword } from "@/admin/lib/auth";
import User from "@/admin/models/User";
import Product from "@/admin/models/Product";
import StoreApplication from "@/admin/models/StoreApplication";
import { sendStoreApplicationStatusEmail } from "@/store/lib/mailer";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";
import { createUniqueStoreSlug, slugifyStoreName } from "@/lib/storeSlug";
import { syncProductsOwnerApproved } from "@/store/lib/ownerApprovalSync";

type ReviewStatus = "approved" | "rejected";
type ProductCounts = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

const emptyProductCounts: ProductCounts = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
};

function isReviewStatus(status: string): status is ReviewStatus {
  return status === "approved" || status === "rejected";
}

function normalizeStoreApplication(store: {
  _id: unknown;
  name?: string | null;
  storeName?: string | null;
  email?: string | null;
  category?: string | null;
  categories?: unknown;
  storeType?: string | null;
  status?: string | null;
  createdAt?: Date | string | null;
  reviewedAt?: Date | string | null;
  address?: string | null;
  phoneNumber?: string | null;
  additionalInformation?: string | null;
}) {
  const categories = Array.isArray(store.categories)
    ? store.categories
        .map((category) => String(category || "").trim())
        .filter((category): category is "clothes" | "fragrances" | "accessories" =>
          ["clothes", "fragrances", "accessories"].includes(category)
        )
    : [];
  const normalizedCategory = categories[0] || (store.category as "clothes" | "fragrances" | "accessories" | undefined) || "clothes";
  const normalizedStoreType = store.storeType === "thrift" ? "thrift" : "retail";

  return {
    ...store,
    _id: String(store._id),
    name: String(store.name || ""),
    storeName: String(store.storeName || ""),
    email: String(store.email || ""),
    category: normalizedCategory,
    categories: categories.length > 0 ? categories : [normalizedCategory],
    storeType: normalizedStoreType,
    status: String(store.status || "pending"),
    createdAt: store.createdAt instanceof Date ? store.createdAt.toISOString() : String(store.createdAt || ""),
    reviewedAt:
      store.reviewedAt instanceof Date ? store.reviewedAt.toISOString() : store.reviewedAt ? String(store.reviewedAt) : null,
  };
}

function createStoreOwnerPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

async function getProductCountsByOwnerIds(ownerIds: string[]) {
  const uniqueOwnerIds = Array.from(new Set(ownerIds.filter(Boolean)));
  if (uniqueOwnerIds.length === 0) return new Map<string, ProductCounts>();

  const rows = await Product.aggregate<{ _id: { ownerId: string; status: string }; count: number }>([
    { $match: { "createdBy.id": { $in: uniqueOwnerIds } } },
    {
      $group: {
        _id: {
          ownerId: "$createdBy.id",
          status: { $ifNull: ["$approvalStatus", "approved"] },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const countsByOwnerId = new Map<string, ProductCounts>();
  for (const ownerId of uniqueOwnerIds) {
    countsByOwnerId.set(ownerId, { ...emptyProductCounts });
  }

  for (const row of rows) {
    const ownerId = row._id.ownerId;
    const status = row._id.status;
    const counts = countsByOwnerId.get(ownerId) || { ...emptyProductCounts };
    counts.total += row.count;
    if (status === "pending" || status === "approved" || status === "rejected") {
      counts[status] = row.count;
    }
    countsByOwnerId.set(ownerId, counts);
  }

  return countsByOwnerId;
}

async function hasDuplicateStoreName(
  storeName: string,
  currentStoreId: Types.ObjectId,
  email: string,
  userId?: Types.ObjectId
) {
  const storeSlug = slugifyStoreName(storeName);
  if (!storeSlug) return false;

  const [storeOwners, activeApplications] = await Promise.all([
    User.find({
      ...(userId ? { _id: { $ne: userId } } : {}),
      role: "store_owner",
      storeApprovalStatus: { $in: ["pending", "approved"] },
    })
      .select("name storeName storeSlug")
      .lean(),
    StoreApplication.find({
      _id: { $ne: currentStoreId },
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
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const stores = await StoreApplication.find().sort({ createdAt: -1 }).lean();

    const emails = stores.map((s) => s.email.toLowerCase());
    const owners = await User.find(
      { email: { $in: emails }, role: "store_owner" },
      { email: 1, balance: 1 }
    ).lean();
    const ownerIdByEmail = new Map(
      owners.map((u) => [u.email, u._id.toString()])
    );
    const ownerBalanceByEmail = new Map(
      owners.map((u) => [u.email, Number(u.balance || 0)])
    );
    const productCountsByOwnerId = await getProductCountsByOwnerIds(
      owners.map((owner) => owner._id.toString())
    );

    const normalizedStores = stores.map((store) => ({
      ...normalizeStoreApplication(store),
      storeOwnerId: ownerIdByEmail.get(store.email) || "",
      balance: ownerBalanceByEmail.has(store.email) ? ownerBalanceByEmail.get(store.email) ?? 0 : null,
      productCounts: productCountsByOwnerId.get(ownerIdByEmail.get(store.email) || "") || emptyProductCounts,
    }));

    return NextResponse.json({ stores: normalizedStores });
  } catch (error) {
    console.error("Store applications list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id, status } = await req.json();
    const nextStatus = String(status || "");

    if (!id || !isReviewStatus(nextStatus)) {
      return NextResponse.json({ error: "A valid store and decision are required" }, { status: 400 });
    }

    const store = await StoreApplication.findById(id);
    if (!store) {
      return NextResponse.json({ error: "Store request not found" }, { status: 404 });
    }

    let emailWarning = "";
    let generatedPassword = "";
    if (nextStatus === "approved") {
      generatedPassword = createStoreOwnerPassword();
      const storeName = store.storeName || store.name;
      const existingUser = await User.findOne({ email: store.email });

      if (existingUser?.role === "admin") {
        return NextResponse.json(
          { error: "This email already belongs to an admin account." },
          { status: 409 }
        );
      }

      if (await hasDuplicateStoreName(storeName, store._id, store.email, existingUser?._id)) {
        return NextResponse.json({ error: "A store with this name already exists." }, { status: 409 });
      }

      const passwordHash = await hashPassword(generatedPassword);
      if (existingUser) {
        existingUser.name = store.name;
        existingUser.storeName = storeName;
        existingUser.storeSlug = await createUniqueStoreSlug(User, storeName, existingUser._id);
        existingUser.storeType = store.storeType;
        existingUser.storeApprovalStatus = "approved";
        existingUser.password = passwordHash;
        existingUser.role = "store_owner";
        existingUser.emailVerified = true;
        existingUser.isBlocked = false;
        existingUser.sessionVersion = (existingUser.sessionVersion || 0) + 1;
        await existingUser.save();
      } else {
        const storeSlug = await createUniqueStoreSlug(User, storeName);
        await User.create({
          name: store.name,
          storeName,
          storeSlug,
          storeType: store.storeType,
          storeApprovalStatus: "approved",
          email: store.email,
          password: passwordHash,
          role: "store_owner",
          emailVerified: true,
          isBlocked: false,
        });
      }
    }

    store.status = nextStatus;
    store.reviewedAt = new Date();
    await store.save();

    try {
      await sendStoreApplicationStatusEmail({
        to: store.email,
        name: store.name,
        email: store.email,
        status: nextStatus,
        password: generatedPassword,
        adminUrl: (process.env.ADMIN_BASE_URL || "http://localhost:3001/").replace(/\/?$/, "/"),
      });
    } catch (emailError) {
      emailWarning = "The decision was saved, but the email could not be sent.";
      console.error("Store application status email error:", emailError);
    }

    const owner = await User.findOne({ email: store.email, role: "store_owner" }, { balance: 1 }).lean();
    const ownerId = owner?._id.toString() || "";
    if (ownerId && nextStatus === "approved") {
      await syncProductsOwnerApproved(ownerId, true);
    }
    const productCountsByOwnerId = await getProductCountsByOwnerIds(ownerId ? [ownerId] : []);
    const normalizedStore = {
      ...normalizeStoreApplication(store.toObject()),
      storeOwnerId: ownerId,
      balance: owner ? Number(owner.balance || 0) : null,
      productCounts: productCountsByOwnerId.get(ownerId) || emptyProductCounts,
    };
    broadcastAdminEvent({
      type: "store:upsert",
      store: {
        _id: normalizedStore._id,
        name: normalizedStore.name,
        storeName: normalizedStore.storeName,
        email: normalizedStore.email,
        category: normalizedStore.category,
        categories: normalizedStore.categories,
        storeType: normalizedStore.storeType,
        status: normalizedStore.status,
        createdAt: normalizedStore.createdAt,
      },
    });

    return NextResponse.json({ store: normalizedStore, emailWarning });
  } catch (error) {
    console.error("Store application update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Store id is required" }, { status: 400 });
    }

    const store = await StoreApplication.findById(id);
    if (!store) {
      return NextResponse.json({ error: "Store request not found" }, { status: 404 });
    }

    const existingUser = await User.findOne({ email: store.email });
    if (existingUser?.role === "store_owner") {
      existingUser.role = "user";
      existingUser.storeApprovalStatus = "rejected";
      existingUser.storeName = "";
      existingUser.storeSlug = "";
      existingUser.storeType = null;
      existingUser.sessionVersion = (existingUser.sessionVersion || 0) + 1;
      await existingUser.save();
      await syncProductsOwnerApproved(existingUser._id.toString(), false);
    }

    await StoreApplication.findByIdAndDelete(id);
    broadcastAdminEvent({ type: "store:delete", storeId: String(id) });
    return NextResponse.json({
      success: true,
      message: "Store deleted. Its products are now hidden from the storefront.",
    });
  } catch (error) {
    console.error("Store application delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
