import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import StoreRequest from "@/admin/models/StoreRequest";
import StoreAccount from "@/admin/models/StoreAccount";
import { hashPassword } from "@/store-owner/lib/auth";
import { sendStoreCreatedEmail, sendStoreRejectedEmail } from "@/store/lib/mailer";

function getStoreBaseUrl() {
  return (
    process.env.STORE_BASE_URL ||
    "http://localhost:3004"
  ).replace(/\/$/, "");
}

function createTemporaryPassword() {
  return randomBytes(9).toString("base64url");
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const stores = await StoreRequest.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ stores });
  } catch (error) {
    console.error("Admin stores list error:", error);
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
    const { id, action } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Store request ID is required." }, { status: 400 });
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Action must be approve or reject." }, { status: 400 });
    }

    const existing = await StoreRequest.findById(id);
    if (!existing) {
      return NextResponse.json({ error: "Store request not found." }, { status: 404 });
    }

    if (action === "reject") {
      existing.status = "rejected";
      existing.rejectedAt = new Date();
      await existing.save();
      await sendStoreRejectedEmail({
        to: existing.ownerEmail,
        ownerName: existing.ownerName,
        storeName: existing.storeName,
      });
      return NextResponse.json({ store: existing.toObject() });
    }

    const temporaryPassword = createTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    await StoreAccount.findOneAndUpdate(
      { storeRequestId: existing._id },
      {
        storeRequestId: existing._id,
        storeName: existing.storeName,
        ownerName: existing.ownerName,
        ownerEmail: existing.ownerEmail,
        ownerPhone: existing.ownerPhone,
        password: passwordHash,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    existing.status = "approved";
    existing.approvedAt = new Date();
    existing.rejectedAt = null;
    await existing.save();

    await sendStoreCreatedEmail({
      to: existing.ownerEmail,
      ownerName: existing.ownerName,
      storeName: existing.storeName,
      password: temporaryPassword,
      storeLoginUrl: getStoreBaseUrl(),
    });

    return NextResponse.json({ store: existing.toObject() });
  } catch (error) {
    console.error("Admin store approve error:", error);
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
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Store request ID is required." }, { status: 400 });
    }

    await StoreRequest.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin store delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
