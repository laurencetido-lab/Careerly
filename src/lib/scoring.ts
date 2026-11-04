/**
 * Personalised ranking. Scores are computed only from data that exists; missing data lowers
 * "completeness" (the ranking is then provisional) instead of being guessed. Hard constraints
 * exclude a row regardless of its score; a constraint on missing data is flagged as unverified.
 */
export interface Criterion {
  fieldId: string;
  label: string;
  weight: number; // percentage points, sum = 100
  direction: "HIGHER" | "LOWER" | "TRUE";
  constraintType: "NONE" | "MIN" | "MAX" | "EQUALS";
  constraintValue?: string | null;
}

export interface ScoreRowInput {
  id: string;
  label: string;
  values: Record<string, { num: number | null; display: string }>;
}

export interface ScoreResult {
  id: string;
  label: string;
  score: number | null;
  completeness: number;
  provisional: boolean;
  excluded: boolean;
  reasons: string[];
  breakdown: { fieldId: string; label: string; contribution: number | null; normalized: number | null }[];
  rank: number | null;
}

function violates(c: Criterion, v: { num: number | null; display: string } | undefined): boolean | null {
  if (c.constraintType === "NONE") return false;
  if (!v || (v.num == null && !v.display)) return null;
  const target = c.constraintValue ?? "";
  if (c.constraintType === "EQUALS") return v.display.toLowerCase() !== target.toLowerCase() && String(v.num) !== target;
  const t = Number(target);
  if (v.num == null || Number.isNaN(t)) return null;
  return c.constraintType === "MIN" ? v.num < t : v.num > t;
}

export function scoreRows(rows: ScoreRowInput[], criteria: Criterion[]): ScoreResult[] {
  const total = criteria.reduce((a, c) => a + c.weight, 0) || 1;
  const ranges = new Map<string, { min: number; max: number }>();
  for (const c of criteria) {
    const nums = rows.map((r) => r.values[c.fieldId]?.num).filter((n): n is number => n != null);
    if (nums.length) ranges.set(c.fieldId, { min: Math.min(...nums), max: Math.max(...nums) });
  }
  const results: ScoreResult[] = rows.map((r) => {
    const reasons: string[] = [];
    let excluded = false;
    let unverified = false;
    let weighted = 0;
    let available = 0;
    const breakdown: ScoreResult["breakdown"] = [];
    for (const c of criteria) {
      const v = r.values[c.fieldId];
      const vio = violates(c, v);
      if (vio === true) {
        excluded = true;
        reasons.push(`Fails hard constraint: ${c.label} ${c.constraintType === "MIN" ? "≥" : c.constraintType === "MAX" ? "≤" : "="} ${c.constraintValue}`);
      } else if (vio === null) {
        unverified = true;
        reasons.push(`Constraint on ${c.label} not verifiable: value missing`);
      }
      if (c.weight === 0) continue;
      const range = ranges.get(c.fieldId);
      let n: number | null = null;
      if (v?.num != null && range) {
        if (c.direction === "TRUE") n = v.num > 0 ? 1 : 0;
        else {
          const base = range.max === range.min ? 1 : (v.num - range.min) / (range.max - range.min);
          n = c.direction === "LOWER" ? 1 - base : base;
        }
      }
      if (n == null) {
        breakdown.push({ fieldId: c.fieldId, label: c.label, contribution: null, normalized: null });
        continue;
      }
      available += c.weight;
      weighted += n * c.weight;
      breakdown.push({ fieldId: c.fieldId, label: c.label, contribution: (n * c.weight) / total * 100, normalized: n });
    }
    const completeness = available / total;
    const score = available > 0 ? (weighted / available) * 100 : null;
    if (completeness < 1) reasons.push(`Based on ${Math.round(completeness * 100)}% of your criteria (missing data is not guessed)`);
    return { id: r.id, label: r.label, score, completeness, provisional: completeness < 1 || unverified, excluded, reasons, breakdown, rank: null };
  });
  const ranked = results
    .filter((r) => !r.excluded && r.score != null)
    .sort((a, b) => b.score! - a.score! || b.completeness - a.completeness);
  ranked.forEach((r, i) => (r.rank = i + 1));
  return [...ranked, ...results.filter((r) => r.excluded || r.score == null)];
}

/** How much each row's rank moves when one criterion gets +10 weight points (renormalised). */
export function sensitivity(rows: ScoreRowInput[], criteria: Criterion[]) {
  const base = new Map(scoreRows(rows, criteria).map((r) => [r.id, r.rank]));
  const shifts = new Map<string, number>();
  for (const c of criteria) {
    const bumped = criteria.map((x) => ({ ...x, weight: x.fieldId === c.fieldId ? x.weight + 10 : x.weight }));
    for (const r of scoreRows(rows, bumped)) {
      const b = base.get(r.id);
      if (b == null || r.rank == null) continue;
      shifts.set(r.id, Math.max(shifts.get(r.id) ?? 0, Math.abs(b - r.rank)));
    }
  }
  return shifts;
}
