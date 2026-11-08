// Upload, then confirm (D16). Preview and confirm run the same planning code; preview writes nothing.
// The client sends the file texts again on confirm, so the server keeps no temporary state.
import { createHash } from 'node:crypto';
import type { Db } from '../db/connection.ts';
import { tx } from '../db/connection.ts';
import * as repo from '../db/repo.ts';
import { parseFile, type ParsedFile } from '../core/importFile.ts';
import { canonicalize, nameKey, cleanName, normalizeLoggerId, looksLikeLoggerId } from '../core/names.ts';
import { suggestUnit, toCelsius, type Unit, type UnitSuggestion } from '../core/units.ts';
import { rowKey, markConflicts } from '../core/dedupe.ts';
import { valueKey } from '../core/parseTemp.ts';
import { typicalInterval, findGaps } from '../core/gaps.ts';
import { fridgeAt, changePointsFromRows, rebuildAssignments, type Assignment } from '../core/assignments.ts';
import { toMinutes, fromMinutes } from '../core/time.ts';

export interface UploadFile { name: string; text: string }
export interface Decisions {
  /** loggerId -> unit chosen by the user (D3) */
  units?: Record<string, Unit>;
  /** per raw logger file: which logger it is and where it hangs */
  raw?: Record<string, { loggerId?: string; branch?: string; fridge?: string }>;
}

export interface LoggerSummary {
  loggerId: string;
  known: boolean;
  rows: number;
  firstTs: string;
  lastTs: string;
  suggestion: UnitSuggestion;
  currentUnit: Unit | null;
  unitConfirmed: boolean;
  needsUnitDecision: boolean;
  /** D28: a confirmed logger whose new values look like the other unit */
  unitWarning: string | null;
  typicalInterval: number | null;
  gaps: { from: string; to: string; minutes: number }[];
  fridges: string[];
}

