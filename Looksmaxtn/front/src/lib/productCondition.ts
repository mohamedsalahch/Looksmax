export function getConditionPercent(score: number) {
  const safeScore = Number.isFinite(score) ? score : 0;
  return Math.max(0, Math.min(100, (safeScore / 10) * 100));
}

export function getConditionLabel(score: number, status?: string) {
  if (score >= 10) return "new";
  if (status) return status;
  if (score >= 7) return "like new";
  if (score >= 5) return "good";
  return "used";
}

export function getConditionColor(score: number) {
  if (score >= 10) return "#57534e";
  if (score >= 7) return "#66714f";
  if (score >= 5) return "#8a6a3f";
  return "#6b665e";
}
