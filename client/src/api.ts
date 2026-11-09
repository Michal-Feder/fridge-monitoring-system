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

// --- setup (server/src/services/setupService.ts)
export interface BranchInfo {
  id: number;
  name: string;
  fridges: { id: number; name: string; maxTemp: number; currentLogger: string | null }[];
}

export class ApiError extends Error {}

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

const postJson = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  dashboard: (window: Window) => request<Dashboard>(`/api/dashboard?window=${window}`),
  branches: () => request<BranchInfo[]>('/api/branches'),
  preview: (files: UploadFile[], decisions: Decisions) => request<PreviewResult>('/api/imports/preview', postJson({ files, decisions })),
  confirm: (files: UploadFile[], decisions: Decisions) => request<ConfirmResult>('/api/imports/confirm', postJson({ files, decisions }), [422]),
};
