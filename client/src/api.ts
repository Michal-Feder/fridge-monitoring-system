// Typed calls to the server. The types mirror the server's JSON (server/src/services/*); they are kept
// here so the client does not compile server code (node:sqlite) just to share types.
/** was_red: a sustained excursion that already ended in the period (D36). Order of urgency = order here. */
export type Level = 'red' | 'was_red' | 'orange' | 'grey' | 'green';
export const LEVELS = ['red', 'was_red', 'orange', 'grey', 'green'] as const satisfies readonly Level[];
export type Window = '7d' | '24h';

export interface Reason {
  level: Level | 'info';
  code: string;
  /** times are minutes since 1970 on the local wall clock (server core/time.ts) */
  params: Record<string, number | string | null>;
}

export interface DashboardFridge {
  id: number;
  branchId: number;
  branch: string;
  name: string;
  maxTemp: number;
  minTemp: number | null;
  level: Level;
  reasons: Reason[];
  currentLogger: string | null;
  lastReading: { ts: string; tempC: number | null; loggerId: string } | null;
}

export interface Dashboard {
  asOf: string | null;
  window: Window;
  windowStart: string | null;
  counts: Record<Level, number>;
  fridges: DashboardFridge[];
}

// --- import (server/src/services/importService.ts)
export type Unit = 'C' | 'F';
export interface UploadFile {
  name: string;
  text: string;
}
export interface Decisions {
  units?: Record<string, Unit>;
  raw?: Record<string, { loggerId?: string; branch?: string; fridge?: string }>;
}

export interface LoggerSummary {
  loggerId: string;
  known: boolean;
  rows: number;
  firstTs: string;
  lastTs: string;
  suggestion: { unit: Unit; confidence: 'high' | 'low'; reason: string; median: number | null };
  currentUnit: Unit | null;
  unitConfirmed: boolean;
  needsUnitDecision: boolean;
  unitWarning: string | null;
  typicalInterval: number | null;
  /** gaps inside one fridge; a fridge change is a move, not a gap (D38) */
  gaps: { from: string; to: string; minutes: number }[];
  moves: { at: string; from: string; to: string }[];
  fridges: string[];
}

export type ColumnField = 'logger' | 'branch' | 'fridge' | 'datetime' | 'date' | 'clock' | 'temp';

export interface FileSummary {
  name: string;
  ok: boolean;
  error?: string;
  mode: 'sheet' | 'raw';
  hasHeader: boolean;
  columns: { field: ColumnField; index: number; label: string | null }[];
  dateFormat: { order: 'DMY' | 'MDY'; ambiguous: boolean; hasIso: boolean; hasSlashed: boolean } | null;
  rowsRead: number;
  skipped: number;
  issues: { lineNo: number; kind: string; detail: string }[];
  errorReadings: number;
  exactDuplicates: number;
  alreadyInDb: number;
  newRows: number;
  conflicts: number;
  raw: null | {
    loggerId: string | null;
    loggerIdSource: 'column' | 'filename' | 'decision' | null;
    branch: string | null;
    fridge: string | null;
    fridgeSource: 'history' | 'decision' | null;
    needsAssignment: boolean;
  };
  warnings: string[];
}

export interface PreviewTotals {
  rowsRead: number;
  newRows: number;
  alreadyInDb: number;
  exactDuplicates: number;
  conflicts: number;
  errorReadings: number;
  skipped: number;
}

export interface PreviewResult {
  files: FileSummary[];
  loggers: LoggerSummary[];
  newBranches: string[];
  newFridges: string[];
  totals: PreviewTotals;
  blocking: string[];
  canConfirm: boolean;
}

export interface ConfirmResult {
  ok: boolean;
  blocking: string[];
  newRows: number;
  alreadyInDb: number;
  exactDuplicates: number;
  conflicts: number;
  createdBranches: string[];
  createdFridges: string[];
  files: { name: string; newRows: number; alreadyInDb: number; skipped: number }[];
}

