import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/store/lib/auth";
import dbConnect from "@/store/lib/mongodb";
import SavedOutfit from "@/store/models/SavedOutfit";
import User from "@/store/models/User";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await dbConnect();
    const outfit = await SavedOutfit.findById(id).lean();

    if (!outfit) return NextResponse.json({ error: "Outfit not found" }, { status: 404 });
    if (outfit.user?.toString() !== session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({
      outfit: {
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
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      images?: { front?: string; back?: string };
      outfitSnapshot?: Record<string, unknown>;
    };

    await dbConnect();
    const userObjectId = new mongoose.Types.ObjectId(session.userId);
    const existingUser = await User.collection.findOne(
      { _id: userObjectId },
      { projection: { bodyProfile: 1 } }
    );
    const enhancedProfileImage = existingUser?.bodyProfile?.profileImageEnhanced || "";
    if (!enhancedProfileImage) {
      return NextResponse.json(
        { error: "An enhanced profile picture is required to save an outfit." },
        { status: 400 }
      );
    }

    const outfit = await SavedOutfit.findById(id);
    if (!outfit) return NextResponse.json({ error: "Outfit not found" }, { status: 404 });
    if (outfit.user?.toString() !== session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const nextName =
      typeof body.name === "string" ? body.name.trim() || outfit.name : outfit.name;
    const nextImages = body.images
      ? {
          front: String(body.images.front || outfit.images?.front || ""),
          back: String(body.images.back || outfit.images?.back || ""),
        }
      : {
          front: String(outfit.images?.front || ""),
          back: String(outfit.images?.back || ""),
        };
    const nextSnapshot = body.outfitSnapshot ?? outfit.outfitSnapshot ?? {};

    const updatedOutfit = await SavedOutfit.findByIdAndUpdate(
      id,
      {
        $set: {
          name: nextName,
          images: nextImages,
          outfitSnapshot: nextSnapshot,
        },
      },
      { new: true }
    ).lean();

    if (!updatedOutfit) {
      return NextResponse.json({ error: "Outfit not found" }, { status: 404 });
    }

    return NextResponse.json({
      outfit: {
        id: updatedOutfit._id.toString(),
        name: updatedOutfit.name,
        images: {
          front: updatedOutfit.images?.front || "",
          back: updatedOutfit.images?.back || "",
        },
        outfitSnapshot: updatedOutfit.outfitSnapshot || {},
        isPublic: Boolean(updatedOutfit.isPublic),
        shareToken: updatedOutfit.shareToken || "",
        createdAt: updatedOutfit.createdAt,
        updatedAt: updatedOutfit.updatedAt,
      },
    });
  } catch (error) {
    console.error("[outfits] update error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
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

    await SavedOutfit.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
