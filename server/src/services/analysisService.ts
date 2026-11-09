// Glue between the DB and core/analyze + core/report. No rules here: it loads readings and the logger
// history, picks "now" and the window, and calls core. "Now" is the latest reading in the DB (D22).
import type { Db } from '../db/connection.ts';
import * as repo from '../db/repo.ts';
import type { FridgeRow } from '../db/repo.ts';
import { analyzeFridge, type FridgeAnalysis, type EventView, type GapView } from '../core/analyze.ts';
import { coverage, inspectorReport, type Coverage, type Report } from '../core/report.ts';
import { gapLimit } from '../core/gaps.ts';
import { currentLogger, type Assignment } from '../core/assignments.ts';
import { toMinutes, fromMinutes, type LocalTs } from '../core/time.ts';
import { levelRank, type Level, type Reason } from '../core/status.ts';
import type { TrendResult } from '../core/trend.ts';
import type { Unit } from '../core/units.ts';
import { badRequest, notFound } from './errors.ts';

export type Window = '7d' | '24h';
export const WINDOW_MINUTES: Record<Window, number> = { '7d': 7 * 1440, '24h': 1440 };
/** Readings loaded before the range: the trend baseline needs the 7 days before the last 6 h (D10), and an
 *  excursion needs the normal reading before it (D6). 9 days covers both. */
const HISTORY_MARGIN_MIN = 9 * 1440;

const shift = (ts: LocalTs, minutes: number) => fromMinutes(toMinutes(ts) + minutes);

export interface Range { from: LocalTs; to: LocalTs }

export interface FridgeInfo { id: number; branchId: number; branch: string; name: string; maxTemp: number; minTemp: number | null }
const info = (f: FridgeRow): FridgeInfo => ({ id: f.id, branchId: f.branch_id, branch: f.branch, name: f.name, maxTemp: f.max_temp, minTemp: f.min_temp });

function getFridge(db: Db, id: number): FridgeRow {
  const f = repo.fridge(db, id);
  if (!f) throw notFound(`Fridge ${id} does not exist.`);
  return f;
}

/** The logger in the fridge at `ts`; for "now" the open period counts (a move entered with a later date still counts). */
function loggerAt(history: Assignment[], fridgeId: number, ts: LocalTs, isNow: boolean): string | null {
  if (isNow) return currentLogger(history, fridgeId);
  return history.find((a) => a.fridgeId === fridgeId && a.validFrom <= ts && (a.validTo === null || ts < a.validTo))?.loggerId ?? null;
}

interface AnalyzeOpts { range: Range; asOf: LocalTs; history: Assignment[]; scanWarnings?: boolean; threshold?: number }

function analyzeRange(db: Db, f: FridgeRow, o: AnalyzeOpts): FridgeAnalysis {
  const loggerId = loggerAt(o.history, f.id, o.range.to, o.range.to >= o.asOf);
  return analyzeFridge({
    // D45: up to the latest data, so excursions running past the end of the period keep their real end
    readings: repo.readings(db, f.id, shift(o.range.from, -HISTORY_MARGIN_MIN), o.range.to > o.asOf ? o.range.to : o.asOf),
    eventsUntil: o.asOf,
    threshold: o.threshold ?? f.max_temp,
    asOf: o.range.to,
    windowStart: o.range.from,
    hasLogger: loggerId !== null,
    currentLoggerId: loggerId,
    warningScan: o.scanWarnings ? o.range : null,
  });
}

function resolveRange(asOf: LocalTs, range?: Partial<Range>): Range {
  const to = range?.to ?? asOf;
  const from = range?.from ?? shift(to, -WINDOW_MINUTES['7d']);
  if (from >= to) throw badRequest(`"from" (${from}) must be before "to" (${to}).`);
  return { from, to };
}

const overlaps = (g: GapView, r: Range) => g.to >= r.from && g.from <= r.to;
const NO_DATA: Reason[] = [{ level: 'grey', code: 'no_data', params: {} }];
const NO_COVERAGE: Coverage = { periodMinutes: 0, missingMinutes: 0, percent: 0, uncovered: [] };
/** D40: the most lenient gap limit of the loggers in the range (2.5 x typical interval, D5) */
const gapLimitOf = (a: FridgeAnalysis) => Math.max(0, ...Object.values(a.typicalIntervalByLogger).map((m) => gapLimit(m) ?? 0)) || null;

