import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import User from "@/store/models/User";
import { calculateUserOutfitStudioTries, normalizeInitialOutfitStudioTries } from "@/store/lib/outfitStudioUtils";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const userId = new mongoose.Types.ObjectId(session.userId);
    const user = await User.findById(userId).select("role outfitStudioStats").lean();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Admins have unlimited tries
    if (user.role === "admin") {
      return NextResponse.json({
        isAdmin: true,
        totalTries: -1, // -1 indicates unlimited
        triesUsed: 0,
        triesRemaining: -1,
        bonusTriesFromSpending: 0,
      });
    }

    const initialTries = normalizeInitialOutfitStudioTries(user.outfitStudioStats?.initialTries);
    const triesUsed = user.outfitStudioStats?.triesUsed || 0;
    const { total: totalTries, bonusFromSpending } = await calculateUserOutfitStudioTries(userId, initialTries);

    return NextResponse.json({
      isAdmin: false,
      totalTries,
      triesUsed,
      triesRemaining: Math.max(0, totalTries - triesUsed),
      bonusTriesFromSpending: bonusFromSpending,
    });
  } catch (error) {
    console.error("[outfit-studio] GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
