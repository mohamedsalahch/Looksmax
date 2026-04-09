import { type JWTPayload } from "@/store/lib/auth";
import { getAuditActor } from "@/store/lib/audit";

export async function getAuditActorFromSession(session: JWTPayload | null) {
  if (!session?.userId) return null;
  return getAuditActor(session.userId);
}