// --- fridge page and report (server/src/services/analysisService.ts, core/analyze.ts, core/report.ts)
export interface Range {
  from: string;
  to: string;
}
export interface FridgeInfo {
  id: number;
  branchId: number;
  branch: string;
  name: string;
  maxTemp: number;
  minTemp: number | null;
}
export type EventClass = 'spike' | 'unverified' | 'sustained' | 'ongoing';
export interface EventView {
  firstHigh: string;
  lastHigh: string;
  prevOk: string | null;
  nextOk: string | null;
  minMinutes: number;
  /** null when unknown (gap, data starts above, still ongoing) */
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
export interface GapView {
  from: string;
  to: string;
  minutes: number;
}
export interface ChartReading {
  ts: string;
  tempC: number | null;
  status: 'ok' | 'error' | 'conflict';
  loggerId: string;
  originalValue: string;
  originalUnit: Unit;
}
export interface LoggerPeriod {
  loggerId: string;
  unit: Unit | null;
  validFrom: string;
  validTo: string | null;
}
export interface FridgeDetail {
  fridge: FridgeInfo;
  asOf: string | null;
  range: Range | null;
  status: { level: Level; reasons: Reason[] };
  currentLogger: string | null;
  readings: ChartReading[];
  events: EventView[];
  gaps: GapView[];
  trend: { state: string; recentMean: number | null; baseline: number | null; delta: number | null; slopePerHour: number | null } | null;
  firstWarning: string | null;
  quality: { readings: number; errors: number; conflicts: number; gaps: number; typicalIntervalByLogger: Record<string, number | null> };
  loggerHistory: LoggerPeriod[];
}
export interface FridgeReport {
  fridge: FridgeInfo;
  range: Range | null;
  report: {
    headline: string;
    sentences: string[];
    notes: string[];
    /** D40: how much of the period has readings (period ends at the latest data if earlier) */
    coverage: { periodMinutes: number; missingMinutes: number; percent: number; uncovered: GapView[] };
  };
  events: EventView[];
  gaps: GapView[];
}

// --- threshold search (analysisService.search, D29)
export type Certainty = 'possibly' | 'certainly';
/** form values as typed: the server parses numbers ("4,5" too) and dates */
export interface SearchQuery {
  above: string;
  minMinutes: string;
  from?: string;
  to?: string;
  certainty: Certainty;
}
export interface SearchResult {
  query: { above: number; minMinutes: number; certainty: Certainty; from: string; to: string };
  results: { fridge: FridgeInfo; events: EventView[] }[];
}

// --- setup (server/src/services/setupService.ts)
export interface LoggerInfo {
  id: string;
  unit: Unit;
  unitConfirmed: boolean;
  currentFridge: { id: number; label: string | null; since: string } | null;
  readings: number;
  lastReading: string | null;
}
export interface BranchInfo {
  id: number;
  name: string;
  fridges: { id: number; name: string; maxTemp: number; currentLogger: string | null }[];
}

export class ApiError extends Error {}

/** Text to show for a failed call. The server's error messages are written for people (e.g. "Max temperature
 *  must be a number between -30 and 30 °C."), so they are shown as they are. */
export function errorMessage(e: unknown, strings: { offline: string; error: (m: string) => string }): string {
  if (e instanceof ApiError) return e.message === 'offline' ? strings.offline : e.message;
  return strings.error(String((e as Error)?.message ?? e));
}

/** `accept` lists non-2xx statuses whose JSON body is a normal answer (confirm answers 422 with what is missing). */
async function request<T>(url: string, init?: RequestInit, accept: number[] = []): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('offline');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok && !accept.includes(res.status)) throw new ApiError(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const postJson = (body: unknown) => json('POST', body);
const rangeQuery = (r?: Partial<Range>) => {
  const q = new URLSearchParams();
  if (r?.from) q.set('from', r.from);
  if (r?.to) q.set('to', r.to);
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const api = {
  dashboard: (window: Window) => request<Dashboard>(`/api/dashboard?window=${window}`),
  branches: () => request<BranchInfo[]>('/api/branches'),
  preview: (files: UploadFile[], decisions: Decisions) => request<PreviewResult>('/api/imports/preview', postJson({ files, decisions })),
  confirm: (files: UploadFile[], decisions: Decisions) => request<ConfirmResult>('/api/imports/confirm', postJson({ files, decisions }), [422]),
  fridge: (id: number, range?: Partial<Range>) => request<FridgeDetail>(`/api/fridges/${id}${rangeQuery(range)}`),
  report: (id: number, range?: Partial<Range>) => request<FridgeReport>(`/api/fridges/${id}/report${rangeQuery(range)}`),
  setMaxTemp: (id: number, maxTemp: string) => request<FridgeInfo>(`/api/fridges/${id}`, json('PATCH', { maxTemp })),
  loggers: () => request<LoggerInfo[]>('/api/loggers'),
  search: (q: SearchQuery) => {
    const p = new URLSearchParams({ above: q.above, minMinutes: q.minMinutes, certainty: q.certainty });
    if (q.from) p.set('from', q.from);
    if (q.to) p.set('to', q.to);
    return request<SearchResult>(`/api/search?${p}`);
  },
  createBranch: (name: string) => request<{ id: number; name: string; created: boolean }>('/api/branches', postJson({ name })),
  createFridge: (f: { branchId: number; name: string; maxTemp: string }) => request<FridgeInfo>('/api/fridges', postJson(f)),
  moveLogger: (id: string, m: { fridgeId: number; from: string }) => request<unknown>(`/api/loggers/${encodeURIComponent(id)}/move`, postJson(m)),
  setLoggerUnit: (id: string, unit: Unit) => request<{ loggerId: string; unit: Unit; recomputed: number }>(`/api/loggers/${encodeURIComponent(id)}`, json('PATCH', { unit })),
};