export interface FileSummary {
  name: string;
  ok: boolean;
  error?: string;
  mode: 'sheet' | 'raw';
  hasHeader: boolean;
  delimiter: string;
  columns: { field: string; index: number; label: string | null }[];
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

export interface PreviewResult {
  files: FileSummary[];
  loggers: LoggerSummary[];
  newBranches: string[];
  newFridges: string[];
  totals: { rowsRead: number; newRows: number; alreadyInDb: number; exactDuplicates: number; conflicts: number; errorReadings: number; skipped: number };
  /** what still has to be decided before confirm */
  blocking: string[];
  canConfirm: boolean;
}

interface PlannedRow {
  file: string;
  lineNo: number;
  loggerId: string;
  branch: string;
  fridge: string;
  ts: string;
  originalValue: string;
  value: number | null;
  status: 'ok' | 'error';
  key: string;
  duplicate: boolean;
  inDb: boolean;
  conflict: boolean;
}

interface Plan {
  preview: PreviewResult;
  rows: PlannedRow[];
  units: Map<string, { unit: Unit; decided: boolean }>;
  parsed: ParsedFile[];
}

const FIELD_ORDER = ['logger', 'branch', 'fridge', 'datetime', 'date', 'clock', 'temp'] as const;

function plan(db: Db, files: UploadFile[], decisions: Decisions = {}): Plan {
  const knownBranches = repo.branches(db).map((b) => b.name);
  const knownFridges = repo.fridges(db);
  const knownLoggers = new Map(repo.loggers(db).map((l) => [l.id, l]));
  const history = repo.assignments(db);
  const fridgeById = new Map(knownFridges.map((f) => [f.id, f]));

  const parsed = files.map((f) => parseFile(f.name, f.text, knownBranches));
  const summaries: FileSummary[] = [];
  const draft: Omit<PlannedRow, 'key' | 'duplicate' | 'inDb' | 'conflict'>[] = [];

  // --- names: canonical branch names across the whole batch, known names win (D27)
  const rawBranchNames: string[] = [];
  for (const p of parsed) for (const r of p.rows) if (r.branch) rawBranchNames.push(r.branch);
  for (const d of Object.values(decisions.raw ?? {})) if (d.branch) rawBranchNames.push(d.branch);
  const branchMap = canonicalize(rawBranchNames, knownBranches);
  const canonBranch = (raw: string) => branchMap.get(raw) ?? cleanName(raw);

  const fridgeRaw = new Map<string, string[]>();
  const addFridge = (branch: string, fridge: string) => {
    const k = nameKey(branch);
    fridgeRaw.set(k, [...(fridgeRaw.get(k) ?? []), fridge]);
  };
  for (const p of parsed) for (const r of p.rows) if (r.branch && r.fridge) addFridge(canonBranch(r.branch), r.fridge);
  for (const d of Object.values(decisions.raw ?? {})) if (d.branch && d.fridge) addFridge(canonBranch(d.branch), d.fridge);
  const fridgeMaps = new Map<string, Map<string, string>>();
  for (const [bk, list] of fridgeRaw) {
    const known = knownFridges.filter((f) => nameKey(f.branch) === bk).map((f) => f.name);
    fridgeMaps.set(bk, canonicalize(list, known));
  }
  const canonFridge = (branch: string, raw: string) => fridgeMaps.get(nameKey(branch))?.get(raw) ?? cleanName(raw);

  for (const p of parsed) {
    const d = p.detection;
    const s: FileSummary = {
      name: p.name,
      ok: d.ok,
      error: d.error,
      mode: d.mode,
      hasHeader: d.hasHeader,
      delimiter: '',
      columns: FIELD_ORDER.filter((f) => d.columns[f] !== undefined).map((f) => ({ field: f, index: d.columns[f]!, label: d.headerLabels?.[d.columns[f]!] ?? null })),
      dateFormat: p.dateFormat,
      rowsRead: p.rows.length,
      skipped: p.issues.length,
      issues: p.issues.slice(0, 20),
      errorReadings: p.rows.filter((r) => r.status === 'error').length,
      exactDuplicates: 0,
      alreadyInDb: 0,
      newRows: 0,
      conflicts: 0,
      raw: null,
      warnings: [...d.warnings],
    };
    if (p.dateFormat?.ambiguous) s.warnings.push('Dates like 03/09 could be day/month or month/day; read as day/month (Israel). Check a few rows.');
    summaries.push(s);
    if (!d.ok) continue;

    if (d.mode === 'sheet') {
      for (const r of p.rows) {
        const branch = canonBranch(r.branch!);
        draft.push({ file: p.name, lineNo: r.lineNo, loggerId: r.loggerId!, branch, fridge: canonFridge(branch, r.fridge!), ts: r.ts, originalValue: r.originalValue, value: r.value, status: r.status });
      }
      continue;
    }

    // raw logger file: time + temperature only
    const dec = decisions.raw?.[p.name] ?? {};
    const idsInColumn = [...new Set(p.rows.map((r) => r.loggerId).filter(Boolean))] as string[];
    if (idsInColumn.length > 1) {
      s.ok = false;
      s.error = `This file has ${idsInColumn.length} different loggers but no branch/fridge columns. Add branch and fridge columns, or upload one file per logger.`;
      continue;
    }
    let loggerId: string | null = null;
    let loggerIdSource: NonNullable<FileSummary['raw']>['loggerIdSource'] = null;
    if (idsInColumn.length === 1) { loggerId = idsInColumn[0]; loggerIdSource = 'column'; }
    else if (dec.loggerId && looksLikeLoggerId(dec.loggerId)) { loggerId = normalizeLoggerId(dec.loggerId); loggerIdSource = 'decision'; }
    else if (p.loggerIdFromName) { loggerId = p.loggerIdFromName; loggerIdSource = 'filename'; }

    let branch: string | null = null;
    let fridge: string | null = null;
    let fridgeSource: NonNullable<FileSummary['raw']>['fridgeSource'] = null;
    if (dec.branch && dec.fridge) {
      branch = canonBranch(dec.branch);
      fridge = canonFridge(branch, dec.fridge);
      fridgeSource = 'decision';
    } else if (loggerId && p.rows.length) {
      const first = [...p.rows].sort((a, b) => (a.ts < b.ts ? -1 : 1))[0].ts;
      const fid = fridgeAt(history, loggerId, first) ?? history.filter((a) => a.loggerId === loggerId && a.validTo === null).at(-1)?.fridgeId ?? null;
      const f = fid !== null ? fridgeById.get(fid) : undefined;
      if (f) { branch = f.branch; fridge = f.name; fridgeSource = 'history'; }
    }
    const needsAssignment = !loggerId || !branch || !fridge;
    s.raw = { loggerId, loggerIdSource, branch, fridge, fridgeSource, needsAssignment };
    if (needsAssignment) continue;
    for (const r of p.rows) draft.push({ file: p.name, lineNo: r.lineNo, loggerId: loggerId!, branch: branch!, fridge: fridge!, ts: r.ts, originalValue: r.originalValue, value: r.value, status: r.status });
  }

  // --- units per logger (D3, D28)
  const byLogger = new Map<string, typeof draft>();
  for (const r of draft) byLogger.set(r.loggerId, [...(byLogger.get(r.loggerId) ?? []), r]);
  const headerUnitByFile = new Map(parsed.map((p) => [p.name, p.detection.headerUnit ?? p.rows.find((r) => r.unitHint)?.unitHint ?? null]));
  const units = new Map<string, { unit: Unit; decided: boolean }>();
  const loggerSummaries: LoggerSummary[] = [];

  // --- duplicates within the batch, rows already in the DB, conflicts (D14)
  const seen = new Set<string>();
  const rows: PlannedRow[] = [];
  for (const [loggerId, list] of byLogger) {
    const tsSorted = list.map((r) => r.ts).sort();
    const existing = repo.existingKeys(db, loggerId, tsSorted[0], tsSorted[tsSorted.length - 1]);
    const dbKeys = new Set(existing.map((e) => `${e.logger_id}|${e.ts}|${e.value_key}`));
    const dbNumbersAt = new Map<string, Set<number>>();
    for (const e of existing) if (e.temp_c !== null) {
      const v = Number(e.value_key);
      if (Number.isFinite(v)) dbNumbersAt.set(e.ts, (dbNumbersAt.get(e.ts) ?? new Set()).add(v));
    }
    const batchNumbersAt = new Map<string, Set<number>>();
    for (const r of list) if (r.value !== null) batchNumbersAt.set(r.ts, (batchNumbersAt.get(r.ts) ?? new Set()).add(r.value));

    for (const r of list) {
      const key = rowKey(r);
      const duplicate = seen.has(key);
      seen.add(key);
      const inDb = !duplicate && dbKeys.has(key);
      const numbers = new Set([...(batchNumbersAt.get(r.ts) ?? []), ...(dbNumbersAt.get(r.ts) ?? [])]);
      rows.push({ ...r, key, duplicate, inDb, conflict: r.value !== null && numbers.size > 1 });
    }

    const known = knownLoggers.get(loggerId);
    const hint = list.map((r) => headerUnitByFile.get(r.file)).find((u) => u) ?? null;
    const suggestion = suggestUnit(list.filter((r) => r.value !== null).map((r) => r.value!), hint);
    const confirmed = !!known?.unit_confirmed;
    const decided = decisions.units?.[loggerId];
    const unit: Unit = decided ?? (confirmed ? known!.unit : suggestion.unit);
    units.set(loggerId, { unit, decided: !!decided || confirmed });
    const times = list.map((r) => toMinutes(r.ts));
    const typical = typicalInterval(times);
    loggerSummaries.push({
      loggerId,
      known: !!known,
      rows: list.length,
      firstTs: tsSorted[0],
      lastTs: tsSorted[tsSorted.length - 1],
      suggestion,
      currentUnit: known?.unit ?? null,
      unitConfirmed: confirmed,
      needsUnitDecision: !confirmed,
      unitWarning:
        confirmed && suggestion.unit !== known!.unit && suggestion.confidence === 'high'
          ? `${loggerId} is set to °${known!.unit}, but these values look like °${suggestion.unit}. Was the logger swapped? Nothing was changed.`
          : null,
      typicalInterval: typical,
      gaps: findGaps(times, typical).map((g) => ({ from: fromMinutes(g.fromMin), to: fromMinutes(g.toMin), minutes: g.minutes })),
      fridges: [...new Set(list.map((r) => `${r.branch} / ${r.fridge}`))],
    });
  }

  for (const s of summaries) {
    const fr = rows.filter((r) => r.file === s.name);
    s.exactDuplicates = fr.filter((r) => r.duplicate).length;
    s.alreadyInDb = fr.filter((r) => r.inDb).length;
    s.newRows = fr.filter((r) => !r.duplicate && !r.inDb).length;
    s.conflicts = fr.filter((r) => !r.duplicate && r.conflict).length;
  }

  const knownBranchKeys = new Set(knownBranches.map(nameKey));
  const knownFridgeKeys = new Set(knownFridges.map((f) => `${nameKey(f.branch)}|${nameKey(f.name)}`));
  const newBranches = [...new Set(rows.map((r) => r.branch))].filter((b) => !knownBranchKeys.has(nameKey(b))).sort();
  const newFridges = [...new Set(rows.map((r) => `${r.branch} / ${r.fridge}`))]
    .filter((label) => { const [b, f] = label.split(' / '); return !knownFridgeKeys.has(`${nameKey(b)}|${nameKey(f)}`); })
    .sort();

  const blocking: string[] = [];
  for (const s of summaries) if (s.raw?.needsAssignment) blocking.push(`${s.name}: choose ${s.raw.loggerId ? '' : 'the logger id, '}branch and fridge.`);
  for (const l of loggerSummaries) if (l.needsUnitDecision && !decisions.units?.[l.loggerId]) blocking.push(`${l.loggerId}: confirm the unit (°C or °F).`);
  if (rows.length === 0 && summaries.every((s) => !s.raw?.needsAssignment)) blocking.push('No readable rows in these files.');

  const sum = (k: keyof FileSummary) => summaries.reduce((a, s) => a + (s[k] as number), 0);
  return {
    preview: {
      files: summaries,
      loggers: loggerSummaries.sort((a, b) => a.loggerId.localeCompare(b.loggerId)),
      newBranches,
      newFridges,
      totals: { rowsRead: sum('rowsRead'), newRows: sum('newRows'), alreadyInDb: sum('alreadyInDb'), exactDuplicates: sum('exactDuplicates'), conflicts: sum('conflicts'), errorReadings: sum('errorReadings'), skipped: sum('skipped') },
      blocking,
      canConfirm: blocking.length === 0,
    },
    rows,
    units,
    parsed,
  };
}

function sameAssignments(a: Assignment[], b: Assignment[]): boolean {
  return a.length === b.length && a.every((x, i) => x.fridgeId === b[i].fridgeId && x.validFrom === b[i].validFrom && x.validTo === b[i].validTo);
}

export function previewImport(db: Db, files: UploadFile[], decisions: Decisions = {}): PreviewResult {
  return plan(db, files, decisions).preview;
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

/** Saves the files. `now` is the upload time (passed in, so this stays testable). Idempotent (D14). */
export function confirmImport(db: Db, files: UploadFile[], decisions: Decisions, now: string): ConfirmResult {
  const { preview, rows, units, parsed } = plan(db, files, decisions);
  const base = { newRows: 0, alreadyInDb: preview.totals.alreadyInDb, exactDuplicates: preview.totals.exactDuplicates, conflicts: 0, createdBranches: [], createdFridges: [], files: [] };
  if (!preview.canConfirm) return { ok: false, blocking: preview.blocking, ...base };

  return tx(db, () => {
    for (const [loggerId, u] of units) repo.upsertLogger(db, loggerId, u.unit, u.decided);

    const fridgeIds = new Map<string, number>();
    const fridgeId = (branch: string, fridge: string) => {
      const k = `${nameKey(branch)}|${nameKey(fridge)}`;
      if (!fridgeIds.has(k)) fridgeIds.set(k, repo.ensureFridge(db, repo.ensureBranch(db, branch), fridge));
      return fridgeIds.get(k)!;
    };

    const toSave = rows.filter((r) => !r.duplicate && !r.inDb);
    const fileResults: ConfirmResult['files'] = [];
    for (const f of files) {
      const p = parsed.find((x) => x.name === f.name)!;
      const mine = toSave.filter((r) => r.file === f.name);
      const importId = repo.insertImport(db, f.name, now, p.rows.length, mine.length, createHash('sha256').update(f.text).digest('hex'));
      const inserted = repo.insertMeasurements(
        db,
        mine.map((r) => {
          const unit = units.get(r.loggerId)!.unit;
          return { loggerId: r.loggerId, fridgeId: fridgeId(r.branch, r.fridge), ts: r.ts, originalValue: r.originalValue, originalUnit: unit, valueKey: valueKey(r.originalValue), tempC: r.value === null ? null : toCelsius(r.value, unit), status: r.status };
        }),
        importId,
      );
      if (inserted === 0) db.prepare('DELETE FROM imports WHERE id = ?').run(importId); // nothing new: leave the DB exactly as it was
      else for (const i of p.issues) repo.insertIssue(db, importId, i.lineNo, i.kind, i.detail);
      fileResults.push({ name: f.name, newRows: inserted, alreadyInDb: rows.filter((r) => r.file === f.name && r.inDb).length, skipped: p.issues.length });
    }

    // conflicts are recomputed from the full set at each touched time, so import order never matters
    let conflicts = 0;
    const touched = new Set(rows.filter((r) => r.conflict).map((r) => `${r.loggerId}|${r.ts}`));
    for (const k of touched) {
      const [loggerId, ts] = k.split('|');
      const existing = repo.measurementsAt(db, loggerId, ts);
      const marked = markConflicts(existing.map((e) => ({ id: e.id, loggerId, ts, originalValue: e.original_value, value: e.temp_c, status: e.status })));
      for (const m of marked) {
        if (m.status === 'conflict') conflicts++;
        if (m.status !== existing.find((e) => e.id === m.id)!.status) repo.setStatus(db, m.id, m.status);
      }
    }

    // D25: logger history from the rows (which fridge each reading came from)
    const cps = changePointsFromRows(rows.map((r) => ({ loggerId: r.loggerId, ts: r.ts, fridgeId: fridgeId(r.branch, r.fridge) })));
    // Rewrite only when the history changed: a delete + re-insert would give the same periods new
    // row ids, and re-importing a file must leave the DB identical (INIT Stage C).
    for (const [loggerId, points] of cps) {
      const current = repo.assignments(db, loggerId);
      const next = rebuildAssignments(loggerId, current, points);
      if (!sameAssignments(current, next)) repo.replaceAssignments(db, loggerId, next);
    }

    return {
      ok: true,
      blocking: [],
      newRows: fileResults.reduce((a, f) => a + f.newRows, 0),
      alreadyInDb: preview.totals.alreadyInDb,
      exactDuplicates: preview.totals.exactDuplicates,
      conflicts,
      createdBranches: preview.newBranches,
      createdFridges: preview.newFridges,
      files: fileResults,
    };
  });
}
