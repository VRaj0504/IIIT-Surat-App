export const POINTS: Record<string, number> = { AA: 10, AB: 9, BB: 8, BC: 7, CC: 6, CD: 5, DD: 4, FF: 0 };
export const PICKABLE = ["AA", "AB", "BB", "BC", "CC", "CD", "DD", "FF"] as const;

export type Past = { points: number; credits: number };
export type Planned = { credits: number; grade: string };

const round2 = (x: number) => Math.round(x * 100) / 100;

export function pastTotals(results: { credits: number; grade: string }[]): Past {
  let points = 0;
  let credits = 0;
  for (const r of results) {
    if (!(r.grade in POINTS) || r.grade === "FF") continue;
    points += r.credits * POINTS[r.grade];
    credits += r.credits;
  }
  return { points, credits };
}

export function whatIf(past: Past, planned: Planned[]) {
  const graded = planned.filter((p) => p.grade in POINTS && p.credits > 0);
  const semCredits = graded.reduce((s, p) => s + p.credits, 0);
  const semPoints = graded.reduce((s, p) => s + p.credits * POINTS[p.grade], 0);
  const sgpa = semCredits ? round2(semPoints / semCredits) : null;
  const passed = graded.filter((p) => p.grade !== "FF");
  const addCredits = passed.reduce((s, p) => s + p.credits, 0);
  const addPoints = passed.reduce((s, p) => s + p.credits * POINTS[p.grade], 0);
  const total = past.credits + addCredits;
  const cgpa = total ? round2((past.points + addPoints) / total) : null;
  return { sgpa, cgpa };
}

export function gradeForPoints(gp: number): string {
  const order = PICKABLE.filter((g) => g !== "FF");
  let pick: string = order[order.length - 1];
  for (const g of order) if (POINTS[g] >= gp - 1e-9) pick = g;
  return pick;
}

export function needed(past: Past, target: number, semCredits: number, semestersLeft: number) {
  if (semCredits <= 0) return { thisSem: null as number | null, perSemLater: null as number | null, already: false };
  const thisSem = (target * (past.credits + semCredits) - past.points) / semCredits;
  const later = Math.max(1, semestersLeft);
  const perSemLater = (target * (past.credits + semCredits * later) - past.points) / (semCredits * later);
  return {
    thisSem: round2(thisSem),
    perSemLater: round2(perSemLater),
    already: thisSem <= POINTS.DD,
  };
}
