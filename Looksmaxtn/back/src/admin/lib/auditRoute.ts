import { type JWTPayload } from "@/admin/lib/auth";
import { getAuditActor, getSystemAuditActor } from "@/admin/lib/audit";

export async function getAuditActorFromSession(session: JWTPayload | null) {
  if (!session?.userId) return getSystemAuditActor();
  return (await getAuditActor(session.userId)) || getSystemAuditActor();
}
