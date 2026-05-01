import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/admin/lib/mongodb";
import { getSession, hashPassword } from "@/admin/lib/auth";
import User from "@/admin/models/User";
import StoreApplication from "@/admin/models/StoreApplication";
import { sendStoreApplicationStatusEmail } from "@/store/lib/mailer";

type ReviewStatus = "approved" | "rejected";

function isReviewStatus(status: string): status is ReviewStatus {
  return status === "approved" || status === "rejected";
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
    return NextResponse.json({ stores });
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

    return NextResponse.json({ store: store.toObject(), emailWarning });
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

    await StoreApplication.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Store application delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
