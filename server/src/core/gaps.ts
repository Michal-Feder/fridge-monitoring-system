// D5: a gap is a delta between two readings longer than 2.5 x the logger's typical interval.
// Typical interval = the most common delta (ties -> the smaller one). Loggers record on a fixed
// interval, so the mode is that interval even when there are many gaps; the median is not
// (Jerusalem in the email sample: deltas 15 and 135 -> median 75 would hide the 2h15m gap).
// Gaps are never filled or interpolated: they are "unknown".
export const GAP_FACTOR = 2.5;

export interface Gap {
  fromMin: number; // last reading before the gap
  toMin: number; // first reading after the gap
  minutes: number;
}

export function typicalInterval(timesMin: number[]): number | null {
  const s = [...new Set(timesMin)].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (let i = 1; i < s.length; i++) {
    const d = s[i] - s[i - 1];
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

export function gapLimit(typical: number | null): number | null {
  return typical === null ? null : typical * GAP_FACTOR;
}

/** Gaps in one logger's series. Includes error readings: an ERR row proves the logger was alive. */
export function findGaps(timesMin: number[], typical: number | null = typicalInterval(timesMin)): Gap[] {
  const limit = gapLimit(typical);
  if (limit === null) return [];
  const s = [...new Set(timesMin)].sort((a, b) => a - b);
  const gaps: Gap[] = [];
  for (let i = 1; i < s.length; i++) {
    const d = s[i] - s[i - 1];
    if (d > limit) gaps.push({ fromMin: s[i - 1], toMin: s[i], minutes: d });
  }
  return gaps;
}

/**
 * Gaps in a fridge's series, which can come from several loggers over time (a logger was moved).
 * Each delta is judged against the typical interval of the logger that took the later reading.
 */
export function findGapsMulti(points: { t: number; loggerId: string }[], typicalByLogger: Map<string, number | null>): Gap[] {
  const s = [...points].sort((a, b) => a.t - b.t);
  const gaps: Gap[] = [];
  for (let i = 1; i < s.length; i++) {
    const d = s[i].t - s[i - 1].t;
    if (d === 0) continue;
    const limit = gapLimit(typicalByLogger.get(s[i].loggerId) ?? null);
    if (limit !== null && d > limit) gaps.push({ fromMin: s[i - 1].t, toMin: s[i].t, minutes: d });
  }
  return gaps;
}
