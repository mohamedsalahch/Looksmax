import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import StoreApplication from "@/admin/models/StoreApplication";
import { getSession } from "@/admin/lib/auth";

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

async function getLatestStoreApplicationDoc(email: string) {
  return StoreApplication.findOne({ email }).sort({ createdAt: -1 });
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

    const storeApplication = user.email
      ? await StoreApplication.findOne({ email: user.email }).sort({ createdAt: -1 }).lean()
      : null;
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
