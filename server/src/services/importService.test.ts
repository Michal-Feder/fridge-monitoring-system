import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, type Db } from '../db/connection.ts';
import * as repo from '../db/repo.ts';
import { previewImport, confirmImport, type UploadFile } from './importService.ts';
import { EMAIL_SAMPLE_TSV } from '../core/fixtures/emailSample.ts';

const EMAIL: UploadFile = { name: 'email-sample.tsv', text: EMAIL_SAMPLE_TSV };
const EMAIL_UNITS = { units: { 'TL-0512': 'C', 'TL-0417': 'C', 'TL-0231': 'F', 'TL-0388': 'C' } } as const;
const NOW = '2026-09-21T09:00';

const TABLES = ['branches', 'fridges', 'loggers', 'logger_assignments', 'imports', 'measurements', 'import_issues'];

/** Every row of every table, ids included: "identical" means identical. */
function snapshot(db: Db): Record<string, unknown[]> {
  return Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()]));
}

function measurement(db: Db, loggerId: string, ts: string) {
  return db
    .prepare('SELECT original_value, original_unit, temp_c, status FROM measurements WHERE logger_id = ? AND ts = ? ORDER BY id')
    .all(loggerId, ts) as { original_value: string; original_unit: string; temp_c: number | null; status: string }[];
}

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
});

describe('import preview (stateless, D16)', () => {
  it('summarises the email sample: 16 read, 15 new, 1 duplicate, 4 unit decisions, Haifa suggested °F', () => {
    const p = previewImport(db, [EMAIL]);

    expect(p.totals).toMatchObject({ rowsRead: 16, newRows: 15, exactDuplicates: 1, alreadyInDb: 0, conflicts: 0, errorReadings: 1, skipped: 0 });
    expect(p.files[0]).toMatchObject({ ok: true, mode: 'sheet', hasHeader: true });
    expect(p.files[0].dateFormat).toMatchObject({ order: 'DMY', ambiguous: false, hasIso: true, hasSlashed: true });

    expect(p.loggers.map((l) => l.loggerId)).toEqual(['TL-0231', 'TL-0388', 'TL-0417', 'TL-0512']);
    expect(p.loggers.every((l) => l.needsUnitDecision && !l.known)).toBe(true);
    const unitOf = Object.fromEntries(p.loggers.map((l) => [l.loggerId, l.suggestion.unit]));
    expect(unitOf).toEqual({ 'TL-0231': 'F', 'TL-0388': 'C', 'TL-0417': 'C', 'TL-0512': 'C' });

    expect(p.newBranches).toEqual(['Haifa', 'Jerusalem', 'Rishon LeZion', 'Tel Aviv']); // "tel aviv" merged (D27)
    expect(p.newFridges).toContain('Tel Aviv / Display 2');
    expect(p.canConfirm).toBe(false);
    expect(p.blocking).toHaveLength(4);
  });

  it('a logger moving to another fridge is a move, not a gap; a real gap in one fridge stays a gap', () => {
    const p = previewImport(db, [EMAIL]);
    const logger = (id: string) => p.loggers.find((l) => l.loggerId === id)!;

    // TL-0417: Walk-in until 14 Sep 06:30, then Display 2 from 17 Sep 06:00 (logger moved)
    expect(logger('TL-0417').gaps).toEqual([]);
    expect(logger('TL-0417').moves).toEqual([{ at: '2026-09-17T06:00', from: 'Tel Aviv / Walk-in', to: 'Tel Aviv / Display 2' }]);

    // TL-0512 stays in Jerusalem / Dairy: 06:15 -> 08:30 is the 2h15m gap (D5)
    expect(logger('TL-0512').gaps).toEqual([{ from: '2026-09-14T06:15', to: '2026-09-14T08:30', minutes: 135 }]);
    expect(logger('TL-0512').moves).toEqual([]);
  });

  it('D42: a logger whose values fit neither °C nor °F blocks saving, even with a unit chosen', () => {
    const kelvin: UploadFile = { name: 'TL-0777.csv', text: 'Time,Temp\n2026-09-14 06:00,276.1\n2026-09-14 06:15,276.4\n2026-09-14 06:30,277.0\n' };
    const decisions = { raw: { 'TL-0777.csv': { branch: 'Haifa', fridge: 'Dairy' } }, units: { 'TL-0777': 'C' as const } };
    const p = previewImport(db, [kelvin], decisions);
    expect(p.loggers[0].suggestion).toMatchObject({ unit: null, confidence: 'none' });
    expect(p.canConfirm).toBe(false);
    expect(p.blocking.join(' ')).toMatch(/TL-0777: these values fit neither °C nor °F \(median 276\.4\)/);
    const before = snapshot(db);
    expect(confirmImport(db, [kelvin], decisions, NOW).ok).toBe(false);
    expect(snapshot(db)).toEqual(before);
  });

  it('writes nothing, even with every decision supplied', () => {
    const before = snapshot(db);
    const p = previewImport(db, [EMAIL], EMAIL_UNITS);
    expect(p.canConfirm).toBe(true);
    expect(snapshot(db)).toEqual(before);
  });
});

