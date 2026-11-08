// One call that turns a fridge's readings into gaps, excursions, trend and status.
// Pure: the caller passes the readings, the threshold and "now" (asOf).
import { toMinutes, fromMinutes, type LocalTs } from './time.ts';
import { typicalInterval, findGapsMulti, gapLimit, type Gap } from './gaps.ts';
import { findExcursions, type Excursion, type SeriesPoint } from './events.ts';
import { evaluateTrend, firstWarning, type TrendResult, type TempPoint } from './trend.ts';
import { fridgeStatus, type Level, type Reason } from './status.ts';

export interface Reading {
  loggerId: string;
  ts: LocalTs;
  tempC: number | null;
  status: 'ok' | 'error' | 'conflict';
}

export interface EventView {
  firstHigh: LocalTs;
  lastHigh: LocalTs;
  prevOk: LocalTs | null;
  nextOk: LocalTs | null;
  minMinutes: number;
  maxMinutes: number | null;
  durationKnown: boolean;
  ongoing: boolean;
  startsAtDataStart: boolean;
  gapInside: boolean;
  gapBefore: boolean;
  gapAfter: boolean;
  class: Excursion['class'];
  peak: number;
  readingsAbove: number;
  errorsInside: number;
  conflictsInside: number;
}

export interface GapView { from: LocalTs; to: LocalTs; minutes: number }

export interface FridgeAnalysis {
  level: Level;
  reasons: Reason[];
  events: EventView[];
  eventsInWindow: EventView[];
  gaps: GapView[];
  trend: TrendResult;
  firstWarning: LocalTs | null;
  typicalIntervalByLogger: Record<string, number | null>;
  counts: { readings: number; errors: number; conflicts: number; readingsInWindow: number; errorsInWindow: number; conflictsInWindow: number };
  lastReading: { ts: LocalTs; tempC: number | null; loggerId: string } | null;
}

export function toEventView(e: Excursion): EventView {
  const f = (m: number | null) => (m === null ? null : fromMinutes(m));
  return {
    firstHigh: fromMinutes(e.firstHighMin),
    lastHigh: fromMinutes(e.lastHighMin),
    prevOk: f(e.prevOkMin),
    nextOk: f(e.nextOkMin),
    minMinutes: e.minMinutes,
    maxMinutes: e.maxMinutes,
    durationKnown: e.durationKnown,
    ongoing: e.ongoing,
    startsAtDataStart: e.startsAtDataStart,
    gapInside: e.gapInside,
    gapBefore: e.gapBefore,
    gapAfter: e.gapAfter,
    class: e.class,
    peak: e.peak,
    readingsAbove: e.readingsAbove,
    errorsInside: e.errorsInside,
    conflictsInside: e.conflictsInside,
  };
}

/** D24: several values at one time -> the highest one counts (conservative), flagged as conflict. */
export function toSeries(readings: Reading[]): SeriesPoint[] {
  const byT = new Map<number, SeriesPoint & { n: number }>();
  for (const r of readings) {
    const t = toMinutes(r.ts);
    const cur = byT.get(t);
    if (!cur) { byT.set(t, { t, temp: r.tempC, n: 1, conflict: r.status === 'conflict' }); continue; }
    cur.n++;
    if (r.tempC !== null) cur.temp = cur.temp === null ? r.tempC : Math.max(cur.temp, r.tempC);
    if (r.status === 'conflict') cur.conflict = true;
  }
  return [...byT.values()].sort((a, b) => a.t - b.t).map(({ t, temp, conflict }) => ({ t, temp, conflict }));
}

export interface AnalyzeInput {
  readings: Reading[];
  threshold: number;
  asOf: LocalTs;
  windowStart: LocalTs;
  hasLogger: boolean;
  currentLoggerId?: string | null;
  /** scan for the first time the warm-up warning would have fired, between these times */
  warningScan?: { from: LocalTs; to: LocalTs } | null;
}

export function analyzeFridge(input: AnalyzeInput): FridgeAnalysis {
  const asOfMin = toMinutes(input.asOf);
  const windowMin = toMinutes(input.windowStart);
  const readings = input.readings.filter((r) => toMinutes(r.ts) <= asOfMin);

  const timesByLogger = new Map<string, number[]>();
  for (const r of readings) timesByLogger.set(r.loggerId, [...(timesByLogger.get(r.loggerId) ?? []), toMinutes(r.ts)]);
  const typical = new Map<string, number | null>();
  for (const [l, times] of timesByLogger) typical.set(l, typicalInterval(times));

  const gaps: Gap[] = findGapsMulti(readings.map((r) => ({ t: toMinutes(r.ts), loggerId: r.loggerId })), typical);
  const series = toSeries(readings);
  const events = findExcursions(series, input.threshold, gaps);
  const inWindow = (e: Excursion) => e.lastHighMin >= windowMin || e.ongoing;
  const eventsInWindow = events.filter(inWindow);

  const tempPoints: TempPoint[] = series.filter((p) => p.temp !== null).map((p) => ({ t: p.t, temp: p.temp as number }));
  const trend = evaluateTrend(tempPoints, asOfMin);

  const winReadings = readings.filter((r) => toMinutes(r.ts) >= windowMin);
  const last = [...readings].sort((a, b) => (a.ts < b.ts ? -1 : 1)).at(-1) ?? null;
  const currentLogger = input.currentLoggerId ?? last?.loggerId ?? null;

  const { level, reasons } = fridgeStatus({
    hasLogger: input.hasLogger,
    readingsInWindow: winReadings.length,
    lastReadingMin: last ? toMinutes(last.ts) : null,
    asOfMin,
    gapLimitMin: currentLogger ? gapLimit(typical.get(currentLogger) ?? null) : null,
    eventsInWindow,
    trend,
    gapsInWindow: gaps.filter((g) => g.toMin >= windowMin),
    errorsInWindow: winReadings.filter((r) => r.status === 'error').length,
    conflictsInWindow: winReadings.filter((r) => r.status === 'conflict').length,
  });

  let warn: LocalTs | null = null;
  if (input.warningScan) {
    const w = firstWarning(tempPoints, toMinutes(input.warningScan.from), Math.min(toMinutes(input.warningScan.to), asOfMin));
    warn = w === null ? null : fromMinutes(w);
  }

  return {
    level,
    reasons,
    events: events.map(toEventView),
    eventsInWindow: eventsInWindow.map(toEventView),
    gaps: gaps.map((g) => ({ from: fromMinutes(g.fromMin), to: fromMinutes(g.toMin), minutes: g.minutes })),
    trend,
    firstWarning: warn,
    typicalIntervalByLogger: Object.fromEntries(typical),
    counts: {
      readings: readings.length,
      errors: readings.filter((r) => r.status === 'error').length,
      conflicts: readings.filter((r) => r.status === 'conflict').length,
      readingsInWindow: winReadings.length,
      errorsInWindow: winReadings.filter((r) => r.status === 'error').length,
      conflictsInWindow: winReadings.filter((r) => r.status === 'conflict').length,
    },
    lastReading: last ? { ts: last.ts, tempC: last.tempC, loggerId: last.loggerId } : null,
  };
}
