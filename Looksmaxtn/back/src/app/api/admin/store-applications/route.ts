import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/admin/lib/mongodb";
import { getSession, hashPassword } from "@/admin/lib/auth";
import User from "@/admin/models/User";
import StoreApplication from "@/admin/models/StoreApplication";
import { sendStoreApplicationStatusEmail } from "@/store/lib/mailer";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";

type ReviewStatus = "approved" | "rejected";

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

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const stores = await StoreApplication.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ stores: stores.map(normalizeStoreApplication) });
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

      const passwordHash = await hashPassword(generatedPassword);
      if (existingUser) {
        existingUser.name = store.name;
        existingUser.storeName = storeName;
        existingUser.storeType = store.storeType;
        existingUser.storeApprovalStatus = "approved";
        existingUser.password = passwordHash;
        existingUser.role = "store_owner";
        existingUser.emailVerified = true;
        existingUser.isBlocked = false;
        existingUser.sessionVersion = (existingUser.sessionVersion || 0) + 1;
        await existingUser.save();
      } else {
        await User.create({
          name: store.name,
          storeName,
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
        status: nextStatus,
        password: generatedPassword,
        adminUrl: (process.env.ADMIN_BASE_URL || "http://localhost:3001/").replace(/\/?$/, "/"),
      });
    } catch (emailError) {
      emailWarning = "The decision was saved, but the email could not be sent.";
      console.error("Store application status email error:", emailError);
    }

    const normalizedStore = normalizeStoreApplication(store.toObject());
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
      existingUser.storeType = null;
      existingUser.sessionVersion = (existingUser.sessionVersion || 0) + 1;
      await existingUser.save();
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