describe('import confirm', () => {
  it('refuses without a unit decision for every unconfirmed logger, and saves nothing', () => {
    const before = snapshot(db);
    const r = confirmImport(db, [EMAIL], {}, NOW);
    expect(r.ok).toBe(false);
    expect(r.blocking.join(' ')).toMatch(/TL-0231: confirm the unit/);
    expect(snapshot(db)).toEqual(before);
  });

  it('saves the email sample: 15 rows, Haifa converted 38.3 °F -> 3.5 °C with the original kept, ERR as error', () => {
    const r = confirmImport(db, [EMAIL], EMAIL_UNITS, NOW);
    expect(r).toMatchObject({ ok: true, newRows: 15, exactDuplicates: 1, conflicts: 0 });
    expect(repo.counts(db)).toMatchObject({ measurements: 15, branches: 4, fridges: 5, loggers: 4 });

    expect(measurement(db, 'TL-0231', '2026-09-14T06:00')).toEqual([{ original_value: '38.3', original_unit: 'F', temp_c: 3.5, status: 'ok' }]);
    expect(measurement(db, 'TL-0231', '2026-09-14T06:30')).toEqual([{ original_value: 'ERR', original_unit: 'F', temp_c: null, status: 'error' }]);
    expect(repo.logger(db, 'TL-0231')).toMatchObject({ unit: 'F', unit_confirmed: 1 });
  });

  it('is idempotent: confirming the same file again leaves an identical DB', () => {
    confirmImport(db, [EMAIL], EMAIL_UNITS, NOW);
    const first = snapshot(db);

    const again = confirmImport(db, [EMAIL], {}, '2026-09-28T09:00'); // loggers now confirmed: no decisions needed
    expect(again).toMatchObject({ ok: true, newRows: 0, alreadyInDb: 15 });
    expect(snapshot(db)).toEqual(first);
  });

  it('a later file with 4.9 at Jerusalem 06:15 marks both rows as conflict (D14)', () => {
    confirmImport(db, [EMAIL], EMAIL_UNITS, NOW);
    const later: UploadFile = { name: 'jerusalem-fix.csv', text: 'Logger,Branch,Fridge,Time,Temp\nTL-0512,Jerusalem,Dairy,2026-09-14 06:15,4.9' };

    const p = previewImport(db, [later]);
    expect(p).toMatchObject({ canConfirm: true, totals: { newRows: 1, conflicts: 1 } });

    const r = confirmImport(db, [later], {}, NOW);
    expect(r).toMatchObject({ ok: true, newRows: 1, conflicts: 2 });
    expect(measurement(db, 'TL-0512', '2026-09-14T06:15').map((m) => [m.original_value, m.status])).toEqual([
      ['3.9', 'conflict'],
      ['4.9', 'conflict'],
    ]);
  });

  it('records the TL-0417 history: Walk-in until 17 Sep 06:00, then Display 2 (D25)', () => {
    confirmImport(db, [EMAIL], EMAIL_UNITS, NOW);
    const name = new Map(repo.fridges(db).map((f) => [f.id, `${f.branch} / ${f.name}`]));
    const history = repo.assignments(db, 'TL-0417').map((a) => [name.get(a.fridgeId), a.validFrom, a.validTo]);
    expect(history).toEqual([
      ['Tel Aviv / Walk-in', '2026-09-14T05:45', '2026-09-17T06:00'],
      ['Tel Aviv / Display 2', '2026-09-17T06:00', null],
    ]);
  });

  it('a raw file TL-0240.csv needs a branch and fridge, then confirms with that decision', () => {
    confirmImport(db, [EMAIL], EMAIL_UNITS, NOW);
    const raw: UploadFile = { name: 'TL-0240.csv', text: 'Time;Temp\n2026-09-14 06:00;37.9\n2026-09-14 06:15;38.4\n2026-09-14 06:30;ERR' };

    const p = previewImport(db, [raw]);
    expect(p.files[0]).toMatchObject({ ok: true, mode: 'raw' });
    expect(p.files[0].raw).toMatchObject({ loggerId: 'TL-0240', loggerIdSource: 'filename', needsAssignment: true });
    expect(p.canConfirm).toBe(false);
    expect(confirmImport(db, [raw], {}, NOW).ok).toBe(false);

    const decisions = { raw: { 'TL-0240.csv': { branch: 'haifa', fridge: 'Cheese' } }, units: { 'TL-0240': 'F' as const } };
    const p2 = previewImport(db, [raw], decisions);
    expect(p2.loggers[0].suggestion.unit).toBe('F');
    expect(p2.newFridges).toEqual(['Haifa / Cheese']); // existing branch spelling wins
    expect(p2.canConfirm).toBe(true);

    const r = confirmImport(db, [raw], decisions, NOW);
    expect(r).toMatchObject({ ok: true, newRows: 3, createdBranches: [], createdFridges: ['Haifa / Cheese'] });
    expect(measurement(db, 'TL-0240', '2026-09-14T06:00')).toEqual([{ original_value: '37.9', original_unit: 'F', temp_c: 3.28, status: 'ok' }]);
    const cheese = repo.fridges(db).find((f) => f.branch === 'Haifa' && f.name === 'Cheese')!;
    expect(repo.assignments(db, 'TL-0240')).toEqual([{ loggerId: 'TL-0240', fridgeId: cheese.id, validFrom: '2026-09-14T06:00', validTo: null }]);
  });
});
