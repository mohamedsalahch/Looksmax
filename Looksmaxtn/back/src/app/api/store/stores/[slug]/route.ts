import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { isStoreOwnerApproved } from "@/store/lib/storeApproval";
import { slugifyStoreName } from "@/lib/storeSlug";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const normalizedSlug = slugifyStoreName(decodeURIComponent(slug || ""));
    if (!normalizedSlug) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    await dbConnect();
    const owners = await User.find({ role: "store_owner" })
      .select("_id name storeName storeSlug storeType storeApprovalStatus role")
      .lean();
    const owner = owners.find((candidate) => {
      if (!isStoreOwnerApproved(candidate)) return false;
      const candidateSlug = String(candidate.storeSlug || "").trim();
      return (candidateSlug || slugifyStoreName(String(candidate.storeName || candidate.name || ""))) === normalizedSlug;
    });

    if (!owner) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const storeName = String(owner.storeName || owner.name || "");
    return NextResponse.json({
      store: {
        id: owner._id.toString(),
        name: storeName,
        slug: owner.storeSlug || slugifyStoreName(storeName),
        type: owner.storeType || null,
      },
    });
  } catch (error) {
    console.error("Get store by slug error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
