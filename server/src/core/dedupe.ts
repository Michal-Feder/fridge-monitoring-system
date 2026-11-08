// D14: exact duplicates are dropped and counted; same logger + time with a different NUMBER keeps both
// and marks them "conflict". Statuses are computed from the whole set, so the result does not depend on
// the order rows arrive in, and importing the same rows again changes nothing.
import { valueKey } from './parseTemp.ts';

export interface Keyed {
  loggerId: string;
  ts: string;
  originalValue: string;
  value: number | null;
  status: 'ok' | 'error' | 'conflict';
}

export function rowKey(r: Pick<Keyed, 'loggerId' | 'ts' | 'originalValue'>): string {
  return `${r.loggerId}|${r.ts}|${valueKey(r.originalValue)}`;
}

export function dropExactDuplicates<T extends Keyed>(rows: T[]): { rows: T[]; exactDuplicates: number } {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = rowKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return { rows: out, exactDuplicates: rows.length - out.length };
}

/** Returns copies with status recomputed: numeric rows that share logger+time with another number -> conflict. */
export function markConflicts<T extends Keyed>(rows: T[]): T[] {
  const numbersAt = new Map<string, Set<number>>();
  for (const r of rows) {
    if (r.value === null) continue;
    const k = `${r.loggerId}|${r.ts}`;
    const s = numbersAt.get(k) ?? new Set<number>();
    s.add(r.value);
    numbersAt.set(k, s);
  }
  return rows.map((r) => {
    if (r.value === null) return { ...r, status: 'error' as const };
    const conflict = (numbersAt.get(`${r.loggerId}|${r.ts}`)?.size ?? 0) > 1;
    return { ...r, status: conflict ? ('conflict' as const) : ('ok' as const) };
  });
}

export function dedupe<T extends Keyed>(rows: T[]): { rows: T[]; exactDuplicates: number; conflicts: number } {
  const { rows: unique, exactDuplicates } = dropExactDuplicates(rows);
  const marked = markConflicts(unique);
  return { rows: marked, exactDuplicates, conflicts: marked.filter((r) => r.status === 'conflict').length };
}
