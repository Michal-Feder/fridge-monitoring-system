// Excursions above the fridge's threshold. Rules: DECISIONS D6, D7, D8, D9, D24.
//
//   duration min = first high reading -> last high reading           (it was certainly above this long)
//   duration max = last OK reading before -> first OK reading after  (it may have been above this long)
//
//   spike      max <= 30 min   provably short (door opening): labelled, never hidden, not red
//   sustained  min  > 30 min   provably long: red
//   unverified otherwise       could be either: orange
//   ongoing    still above at the last reading: red
//
// If a gap touches the excursion, or the data starts above the threshold, max is unknown (D7).
import type { Gap } from './gaps.ts';

export const SPIKE_MAX_MIN = 30;
export const SUSTAINED_MIN_MIN = 30;

export interface SeriesPoint {
  t: number;
  /** °C; null = error reading */
  temp: number | null;
  conflict?: boolean;
}

export type EventClass = 'spike' | 'unverified' | 'sustained' | 'ongoing';

export interface Excursion {
  firstHighMin: number;
  lastHighMin: number;
  prevOkMin: number | null;
  nextOkMin: number | null;
  minMinutes: number;
  /** null when unknown (gap, data starts above, or still ongoing) */
  maxMinutes: number | null;
  durationKnown: boolean;
  ongoing: boolean;
  startsAtDataStart: boolean;
  gapInside: boolean;
  gapBefore: boolean;
  gapAfter: boolean;
  class: EventClass;
  peak: number;
  readingsAbove: number;
  errorsInside: number;
  conflictsInside: number;
}

function touchesGap(a: number, b: number, gaps: Gap[]): boolean {
  return gaps.some((g) => g.fromMin >= a && g.toMin <= b);
}

export function classify(e: Pick<Excursion, 'ongoing' | 'minMinutes' | 'maxMinutes' | 'durationKnown'>): EventClass {
  if (e.ongoing) return 'ongoing';
  if (e.minMinutes > SUSTAINED_MIN_MIN) return 'sustained';
  if (e.durationKnown && e.maxMinutes !== null && e.maxMinutes <= SPIKE_MAX_MIN) return 'spike';
  return 'unverified';
}

/**
 * Finds excursions strictly above `threshold` (D2). `points` may be unsorted; error points (temp null)
 * do not end an excursion, they are counted inside it. `gaps` come from gaps.ts.
 */
export function findExcursions(points: SeriesPoint[], threshold: number, gaps: Gap[] = []): Excursion[] {
  const s = [...points].sort((a, b) => a.t - b.t);
  const valid = s.filter((p) => p.temp !== null);
  const events: Excursion[] = [];
  let i = 0;
  while (i < valid.length) {
    if ((valid[i].temp as number) <= threshold) { i++; continue; }
    const start = i;
    while (i + 1 < valid.length && (valid[i + 1].temp as number) > threshold) i++;
    const end = i;
    const firstHigh = valid[start].t;
    const lastHigh = valid[end].t;
    const prevOk = start > 0 ? valid[start - 1].t : null;
    const nextOk = end + 1 < valid.length ? valid[end + 1].t : null;

    let gapInside = false;
    for (let k = start + 1; k <= end; k++) if (touchesGap(valid[k - 1].t, valid[k].t, gaps)) gapInside = true;
    const gapBefore = prevOk !== null && touchesGap(prevOk, firstHigh, gaps);
    const gapAfter = nextOk !== null && touchesGap(lastHigh, nextOk, gaps);
    const ongoing = nextOk === null;
    const startsAtDataStart = prevOk === null;
    const durationKnown = !ongoing && !startsAtDataStart && !gapInside && !gapBefore && !gapAfter;

    const highs = valid.slice(start, end + 1);
    const inside = s.filter((p) => p.t >= firstHigh && p.t <= lastHigh);
    const e: Excursion = {
      firstHighMin: firstHigh,
      lastHighMin: lastHigh,
      prevOkMin: prevOk,
      nextOkMin: nextOk,
      minMinutes: lastHigh - firstHigh,
      maxMinutes: durationKnown ? (nextOk as number) - (prevOk as number) : null,
      durationKnown,
      ongoing,
      startsAtDataStart,
      gapInside,
      gapBefore,
      gapAfter,
      class: 'unverified',
      peak: Math.max(...highs.map((p) => p.temp as number)),
      readingsAbove: highs.length,
      errorsInside: inside.filter((p) => p.temp === null).length,
      conflictsInside: inside.filter((p) => p.conflict).length,
    };
    e.class = classify(e);
    events.push(e);
    i++;
  }
  return events;
}

export function isRed(e: Excursion): boolean {
  return e.class === 'sustained' || e.class === 'ongoing';
}