// --- dashboard ------------------------------------------------------------------------------------

export interface DashboardFridge extends FridgeInfo {
  level: Level;
  reasons: Reason[];
  currentLogger: string | null;
  lastReading: { ts: LocalTs; tempC: number | null; loggerId: string } | null;
  events: EventView[];
  trend: TrendResult | null;
}

export interface Dashboard {
  asOf: LocalTs | null;
  window: Window;
  windowStart: LocalTs | null;
  counts: Record<Level, number>;
  /** needs attention first: red, orange, grey, then green; by branch and name inside a level */
  fridges: DashboardFridge[];
}

export function dashboard(db: Db, window: Window = '7d'): Dashboard {
  const asOf = repo.asOf(db);
  const history = repo.assignments(db);
  const windowStart = asOf ? shift(asOf, -WINDOW_MINUTES[window]) : null;
  const fridges: DashboardFridge[] = repo.fridges(db).map((f) => {
    const base = { ...info(f), currentLogger: currentLogger(history, f.id) };
    if (!asOf || !windowStart) return { ...base, level: 'grey' as const, reasons: NO_DATA, lastReading: null, events: [], trend: null };
    const a = analyzeRange(db, f, { range: { from: windowStart, to: asOf }, asOf, history });
    return { ...base, level: a.level, reasons: a.reasons, lastReading: a.lastReading, events: a.eventsInWindow, trend: a.trend };
  });
  fridges.sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.branch.localeCompare(b.branch) || a.name.localeCompare(b.name));
  const counts: Record<Level, number> = { red: 0, was_red: 0, orange: 0, grey: 0, green: 0 };
  for (const f of fridges) counts[f.level]++;
  return { asOf, window, windowStart, counts, fridges };
}

// --- fridge page ----------------------------------------------------------------------------------

export interface ChartReading { ts: LocalTs; tempC: number | null; status: 'ok' | 'error' | 'conflict'; loggerId: string; originalValue: string; originalUnit: Unit }

export interface FridgeDetail {
  fridge: FridgeInfo;
  asOf: LocalTs | null;
  range: Range | null;
  /** status now (7-day window at asOf), same as the dashboard */
  status: { level: Level; reasons: Reason[] };
  currentLogger: string | null;
  readings: ChartReading[];
  events: EventView[];
  gaps: GapView[];
  trend: TrendResult | null;
  /** first time in the range the warm-up warning would have fired (D10) */
  firstWarning: LocalTs | null;
  quality: { readings: number; errors: number; conflicts: number; gaps: number; typicalIntervalByLogger: Record<string, number | null> };
  /** D40: how much of the range has readings, so the page never says "never above" about time without data */
  coverage: Coverage;
  loggerHistory: { loggerId: string; unit: Unit | null; validFrom: LocalTs; validTo: LocalTs | null }[];
}

