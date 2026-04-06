export function getConditionStatusFromScore(score: number) {
  if (score >= 10) return "new";
  if (score >= 7) return "like new";
  if (score >= 5) return "good";
  return "used";
}
