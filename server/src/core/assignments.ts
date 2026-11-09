// D1, D25: a logger is a sensor that can move between fridges. Its history is a list of periods.
// The history is rebuilt from "change points" (logger seen in fridge F from time T), which makes it
// independent of import order and idempotent.
import type { LocalTs } from './time.ts';

export interface Assignment {
  loggerId: string;
  fridgeId: number;
  validFrom: LocalTs;
  validTo: LocalTs | null;
}

export interface ChangePoint {
  from: LocalTs;
  fridgeId: number;
}

/** Which fridge the logger was in at `ts` (validFrom inclusive, validTo exclusive). */
export function fridgeAt(assignments: Assignment[], loggerId: string, ts: LocalTs): number | null {
  const a = assignments.find((x) => x.loggerId === loggerId && x.validFrom <= ts && (x.validTo === null || ts < x.validTo));
  return a ? a.fridgeId : null;
}

/** Change points from rows that say which fridge each reading came from (Summer's sheet). */
export function changePointsFromRows(rows: { loggerId: string; ts: LocalTs; fridgeId: number }[]): Map<string, ChangePoint[]> {
  const byLogger = new Map<string, { ts: LocalTs; fridgeId: number }[]>();
  for (const r of rows) {
    const list = byLogger.get(r.loggerId) ?? [];
    list.push(r);
    byLogger.set(r.loggerId, list);
  }
  const out = new Map<string, ChangePoint[]>();
  for (const [logger, list] of byLogger) {
    list.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    const points: ChangePoint[] = [];
    for (const r of list) if (points.length === 0 || points[points.length - 1].fridgeId !== r.fridgeId) points.push({ from: r.ts, fridgeId: r.fridgeId });
    out.set(logger, points);
  }
  return out;
}

/** Merge existing periods with new change points into a clean, non-overlapping history. */
export function rebuildAssignments(loggerId: string, existing: Assignment[], newPoints: ChangePoint[]): Assignment[] {
  const points = [
    ...existing.filter((a) => a.loggerId === loggerId).map((a) => ({ from: a.validFrom, fridgeId: a.fridgeId })),
    ...newPoints,
  ].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  // same instant twice: the later one in the list (new information) wins
  const byTime = new Map<string, number>();
  for (const p of points) byTime.set(p.from, p.fridgeId);
  const unique = [...byTime.entries()].map(([from, fridgeId]) => ({ from, fridgeId }));
  const collapsed: ChangePoint[] = [];
  for (const p of unique) if (collapsed.length === 0 || collapsed[collapsed.length - 1].fridgeId !== p.fridgeId) collapsed.push(p);
  return collapsed.map((p, i) => ({ loggerId, fridgeId: p.fridgeId, validFrom: p.from, validTo: i + 1 < collapsed.length ? collapsed[i + 1].from : null }));
}

export function hasOverlap(assignments: Assignment[]): boolean {
  const byLogger = new Map<string, Assignment[]>();
  for (const a of assignments) byLogger.set(a.loggerId, [...(byLogger.get(a.loggerId) ?? []), a]);
  for (const list of byLogger.values()) {
    const s = [...list].sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
    for (let i = 1; i < s.length; i++) if (s[i - 1].validTo === null || s[i - 1].validTo! > s[i].validFrom) return true;
  }
  return false;
}

/** The logger currently in a fridge (open period), if any. */
export function currentLogger(assignments: Assignment[], fridgeId: number): string | null {
  return assignments.find((a) => a.fridgeId === fridgeId && a.validTo === null)?.loggerId ?? null;
}

/** True when two histories have the same periods, so the stored one need not be rewritten (row ids stay). */
export function sameAssignments(a: Assignment[], b: Assignment[]): boolean {
  return a.length === b.length && a.every((x, i) => x.loggerId === b[i].loggerId && x.fridgeId === b[i].fridgeId && x.validFrom === b[i].validFrom && x.validTo === b[i].validTo);
}
