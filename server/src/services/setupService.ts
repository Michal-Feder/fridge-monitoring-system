// Setup (CRUD-lite): branches, fridges, logger unit and logger moves. Validation + DB writes; the rules
// (unit conversion, assignment history) come from core.
import type { Db } from '../db/connection.ts';
import { tx } from '../db/connection.ts';
import * as repo from '../db/repo.ts';
import { cleanName } from '../core/names.ts';
import { parseTemp } from '../core/parseTemp.ts';
import { toCelsius, type Unit } from '../core/units.ts';
import { currentLogger, rebuildAssignments, sameAssignments, type Assignment } from '../core/assignments.ts';
import { isValidLocalTs, type LocalTs } from '../core/time.ts';
import { badRequest, conflict, notFound } from './errors.ts';

/** A fridge limit outside this range is a typo, not a setting. */
const MAX_TEMP_RANGE: [number, number] = [-30, 30];

function checkMaxTemp(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < MAX_TEMP_RANGE[0] || n > MAX_TEMP_RANGE[1]) {
    throw badRequest(`Max temperature must be a number between ${MAX_TEMP_RANGE[0]} and ${MAX_TEMP_RANGE[1]} °C.`);
  }
  return Math.round(n * 10) / 10;
}

function checkName(v: unknown, what: string): string {
  const name = typeof v === 'string' ? cleanName(v) : '';
  if (!name) throw badRequest(`${what} name is required.`);
  if (name.length > 60) throw badRequest(`${what} name is too long (60 characters at most).`);
  return name;
}

// --- branches and fridges -------------------------------------------------------------------------

export function listBranches(db: Db) {
  const history = repo.assignments(db);
  const fridges = repo.fridges(db);
  return repo.branches(db).map((b) => ({
    id: b.id,
    name: b.name,
    fridges: fridges.filter((f) => f.branch_id === b.id).map((f) => ({ id: f.id, name: f.name, maxTemp: f.max_temp, currentLogger: currentLogger(history, f.id) })),
  }));
}

/** Creates a branch, or returns the existing one when only the casing/spacing differs (D27). */
export function createBranch(db: Db, rawName: unknown): { id: number; name: string; created: boolean } {
  const name = checkName(rawName, 'Branch');
  const existing = repo.branchByName(db, name);
  if (existing) return { ...existing, created: false };
  const id = repo.ensureBranch(db, name);
  return { id, name, created: true };
}

export function createFridge(db: Db, input: { branchId?: unknown; name?: unknown; maxTemp?: unknown }) {
  const branchId = Number(input.branchId);
  const b = Number.isInteger(branchId) ? repo.branch(db, branchId) : undefined;
  if (!b) throw notFound(`Branch ${String(input.branchId)} does not exist.`);
  const name = checkName(input.name, 'Fridge');
  const maxTemp = input.maxTemp === undefined || input.maxTemp === '' ? 5.0 : checkMaxTemp(input.maxTemp);
  const existing = repo.fridgeByName(db, b.id, name);
  if (existing) throw conflict(`${b.name} already has a fridge called "${existing.name}".`);
  const id = repo.insertFridge(db, b.id, name, maxTemp);
  return { id, branchId: b.id, branch: b.name, name, maxTemp };
}

export function updateFridge(db: Db, id: number, input: { maxTemp?: unknown; name?: unknown }) {
  const f = repo.fridge(db, id);
  if (!f) throw notFound(`Fridge ${id} does not exist.`);
  if (input.maxTemp === undefined && input.name === undefined) throw badRequest('Nothing to change: send maxTemp and/or name.');
  const fields: { maxTemp?: number; name?: string } = {};
  if (input.maxTemp !== undefined) fields.maxTemp = checkMaxTemp(input.maxTemp);
  if (input.name !== undefined) {
    fields.name = checkName(input.name, 'Fridge');
    const other = repo.fridgeByName(db, f.branch_id, fields.name);
    if (other && other.id !== id) throw conflict(`${f.branch} already has a fridge called "${other.name}".`);
  }
  repo.updateFridge(db, id, fields);
  const u = repo.fridge(db, id)!;
  return { id: u.id, branchId: u.branch_id, branch: u.branch, name: u.name, maxTemp: u.max_temp, minTemp: u.min_temp };
}

// --- loggers --------------------------------------------------------------------------------------

export function listLoggers(db: Db) {
  const history = repo.assignments(db);
  const fridgeName = new Map(repo.fridges(db).map((f) => [f.id, `${f.branch} / ${f.name}`]));
  const stats = new Map(repo.loggerStats(db).map((s) => [s.logger_id, s]));
  return repo.loggers(db).map((l) => {
    const open = history.find((a) => a.loggerId === l.id && a.validTo === null);
    return {
      id: l.id,
      unit: l.unit,
      unitConfirmed: !!l.unit_confirmed,
      currentFridge: open ? { id: open.fridgeId, label: fridgeName.get(open.fridgeId) ?? null, since: open.validFrom } : null,
      readings: stats.get(l.id)?.readings ?? 0,
      lastReading: stats.get(l.id)?.last_ts ?? null,
    };
  });
}

/** D3, D4: the unit is a per-logger setting confirmed by a human; changing it recomputes every reading
 *  from its stored original value. Nothing is lost, so a wrong choice can be undone. */
export function setLoggerUnit(db: Db, loggerId: string, unit: unknown): { loggerId: string; unit: Unit; recomputed: number } {
  if (!repo.logger(db, loggerId)) throw notFound(`Logger ${loggerId} does not exist.`);
  if (unit !== 'C' && unit !== 'F') throw badRequest('Unit must be "C" or "F".');
  return tx(db, () => {
    repo.upsertLogger(db, loggerId, unit, true);
    const rows = repo.loggerMeasurements(db, loggerId);
    for (const r of rows) {
      const v = parseTemp(r.original_value).value;
      repo.setConverted(db, r.id, unit, v === null ? null : toCelsius(v, unit));
    }
    return { loggerId, unit, recomputed: rows.length };
  });
}

/** Manual "move logger" (D25, D33). Changes the logger history only: readings already stored keep the
 *  fridge they were imported with. One logger per fridge at a time. */
export function moveLogger(db: Db, loggerId: string, input: { fridgeId?: unknown; from?: unknown }): Assignment[] {
  if (!repo.logger(db, loggerId)) throw notFound(`Logger ${loggerId} does not exist.`);
  const fridgeId = Number(input.fridgeId);
  const f = Number.isInteger(fridgeId) ? repo.fridge(db, fridgeId) : undefined;
  if (!f) throw notFound(`Fridge ${String(input.fridgeId)} does not exist.`);
  if (typeof input.from !== 'string' || !isValidLocalTs(input.from)) throw badRequest('"from" must be a local time like 2026-09-17T06:00.');
  const from: LocalTs = input.from;
  const history = repo.assignments(db);
  const occupant = currentLogger(history, f.id);
  if (occupant && occupant !== loggerId) throw conflict(`${f.branch} / ${f.name} already has logger ${occupant}. Move that logger first (one logger per fridge).`);
  return tx(db, () => {
    const current = repo.assignments(db, loggerId);
    const next = rebuildAssignments(loggerId, current, [{ from, fridgeId: f.id }]);
    if (!sameAssignments(current, next)) repo.replaceAssignments(db, loggerId, next);
    return next;
  });
}
