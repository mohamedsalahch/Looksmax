import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import StoreApplication, { StoreApplicationCategory, StoreType } from "@/store/models/StoreApplication";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";

const VALID_CATEGORIES = new Set<StoreApplicationCategory>([
  "clothes",
  "fragrances",
  "accessories",
]);

const VALID_STORE_TYPES = new Set<StoreType>(["thrift", "retail"]);

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
  const normalizedStoreType = VALID_STORE_TYPES.has(store.storeType as StoreType)
    ? (store.storeType as StoreType)
    : "retail";

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
    const storeType = String(body?.storeType || "").trim() as StoreType;
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

    if (!VALID_STORE_TYPES.has(storeType)) {
      return NextResponse.json({ error: "Select whether this is a thrift or retail store" }, { status: 400 });
    }

    const store = await StoreApplication.create({
      name,
      storeName,
      email,
      category: categories[0],
      categories,
      storeType,
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
