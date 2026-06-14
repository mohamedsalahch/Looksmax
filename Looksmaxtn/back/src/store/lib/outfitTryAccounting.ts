import mongoose from "mongoose";
import OutfitGenerationJob from "@/store/models/OutfitGenerationJob";
import User from "@/store/models/User";

export async function refundOutfitTryForUser(userId: string | mongoose.Types.ObjectId) {
  await User.updateOne(
    {
      _id: userId,
      "outfitStudioStats.triesUsed": { $gt: 0 },
    },
    { $inc: { "outfitStudioStats.triesUsed": -1 } }
  );
}

export async function refundOutfitTryForJob(jobId: string | mongoose.Types.ObjectId) {
  const job = await OutfitGenerationJob.findOneAndUpdate(
    {
      _id: jobId,
      tryCharged: true,
      tryRefundedAt: null,
    },
    { $set: { tryRefundedAt: new Date() } },
    { new: true }
  )
    .select("user")
    .lean();

  if (!job?.user) return false;
  await refundOutfitTryForUser(String(job.user));
  return true;
}