export function fridgeDetail(db: Db, id: number, range?: Partial<Range>): FridgeDetail {
  const f = getFridge(db, id);
  const history = repo.assignments(db);
  const units = new Map(repo.loggers(db).map((l) => [l.id, l.unit]));
  const loggerHistory = history.filter((a) => a.fridgeId === id).map((a) => ({ loggerId: a.loggerId, unit: units.get(a.loggerId) ?? null, validFrom: a.validFrom, validTo: a.validTo }));
  const asOf = repo.asOf(db);
  const cur = currentLogger(history, id);
  if (!asOf) {
    return { fridge: info(f), asOf: null, range: null, status: { level: 'grey', reasons: NO_DATA }, currentLogger: cur, readings: [], events: [], gaps: [], trend: null, firstWarning: null, quality: { readings: 0, errors: 0, conflicts: 0, gaps: 0, typicalIntervalByLogger: {} }, coverage: NO_COVERAGE, loggerHistory };
  }
  const r = resolveRange(asOf, range);
  const now = analyzeRange(db, f, { range: { from: shift(asOf, -WINDOW_MINUTES['7d']), to: asOf }, asOf, history });
  const a = analyzeRange(db, f, { range: r, asOf, history, scanWarnings: true });
  const gaps = a.gaps.filter((g) => overlaps(g, r));
  const inRange = repo.readings(db, id, r.from, r.to);
  return {
    fridge: info(f),
    asOf,
    range: r,
    status: { level: now.level, reasons: now.reasons },
    currentLogger: cur,
    readings: inRange.map((x) => ({ ts: x.ts, tempC: x.tempC, status: x.status, loggerId: x.loggerId, originalValue: x.originalValue, originalUnit: x.originalUnit })),
    events: a.eventsInWindow,
    gaps,
    trend: now.trend,
    firstWarning: a.firstWarning,
    quality: { readings: a.counts.readingsInWindow, errors: a.counts.errorsInWindow, conflicts: a.counts.conflictsInWindow, gaps: gaps.length, typicalIntervalByLogger: a.typicalIntervalByLogger },
    coverage: coverage({ from: r.from, to: r.to, dataEnd: asOf, gapLimitMin: gapLimitOf(a), firstReading: inRange[0]?.ts ?? null, lastReading: inRange.at(-1)?.ts ?? null, gaps, readings: inRange.length }),
    loggerHistory,
  };
}

// --- inspector report -----------------------------------------------------------------------------

export interface FridgeReport { fridge: FridgeInfo; range: Range | null; report: Report; events: EventView[]; gaps: GapView[] }

export function fridgeReport(db: Db, id: number, range?: Partial<Range>): FridgeReport {
  const f = getFridge(db, id);
  const label = `${f.branch} / ${f.name}`;
  const asOf = repo.asOf(db);
  if (!asOf) {
    const report = inspectorReport({ fridgeLabel: label, threshold: f.max_temp, from: range?.from ?? '', to: range?.to ?? '', events: [], gaps: [], readings: 0, errors: 0, conflicts: 0, firstReading: null, lastReading: null, fahrenheitLoggers: [], loggerPeriods: [], dataEnd: null, gapLimitMin: null });
    return { fridge: info(f), range: null, report, events: [], gaps: [] };
  }
  const r = resolveRange(asOf, range);
  const history = repo.assignments(db);
  const a = analyzeRange(db, f, { range: r, asOf, history });
  const inRange = repo.readings(db, id, r.from, r.to);
  const gaps = a.gaps.filter((g) => overlaps(g, r));
  const report = inspectorReport({
    fridgeLabel: label,
    threshold: f.max_temp,
    from: r.from,
    to: r.to,
    events: a.eventsInWindow,
    gaps,
    readings: inRange.length,
    errors: inRange.filter((x) => x.status === 'error').length,
    conflicts: inRange.filter((x) => x.status === 'conflict').length,
    firstReading: inRange[0]?.ts ?? null,
    lastReading: inRange.at(-1)?.ts ?? null,
    fahrenheitLoggers: [...new Set(inRange.filter((x) => x.originalUnit === 'F').map((x) => x.loggerId))],
    loggerPeriods: history
      .filter((p) => p.fridgeId === id && p.validFrom <= r.to && (p.validTo === null || p.validTo > r.from))
      .map((p) => ({ loggerId: p.loggerId, from: p.validFrom, to: p.validTo })),
    // D40: coverage is judged up to the latest data, with the most lenient gap limit of the fridge's loggers
    dataEnd: asOf,
    gapLimitMin: gapLimitOf(a),
  });
  return { fridge: info(f), range: r, report, events: a.eventsInWindow, gaps };
}

// --- branch report (D46) -------------------------------------------------------------------------

export interface BranchReportRow {
  fridge: FridgeInfo;
  /** times above the limit, spikes not counted (they are labelled in the fridge report) */
  times: number;
  spikes: number;
  /** the longest excursion (by proven length), or null when there was none */
  longest: Pick<EventView, 'minMinutes' | 'maxMinutes' | 'durationKnown' | 'ongoing' | 'continuesAfter'> | null;
  peak: number | null;
  /** D40: % of the period with readings */
  coverage: number;
}
export interface BranchReport {
  scope: { branchId: number | null; name: string };
  range: Range | null;
  summary: BranchReportRow[];
  /** one full inspector report per fridge, same order as the summary */
  fridges: FridgeReport[];
}

