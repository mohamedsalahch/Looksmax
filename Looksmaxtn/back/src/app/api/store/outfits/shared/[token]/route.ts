import { NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import SavedOutfit from "@/store/models/SavedOutfit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    await dbConnect();
    const outfit = await SavedOutfit.findOne({ shareToken: token, isPublic: true }).lean();
    if (!outfit) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ outfit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}