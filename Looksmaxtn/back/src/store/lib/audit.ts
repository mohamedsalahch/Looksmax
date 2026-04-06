import { Schema } from "mongoose";
import User from "@/store/models/User";

export interface IAuditActor {
  id: string;
  name: string;
  email: string;
}

export const auditActorSchema = new Schema<IAuditActor>(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
  },
  { _id: false }
);

export async function getAuditActor(userId: string): Promise<IAuditActor | null> {
  const user = await User.findById(userId).select("name email").lean();
  if (!user) return null;

  return {
    id: user._id.toString(),
    name: user.name || "Unknown User",
    email: user.email || "",
  };
}
