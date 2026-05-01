import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import StoreApplication, { StoreApplicationCategory, StoreType } from "@/store/models/StoreApplication";

const VALID_CATEGORIES = new Set<StoreApplicationCategory>([
  "clothes",
  "fragrances",
  "accessories",
]);

const VALID_STORE_TYPES = new Set<StoreType>(["thrift", "retail"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const name = String(body?.name || "").trim();
    const storeName = String(body?.storeName || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const category = String(body?.category || "").trim() as StoreApplicationCategory;
    const storeType = String(body?.storeType || "").trim() as StoreType;
    const address = String(body?.address || "").trim();
    const phoneNumber = String(body?.phoneNumber || "").trim();
    const additionalInformation = String(body?.additionalInformation || "").trim();

    if (!name || !storeName || !email || !category || !address || !phoneNumber) {
      return NextResponse.json({ error: "All required fields must be completed" }, { status: 400 });
    }

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }

    if (!VALID_CATEGORIES.has(category)) {
      return NextResponse.json({ error: "Select a valid category" }, { status: 400 });
    }

    if (!VALID_STORE_TYPES.has(storeType)) {
      return NextResponse.json({ error: "Select whether this is a thrift or retail store" }, { status: 400 });
    }

    await StoreApplication.create({
      name,
      storeName,
      email,
      category,
      storeType,
      address,
      phoneNumber,
      additionalInformation,
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
