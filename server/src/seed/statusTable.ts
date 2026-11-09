// Every fridge's status as the dashboard will show it (7-day window, "now" = latest reading, D22).
// Used to check the seed against its stories. Step 8's analysis service takes over this job for the API.
import type { Db } from '../db/connection.ts';
import * as repo from '../db/repo.ts';
import { analyzeFridge } from '../core/analyze.ts';
import { currentLogger } from '../core/assignments.ts';
import { toMinutes, fromMinutes, type LocalTs } from '../core/time.ts';
import type { Level } from '../core/status.ts';

export interface StatusRow {
  branch: string;
  fridge: string;
  level: Level;
  reasons: string[];
  firstWarning: LocalTs | null;
  firstAbove: LocalTs | null;
}

export function statusTable(db: Db): { asOf: LocalTs | null; rows: StatusRow[] } {
  const asOf = repo.asOf(db);
  if (!asOf) return { asOf: null, rows: [] };
  const windowStart = fromMinutes(toMinutes(asOf) - 7 * 1440);
  const history = repo.assignments(db);
  const rows = repo.fridges(db).map((f) => {
    const loggerId = currentLogger(history, f.id);
    const a = analyzeFridge({
      readings: repo.readings(db, f.id, '0000-01-01T00:00', asOf),
      threshold: f.max_temp,
      asOf,
      windowStart,
      hasLogger: loggerId !== null,
      currentLoggerId: loggerId,
      warningScan: { from: windowStart, to: asOf },
    });
    return {
      branch: f.branch,
      fridge: f.name,
      level: a.level,
      reasons: a.reasons.map((r) => `${r.level}:${r.code}`),
      firstWarning: a.firstWarning,
      firstAbove: a.eventsInWindow[0]?.firstHigh ?? null,
    };
  });
  return { asOf, rows };
}

export function formatStatusTable(t: ReturnType<typeof statusTable>): string {
  const head = ['Branch / Fridge', 'Status', 'Reasons', 'First warm-up warning', 'First above max'];
  const body = t.rows.map((r) => [`${r.branch} / ${r.fridge}`, r.level.toUpperCase(), r.reasons.join(', ') || '-', r.firstWarning ?? '-', r.firstAbove ?? '-']);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [`As of ${t.asOf} (latest reading), window 7 days`, line(head), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}
