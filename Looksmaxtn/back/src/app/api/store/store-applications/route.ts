import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import StoreApplication, { StoreApplicationCategory } from "@/store/models/StoreApplication";

const VALID_CATEGORIES = new Set<StoreApplicationCategory>([
  "clothes",
  "fragrances",
  "accessories",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const name = String(body?.name || "").trim();
    const storeName = String(body?.storeName || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const category = String(body?.category || "").trim() as StoreApplicationCategory;
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

    await StoreApplication.create({
      name,
      storeName,
      email,
      category,
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
