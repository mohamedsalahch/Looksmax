import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import OutfitGenerationJob from "@/store/models/OutfitGenerationJob";

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const recentWindowMs = 30 * 60 * 1000;
    const recentSince = new Date(Date.now() - recentWindowMs);
    const userObjectId = new mongoose.Types.ObjectId(session.userId);

    const job = await OutfitGenerationJob.collection.findOne(
      {
        user: userObjectId,
        createdAt: { $gte: recentSince },
        status: { $in: ["pending", "processing", "completed"] },
      },
      {
        sort: { createdAt: -1 },
        projection: {
          _id: 1,
          status: 1,
          images: 1,
          errorMessage: 1,
        },
      }
    );

    if (!job) {
      return NextResponse.json({ job: null });
    }

    return NextResponse.json({
      job: {
        id: job._id.toString(),
        status: job.status,
        images: {
          front: job.images?.front || "",
          back: job.images?.back || "",
        },
        errorMessage: job.errorMessage || "",
      },
    });
  } catch (error) {
    console.error("[generate-outfit/latest] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
