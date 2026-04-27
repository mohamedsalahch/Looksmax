import { NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Store from "@/store/models/Store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await dbConnect();
    const { slug } = await params;
    const store = await Store.findOne({ slug, status: "approved" })
      .select("name slug logo category isMainStore")
      .lean();

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    return NextResponse.json({ store });
  } catch (error) {
    console.error("Get store error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
