// D11: red / orange / grey / green. Every reason is returned, not only the worst, so a red fridge
// that also has a data gap shows both. "No data" is never green.
import type { Excursion } from './events.ts';
import type { Gap } from './gaps.ts';
import type { TrendResult } from './trend.ts';

export type Level = 'red' | 'orange' | 'grey' | 'green';
export type ReasonCode =
  | 'ongoing' | 'sustained' | 'warming' | 'unverified'
  | 'no_logger' | 'no_data' | 'stale' | 'gap' | 'errors'
  | 'spikes' | 'conflicts';

export interface Reason {
  level: Level | 'info';
  code: ReasonCode;
  params: Record<string, number | string | null>;
}

export const REPEATED_ERRORS = 3;
export const MIN_STALE_MIN = 60;

export interface StatusInput {
  hasLogger: boolean;
  readingsInWindow: number;
  lastReadingMin: number | null;
  asOfMin: number;
  /** 2.5 x typical interval of the current logger, or null */
  gapLimitMin: number | null;
  eventsInWindow: Excursion[];
  trend: TrendResult;
  gapsInWindow: Gap[];
  errorsInWindow: number;
  conflictsInWindow: number;
}

const ORDER: Level[] = ['red', 'orange', 'grey', 'green'];

export function fridgeStatus(i: StatusInput): { level: Level; reasons: Reason[] } {
  const reasons: Reason[] = [];
  const add = (level: Reason['level'], code: ReasonCode, params: Reason['params'] = {}) => reasons.push({ level, code, params });

  const ongoing = i.eventsInWindow.filter((e) => e.class === 'ongoing');
  const sustained = i.eventsInWindow.filter((e) => e.class === 'sustained');
  const unverified = i.eventsInWindow.filter((e) => e.class === 'unverified');
  const spikes = i.eventsInWindow.filter((e) => e.class === 'spike');

  if (ongoing.length) add('red', 'ongoing', { since: ongoing[0].firstHighMin, peak: ongoing[0].peak });
  if (sustained.length) {
    const longest = sustained.reduce((a, b) => (b.minMinutes > a.minMinutes ? b : a));
    add('red', 'sustained', { count: sustained.length, minMinutes: longest.minMinutes, maxMinutes: longest.maxMinutes, at: longest.firstHighMin, peak: longest.peak, nextOk: longest.nextOkMin });
  }
  if (i.trend.state === 'warming') add('orange', 'warming', { delta: i.trend.delta, baseline: i.trend.baseline, recentMean: i.trend.recentMean });
  if (unverified.length) add('orange', 'unverified', { count: unverified.length, at: unverified[0].firstHighMin, peak: unverified[0].peak });

  if (!i.hasLogger) add('grey', 'no_logger');
  if (i.readingsInWindow === 0) add('grey', 'no_data');
  else if (i.lastReadingMin !== null) {
    const limit = Math.max(i.gapLimitMin ?? 0, MIN_STALE_MIN);
    if (i.asOfMin - i.lastReadingMin > limit) add('grey', 'stale', { last: i.lastReadingMin, minutes: i.asOfMin - i.lastReadingMin });
  }
  if (i.gapsInWindow.length) {
    const longest = i.gapsInWindow.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    add('grey', 'gap', { count: i.gapsInWindow.length, longest: longest.minutes, from: longest.fromMin, to: longest.toMin });
  }
  if (i.errorsInWindow >= REPEATED_ERRORS) add('grey', 'errors', { count: i.errorsInWindow });

  if (spikes.length) add('info', 'spikes', { count: spikes.length });
  if (i.conflictsInWindow) add('info', 'conflicts', { count: i.conflictsInWindow });

  const level = ORDER.find((l) => reasons.some((r) => r.level === l)) ?? 'green';
  return { level, reasons };
}

export function levelRank(l: Level): number {
  return ORDER.indexOf(l);
}
