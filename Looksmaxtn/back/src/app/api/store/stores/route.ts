import { NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Store from "@/store/models/Store";

export async function GET() {
  try {
    await dbConnect();
    const stores = await Store.find({ status: "approved" })
      .select("name slug logo category isMainStore")
      .sort({ isMainStore: -1, name: 1 })
      .lean();

    return NextResponse.json({ stores });
  } catch (error) {
    console.error("Get stores error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
