import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import StoreApplication, { StoreApplicationCategory } from "@/store/models/StoreApplication";
import User from "@/store/models/User";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";

const VALID_CATEGORIES = new Set<StoreApplicationCategory>([
  "clothes",
  "fragrances",
  "accessories",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
}) {
  const categories = Array.isArray(store.categories)
    ? store.categories
        .map((category) => String(category || "").trim())
        .filter((category): category is StoreApplicationCategory =>
          VALID_CATEGORIES.has(category as StoreApplicationCategory)
        )
    : [];
  const normalizedCategory = categories[0] || (store.category as StoreApplicationCategory | undefined) || "clothes";
  const normalizedStoreType = store.storeType === "thrift" ? "thrift" : "retail";

  return {
    _id: String(store._id),
    name: String(store.name || ""),
    storeName: String(store.storeName || ""),
    email: String(store.email || ""),
    category: normalizedCategory,
    categories: categories.length > 0 ? categories : [normalizedCategory],
    storeType: normalizedStoreType,
    status: String(store.status || "pending"),
    createdAt: store.createdAt instanceof Date ? store.createdAt.toISOString() : String(store.createdAt || ""),
  };
}

function normalizeCategories(value: unknown): StoreApplicationCategory[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return raw
    .map((entry) => String(entry || "").trim() as StoreApplicationCategory)
    .filter((entry): entry is StoreApplicationCategory => VALID_CATEGORIES.has(entry));
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const name = String(body?.name || "").trim();
    const storeName = String(body?.storeName || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const categories = normalizeCategories(body?.categories || body?.category);
    const address = String(body?.address || "").trim();
    const phoneNumber = String(body?.phoneNumber || "").trim();
    const additionalInformation = String(body?.additionalInformation || "").trim();

    if (!name || !storeName || !email || categories.length === 0 || !address || !phoneNumber) {
      return NextResponse.json({ error: "All required fields must be completed" }, { status: 400 });
    }

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }

    if (categories.some((category) => !VALID_CATEGORIES.has(category))) {
      return NextResponse.json({ error: "Select a valid category" }, { status: 400 });
    }

    const existingStoreApplication = await StoreApplication.findOne({
      email,
      status: { $in: ["pending", "approved", "rejected"] },
    })
      .select("status")
      .lean();

    if (existingStoreApplication) {
      const status = String(existingStoreApplication.status || "pending");
      const label =
        status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending";

      return NextResponse.json(
        { error: `A store request already exists for this email and is ${label}.` },
        { status: 409 }
      );
    }

    const existingStoreOwner = await User.findOne({
      email,
      role: "store_owner",
      storeApprovalStatus: { $in: ["pending", "approved", "rejected"] },
    })
      .select("storeApprovalStatus")
      .lean();

    if (existingStoreOwner) {
      const status = String(existingStoreOwner.storeApprovalStatus || "pending");
      const label =
        status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending";

      return NextResponse.json(
        { error: `This email already belongs to a store account with ${label} status.` },
        { status: 409 }
      );
    }

    const store = await StoreApplication.create({
      name,
      storeName,
      email,
      category: categories[0],
      categories,
      storeType: "retail",
      address,
      phoneNumber,
      additionalInformation,
    });

    broadcastAdminEvent({
      type: "store:upsert",
      store: normalizeStoreApplication(store.toObject()),
    });

    return NextResponse.json(
      { message: "Store request submitted successfully. We will contact you by email." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Store application submit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
