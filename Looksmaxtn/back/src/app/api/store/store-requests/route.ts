import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import StoreRequest from "@/store/models/StoreRequest";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const ownerName = cleanString(body.ownerName);
    const ownerEmail = cleanString(body.ownerEmail).toLowerCase();
    const ownerPhone = cleanString(body.ownerPhone);
    const storeName = cleanString(body.storeName);
    const storeCategory = cleanString(body.storeCategory);
    const storeLocation = cleanString(body.storeLocation);
    const socialLink = cleanString(body.socialLink);
    const message = cleanString(body.message);

    if (!ownerName || !ownerEmail || !ownerPhone || !storeName || !storeCategory || !storeLocation) {
      return NextResponse.json({ error: "All required fields must be completed." }, { status: 400 });
    }

    const storeRequest = await StoreRequest.create({
      ownerName,
      ownerEmail,
      ownerPhone,
      storeName,
      storeCategory,
      storeLocation,
      socialLink,
      message,
    });

    return NextResponse.json(
      {
        message: "Store request submitted successfully.",
        store: storeRequest,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Store request submit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
