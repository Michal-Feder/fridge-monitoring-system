// D10: warm-up detection against the fridge's OWN baseline. No ML.
//   orange if mean(last 6 h) >= median(the 7 days before that) + 1.0 °C AND the last 6 h are rising.
//   (Revised from 1.5 °C: with a 3 °C baseline that fired only ~2.5 h before crossing 5 °C. See D10.)
//   needs >= 3 days of history before the recent window, otherwise "insufficient history" (no alert).
import { median } from './units.ts';

export const TREND = {
  recentHours: 6,
  baselineDays: 7,
  minHistoryDays: 3,
  deltaC: 1.0,
  minRecentReadings: 3,
} as const;

export interface TrendResult {
  state: 'warming' | 'stable' | 'insufficient_history' | 'insufficient_recent';
  recentMean: number | null;
  baseline: number | null;
  delta: number | null;
  slopePerHour: number | null;
}

export interface TempPoint { t: number; temp: number }

function slopePerHour(points: TempPoint[]): number {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.t, 0) / n;
  const my = points.reduce((a, p) => a + p.temp, 0) / n;
  let num = 0, den = 0;
  for (const p of points) { num += (p.t - mx) * (p.temp - my); den += (p.t - mx) ** 2; }
  return den === 0 ? 0 : (num / den) * 60;
}

/** `points` are valid readings (no errors) of one fridge; `asOfMin` is "now". */
export function evaluateTrend(points: TempPoint[], asOfMin: number): TrendResult {
  const recentStart = asOfMin - TREND.recentHours * 60;
  const baselineStart = recentStart - TREND.baselineDays * 1440;
  const none = { recentMean: null, baseline: null, delta: null, slopePerHour: null };

  const earliest = points.reduce((m, p) => Math.min(m, p.t), Infinity);
  if (!(earliest <= recentStart - TREND.minHistoryDays * 1440)) return { state: 'insufficient_history', ...none };

  const recent = points.filter((p) => p.t >= recentStart && p.t <= asOfMin);
  if (recent.length < TREND.minRecentReadings) return { state: 'insufficient_recent', ...none };
  const base = median(points.filter((p) => p.t >= baselineStart && p.t < recentStart).map((p) => p.temp));
  if (base === null) return { state: 'insufficient_history', ...none };

  const recentMean = recent.reduce((a, p) => a + p.temp, 0) / recent.length;
  const slope = slopePerHour(recent);
  const delta = recentMean - base;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    state: delta >= TREND.deltaC && slope > 0 ? 'warming' : 'stable',
    recentMean: r2(recentMean),
    baseline: r2(base),
    delta: r2(delta),
    slopePerHour: Math.round(slope * 1000) / 1000,
  };
}

/** The first time (scanning every `stepMin`) at which the warm-up warning would have fired. */
export function firstWarning(points: TempPoint[], fromMin: number, toMin: number, stepMin = 60): number | null {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const start = Math.ceil(fromMin / stepMin) * stepMin;
  for (let t = start; t <= toMin; t += stepMin) {
    if (evaluateTrend(sorted, t).state === 'warming') return t;
  }
  return null;
}
