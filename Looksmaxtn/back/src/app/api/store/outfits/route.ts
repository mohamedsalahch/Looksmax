import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/store/lib/auth";
import dbConnect from "@/store/lib/mongodb";
import SavedOutfit from "@/store/models/SavedOutfit";

function withNoStoreHeaders(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return withNoStoreHeaders({ error: "Unauthorized" }, 401);

    await dbConnect();
    const outfits = await SavedOutfit.find()
      .where("user")
      .equals(session.userId)
      .sort({ updatedAt: -1 })
      .lean();

    return withNoStoreHeaders({
      outfits: outfits.map((outfit) => ({
        id: outfit._id.toString(),
        name: outfit.name,
        images: {
          front: outfit.images?.front || "",
          back: outfit.images?.back || "",
        },
        outfitSnapshot: outfit.outfitSnapshot || {},
        isPublic: Boolean(outfit.isPublic),
        shareToken: outfit.shareToken || "",
        createdAt: outfit.createdAt,
        updatedAt: outfit.updatedAt,
      })),
    });
  } catch (error) {
    console.error(error);
    return withNoStoreHeaders({ error: "Internal server error" }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      name?: string;
      images?: { front?: string; back?: string };
      outfitSnapshot?: Record<string, unknown>;
    };

    const front = String(body.images?.front || "");
    const back = String(body.images?.back || "");
    if (!front && !back) {
      return NextResponse.json({ error: "Missing outfit images." }, { status: 400 });
    }

    await dbConnect();
    const outfit = new SavedOutfit({
      user: session.userId,
      name: String(body.name || "First Outfit").trim() || "First Outfit",
      images: { front, back },
      outfitSnapshot: body.outfitSnapshot || undefined,
      shareToken: randomUUID(),
      isPublic: false,
    });
    await outfit.save();

    return NextResponse.json({
      outfit: {
        id: outfit._id.toString(),
        name: outfit.name,
        images: outfit.images,
        outfitSnapshot: outfit.outfitSnapshot || {},
        isPublic: outfit.isPublic,
        shareToken: outfit.shareToken,
        createdAt: outfit.createdAt,
        updatedAt: outfit.updatedAt,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
