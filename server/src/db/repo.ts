// All SQL lives here. No business rules: those are in core/.
import type { Db } from './connection.ts';
import type { Assignment } from '../core/assignments.ts';
import type { Reading } from '../core/analyze.ts';
import type { Unit } from '../core/units.ts';

export interface BranchRow { id: number; name: string }
export interface FridgeRow { id: number; branch_id: number; branch: string; name: string; max_temp: number; min_temp: number | null }
export interface LoggerRow { id: string; unit: Unit; unit_confirmed: number }
export interface MeasurementRow { logger_id: string; ts: string; original_value: string; original_unit: Unit; value_key: string; temp_c: number | null; status: Reading['status'] }

type Row = Record<string, unknown>;
const all = <T>(db: Db, sql: string, ...p: (string | number | null)[]) => db.prepare(sql).all(...p) as unknown as T[];
const one = <T>(db: Db, sql: string, ...p: (string | number | null)[]) => db.prepare(sql).get(...p) as unknown as T | undefined;

export const branches = (db: Db) => all<BranchRow>(db, 'SELECT id, name FROM branches ORDER BY name');
export const fridges = (db: Db) =>
  all<FridgeRow>(db, 'SELECT f.id, f.branch_id, b.name AS branch, f.name, f.max_temp, f.min_temp FROM fridges f JOIN branches b ON b.id = f.branch_id ORDER BY b.name, f.name');
export const fridge = (db: Db, id: number) =>
  one<FridgeRow>(db, 'SELECT f.id, f.branch_id, b.name AS branch, f.name, f.max_temp, f.min_temp FROM fridges f JOIN branches b ON b.id = f.branch_id WHERE f.id = ?', id);
export const loggers = (db: Db) => all<LoggerRow>(db, 'SELECT id, unit, unit_confirmed FROM loggers ORDER BY id');
export const logger = (db: Db, id: string) => one<LoggerRow>(db, 'SELECT id, unit, unit_confirmed FROM loggers WHERE id = ?', id);

export function ensureBranch(db: Db, name: string): number {
  db.prepare('INSERT OR IGNORE INTO branches(name) VALUES (?)').run(name);
  return (one<Row>(db, 'SELECT id FROM branches WHERE name = ?', name)!.id) as number;
}

export function ensureFridge(db: Db, branchId: number, name: string): number {
  db.prepare('INSERT OR IGNORE INTO fridges(branch_id, name) VALUES (?, ?)').run(branchId, name);
  return (one<Row>(db, 'SELECT id FROM fridges WHERE branch_id = ? AND name = ?', branchId, name)!.id) as number;
}

export function upsertLogger(db: Db, id: string, unit: Unit, confirmed: boolean): void {
  db.prepare(
    `INSERT INTO loggers(id, unit, unit_confirmed) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET unit = excluded.unit, unit_confirmed = MAX(unit_confirmed, excluded.unit_confirmed)`,
  ).run(id, unit, confirmed ? 1 : 0);
}

export function assignments(db: Db, loggerId?: string): Assignment[] {
  const rows = loggerId
    ? all<Row>(db, 'SELECT logger_id, fridge_id, valid_from, valid_to FROM logger_assignments WHERE logger_id = ? ORDER BY valid_from', loggerId)
    : all<Row>(db, 'SELECT logger_id, fridge_id, valid_from, valid_to FROM logger_assignments ORDER BY logger_id, valid_from');
  return rows.map((r) => ({ loggerId: r.logger_id as string, fridgeId: r.fridge_id as number, validFrom: r.valid_from as string, validTo: (r.valid_to as string) ?? null }));
}

export function replaceAssignments(db: Db, loggerId: string, list: Assignment[]): void {
  db.prepare('DELETE FROM logger_assignments WHERE logger_id = ?').run(loggerId);
  const ins = db.prepare('INSERT INTO logger_assignments(logger_id, fridge_id, valid_from, valid_to) VALUES (?, ?, ?, ?)');
  for (const a of list) ins.run(a.loggerId, a.fridgeId, a.validFrom, a.validTo);
}

export function insertImport(db: Db, filename: string, uploadedAt: string, rowCount: number, newRows: number, sha256: string): number {
  const r = db.prepare('INSERT INTO imports(filename, uploaded_at, row_count, new_rows, sha256) VALUES (?, ?, ?, ?, ?)').run(filename, uploadedAt, rowCount, newRows, sha256);
  return Number(r.lastInsertRowid);
}

export function insertIssue(db: Db, importId: number, rowNo: number | null, kind: string, detail: string): void {
  db.prepare('INSERT INTO import_issues(import_id, row_no, kind, detail) VALUES (?, ?, ?, ?)').run(importId, rowNo, kind, detail);
}

export interface NewMeasurement { loggerId: string; fridgeId: number; ts: string; originalValue: string; originalUnit: Unit; valueKey: string; tempC: number | null; status: 'ok' | 'error' }