/** The inspector visits a branch, not a fridge: one document with a summary row and the full report per fridge. */
export function branchReport(db: Db, branchId: number | 'all', range?: Partial<Range>): BranchReport {
  let scope: BranchReport['scope'];
  if (branchId === 'all') scope = { branchId: null, name: 'All branches' };
  else {
    const b = repo.branch(db, branchId);
    if (!b) throw notFound(`Branch ${branchId} does not exist.`);
    scope = { branchId: b.id, name: b.name };
  }
  const fridges = repo.fridges(db).filter((f) => scope.branchId === null || f.branch_id === scope.branchId);
  const reports = fridges.map((f) => fridgeReport(db, f.id, range));
  const summary = reports.map((r): BranchReportRow => {
    const counted = r.events.filter((e) => e.class !== 'spike');
    const longest = counted.reduce<EventView | null>((a, b) => (!a || b.minMinutes > a.minMinutes ? b : a), null);
    return {
      fridge: r.fridge,
      times: counted.length,
      spikes: r.events.length - counted.length,
      longest: longest && { minMinutes: longest.minMinutes, maxMinutes: longest.maxMinutes, durationKnown: longest.durationKnown, ongoing: longest.ongoing, continuesAfter: longest.continuesAfter },
      peak: r.events.length ? Math.max(...r.events.map((e) => e.peak)) : null,
      coverage: r.report.coverage.percent,
    };
  });
  return { scope, range: reports[0]?.range ?? null, summary, fridges: reports };
}

// --- threshold search (D29) -----------------------------------------------------------------------

export interface SearchQuery { above: number; minMinutes: number; from?: LocalTs; to?: LocalTs; certainty: 'possibly' | 'certainly' }
export interface SearchResult {
  query: SearchQuery & Range;
  /** D47: how many fridges were searched, so "nothing found" says what was checked */
  checked: number;
  /** coverage = % of the period with readings for that fridge (D40) */
  results: { fridge: FridgeInfo; events: EventView[]; coverage: number }[];
}

/** "Fridges above X °C for at least N minutes between dates." possibly = the longest possible duration
 *  reaches N (unknown counts as possibly), certainly = the proven duration reaches N (D29). */
export function search(db: Db, q: SearchQuery): SearchResult {
  const asOf = repo.asOf(db);
  if (!asOf) return { query: { ...q, from: q.from ?? '', to: q.to ?? '' }, checked: 0, results: [] };
  const r = resolveRange(asOf, { from: q.from, to: q.to });
  const history = repo.assignments(db);
  const matches = (e: EventView) => (q.certainty === 'certainly' ? e.minMinutes >= q.minMinutes : e.maxMinutes === null || e.maxMinutes >= q.minMinutes);
  const all = repo.fridges(db);
  const results = all
    .map((f) => ({ f, a: analyzeRange(db, f, { range: r, asOf, history, threshold: q.above }) }))
    .map(({ f, a }) => ({ f, a, events: a.eventsInWindow.filter(matches) }))
    .filter((x) => x.events.length > 0)
    .map(({ f, a, events }) => {
      const inRange = repo.readings(db, f.id, r.from, r.to);
      const gaps = a.gaps.filter((g) => overlaps(g, r));
      const cov = coverage({ from: r.from, to: r.to, dataEnd: asOf, gapLimitMin: gapLimitOf(a), firstReading: inRange[0]?.ts ?? null, lastReading: inRange.at(-1)?.ts ?? null, gaps, readings: inRange.length });
      return { fridge: info(f), events, coverage: cov.percent };
    });
  const longest = (x: { events: EventView[] }) => Math.max(...x.events.map((e) => e.minMinutes));
  results.sort((a, b) => longest(b) - longest(a) || a.fridge.branch.localeCompare(b.fridge.branch) || a.fridge.name.localeCompare(b.fridge.name));
  return { query: { ...q, ...r }, checked: all.length, results };
}
