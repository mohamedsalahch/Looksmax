import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import { getSession } from "@/store/lib/auth";
import OutfitGenerationJob from "@/store/models/OutfitGenerationJob";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { jobId } = await params;
    await dbConnect();

    const job = await OutfitGenerationJob.findById(jobId).lean();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.user?.toString() !== session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