/** INSERT OR IGNORE on (logger, ts, value): re-importing the same file inserts nothing (D14). Returns rows inserted. */
export function insertMeasurements(db: Db, rows: NewMeasurement[], importId: number | null): number {
  const st = db.prepare(
    `INSERT OR IGNORE INTO measurements(logger_id, fridge_id, ts, original_value, original_unit, value_key, temp_c, status, import_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let n = 0;
  for (const r of rows) n += Number(st.run(r.loggerId, r.fridgeId, r.ts, r.originalValue, r.originalUnit, r.valueKey, r.tempC, r.status, importId).changes);
  return n;
}

/** Saved readings of a logger in a time range, with the fridge each one is saved under (D51). */
export function existingKeys(db: Db, loggerId: string, from: string, to: string): (MeasurementRow & { fridge_id: number })[] {
  return all<MeasurementRow & { fridge_id: number }>(db, 'SELECT logger_id, ts, original_value, original_unit, value_key, temp_c, status, fridge_id FROM measurements WHERE logger_id = ? AND ts BETWEEN ? AND ?', loggerId, from, to);
}

export function measurementsAt(db: Db, loggerId: string, ts: string): (MeasurementRow & { id: number })[] {
  return all(db, 'SELECT id, logger_id, ts, original_value, original_unit, value_key, temp_c, status FROM measurements WHERE logger_id = ? AND ts = ?', loggerId, ts);
}

export function setStatus(db: Db, id: number, status: string): void {
  db.prepare('UPDATE measurements SET status = ? WHERE id = ?').run(status, id);
}

export function readings(db: Db, fridgeId: number, from: string, to: string): (Reading & { originalValue: string; originalUnit: Unit })[] {
  return all<Row>(
    db,
    'SELECT logger_id, ts, temp_c, status, original_value, original_unit FROM measurements WHERE fridge_id = ? AND ts BETWEEN ? AND ? ORDER BY ts',
    fridgeId, from, to,
  ).map((r) => ({ loggerId: r.logger_id as string, ts: r.ts as string, tempC: (r.temp_c as number) ?? null, status: r.status as Reading['status'], originalValue: r.original_value as string, originalUnit: r.original_unit as Unit }));
}

export function asOf(db: Db): string | null {
  return (one<Row>(db, 'SELECT MAX(ts) AS m FROM measurements')?.m as string) ?? null;
}

export function dataStart(db: Db): string | null {
  return (one<Row>(db, 'SELECT MIN(ts) AS m FROM measurements')?.m as string) ?? null;
}

export function loggerMeasurements(db: Db, loggerId: string): { id: number; original_value: string }[] {
  return all(db, 'SELECT id, original_value FROM measurements WHERE logger_id = ?', loggerId);
}

export function setConverted(db: Db, id: number, unit: Unit, tempC: number | null): void {
  db.prepare('UPDATE measurements SET original_unit = ?, temp_c = ? WHERE id = ?').run(unit, tempC, id);
}

export function updateFridge(db: Db, id: number, fields: { maxTemp?: number; name?: string }): void {
  if (fields.maxTemp !== undefined) db.prepare('UPDATE fridges SET max_temp = ? WHERE id = ?').run(fields.maxTemp, id);
  if (fields.name !== undefined) db.prepare('UPDATE fridges SET name = ? WHERE id = ?').run(fields.name, id);
}

export function importsList(db: Db): Row[] {
  return all<Row>(db, 'SELECT id, filename, uploaded_at, row_count, new_rows FROM imports ORDER BY id DESC LIMIT 50');
}

export function counts(db: Db): Row {
  return one<Row>(db, `SELECT (SELECT COUNT(*) FROM measurements) AS measurements, (SELECT COUNT(*) FROM fridges) AS fridges,
    (SELECT COUNT(*) FROM branches) AS branches, (SELECT COUNT(*) FROM loggers) AS loggers, (SELECT COUNT(*) FROM logger_assignments) AS assignments`)!;
}

// --- setup (branches, fridges, loggers) ---
export const branch = (db: Db, id: number) => one<BranchRow>(db, 'SELECT id, name FROM branches WHERE id = ?', id);
/** names are COLLATE NOCASE in the schema, so "tel aviv" finds "Tel Aviv" */
export const branchByName = (db: Db, name: string) => one<BranchRow>(db, 'SELECT id, name FROM branches WHERE name = ?', name);
export const fridgeByName = (db: Db, branchId: number, name: string) =>
  one<FridgeRow>(db, 'SELECT f.id, f.branch_id, b.name AS branch, f.name, f.max_temp, f.min_temp FROM fridges f JOIN branches b ON b.id = f.branch_id WHERE f.branch_id = ? AND f.name = ?', branchId, name);

export function insertFridge(db: Db, branchId: number, name: string, maxTemp: number): number {
  return Number(db.prepare('INSERT INTO fridges(branch_id, name, max_temp) VALUES (?, ?, ?)').run(branchId, name, maxTemp).lastInsertRowid);
}

export function loggerStats(db: Db): { logger_id: string; readings: number; last_ts: string }[] {
  return all(db, 'SELECT logger_id, COUNT(*) AS readings, MAX(ts) AS last_ts FROM measurements GROUP BY logger_id');
}
