// Every fridge's status as the dashboard shows it (7-day window, "now" = latest reading, D22), plus the
// first warm-up warning from the fridge page. Printed after seeding and asserted in seed.test.ts.
import type { Db } from '../db/connection.ts';
import * as repo from '../db/repo.ts';
import { fridgeDetail } from '../services/analysisService.ts';
import type { LocalTs } from '../core/time.ts';
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
  const rows = repo.fridges(db).map((f) => {
    const d = fridgeDetail(db, f.id);
    return {
      branch: f.branch,
      fridge: f.name,
      level: d.status.level,
      reasons: d.status.reasons.map((r) => `${r.level}:${r.code}`),
      firstWarning: d.firstWarning,
      firstAbove: d.events[0]?.firstHigh ?? null,
    };
  });
  return { asOf: repo.asOf(db), rows };
}

export function formatStatusTable(t: ReturnType<typeof statusTable>): string {
  const head = ['Branch / Fridge', 'Status', 'Reasons', 'First warm-up warning', 'First above max'];
  const body = t.rows.map((r) => [`${r.branch} / ${r.fridge}`, r.level.toUpperCase(), r.reasons.join(', ') || '-', r.firstWarning ?? '-', r.firstAbove ?? '-']);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [`As of ${t.asOf} (latest reading), window 7 days`, line(head), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}
