import { NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import ShippingSettings from "@/store/models/ShippingSettings";

const DEFAULT_SHIPPING_SETTINGS = {
  key: "shipping",
  shippingCost: 0,
  freeShippingThreshold: 0,
};

export async function GET() {
  try {
    await dbConnect();
    const settings = await ShippingSettings.findOne({ key: "shipping" }).lean();
    return NextResponse.json({ settings: settings || DEFAULT_SHIPPING_SETTINGS });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ settings: DEFAULT_SHIPPING_SETTINGS });
  }
}
