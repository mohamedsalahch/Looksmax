import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/store/lib/auth";
import dbConnect from "@/store/lib/mongodb";
import SavedOutfit from "@/store/models/SavedOutfit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await dbConnect();
    const outfit = await SavedOutfit.findById(id);
    if (!outfit) return NextResponse.json({ error: "Outfit not found" }, { status: 404 });
    if (outfit.user?.toString() !== session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    outfit.isPublic = true;
    if (!outfit.shareToken) outfit.shareToken = randomUUID();
    await outfit.save();

    return NextResponse.json({
      shareUrl: `${req.nextUrl.origin}/outfits/shared/${outfit.shareToken}`,
      shareToken: outfit.shareToken,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
