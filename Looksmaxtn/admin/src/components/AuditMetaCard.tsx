"use client";

interface AuditActor {
  id: string;
  name: string;
  email: string;
}

interface AuditMetaCardProps {
  createdAt?: string;
  updatedAt?: string;
  createdBy?: AuditActor | null;
  updatedBy?: AuditActor | null;
  title?: string;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatActor(actor?: AuditActor | null) {
  if (!actor) return "—";
  if (actor.name && actor.email) return `${actor.name} · ${actor.email}`;
  return actor.name || actor.email || actor.id || "—";
}

export default function AuditMetaCard({
  createdAt,
  updatedAt,
  createdBy,
  updatedBy,
  title = "Traceability",
}: AuditMetaCardProps) {
  return (
    <div className="bg-bg-card border border-border rounded p-4">
      <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">{title}</p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <dt className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Created At</dt>
          <dd className="text-sm text-text-primary">{formatDate(createdAt)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Created By</dt>
          <dd className="text-sm text-text-primary break-words">{formatActor(createdBy)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Updated At</dt>
          <dd className="text-sm text-text-primary">{formatDate(updatedAt)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Updated By</dt>
          <dd className="text-sm text-text-primary break-words">{formatActor(updatedBy)}</dd>
        </div>
      </dl>
    </div>
  );
}
