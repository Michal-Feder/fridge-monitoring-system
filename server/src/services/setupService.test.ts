import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, type Db } from '../db/connection.ts';
import * as repo from '../db/repo.ts';
import { confirmImport } from './importService.ts';
import { dashboard } from './analysisService.ts';
import { listBranches, createBranch, createFridge, updateFridge, listLoggers, setLoggerUnit, moveLogger } from './setupService.ts';
import { EMAIL_SAMPLE_TSV } from '../core/fixtures/emailSample.ts';

let db: Db;
const fridgeId = (label: string) => repo.fridges(db).find((f) => `${f.branch} / ${f.name}` === label)!.id;
const tempC = (loggerId: string, ts: string) =>
  (db.prepare('SELECT temp_c, original_value, original_unit FROM measurements WHERE logger_id = ? AND ts = ?').get(loggerId, ts) as { temp_c: number | null; original_value: string; original_unit: string });

beforeEach(() => {
  db = openDb(':memory:');
  const r = confirmImport(db, [{ name: 'email.tsv', text: EMAIL_SAMPLE_TSV }], { units: { 'TL-0512': 'C', 'TL-0417': 'C', 'TL-0231': 'F', 'TL-0388': 'C' } }, '2026-09-21T09:00');
  expect(r.ok).toBe(true);
});

describe('branches and fridges', () => {
  it('lists branches with their fridges and current loggers', () => {
    const tlv = listBranches(db).find((b) => b.name === 'Tel Aviv')!;
    expect(tlv.fridges.map((f) => [f.name, f.currentLogger])).toEqual([['Display 2', 'TL-0417'], ['Walk-in', null]]);
  });

  it('creates a branch, or returns the existing one when only casing or spacing differs (D27)', () => {
    expect(createBranch(db, '  tel   AVIV ')).toMatchObject({ name: 'Tel Aviv', created: false });
    expect(createBranch(db, 'Eilat')).toMatchObject({ name: 'Eilat', created: true });
    expect(() => createBranch(db, '   ')).toThrow(/name is required/);
  });

  it('adds a fridge (default limit 5.0); it shows grey "no logger", not green', () => {
    const haifa = repo.branchByName(db, 'Haifa')!;
    const f = createFridge(db, { branchId: haifa.id, name: 'Cheese' });
    expect(f).toMatchObject({ branch: 'Haifa', name: 'Cheese', maxTemp: 5 });
    const row = dashboard(db).fridges.find((x) => x.id === f.id)!;
    expect(row.level).toBe('grey');
    expect(row.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['no_logger', 'no_data']));
    expect(() => createFridge(db, { branchId: haifa.id, name: 'cheese' })).toThrow(/already has a fridge called "Cheese"/);
    expect(() => createFridge(db, { branchId: 999, name: 'X' })).toThrow(/does not exist/);
  });

  it('changes a fridge limit, which changes its status; rejects nonsense limits and duplicate names', () => {
    const cream = fridgeId('Rishon LeZion / Cream cakes');
    expect(dashboard(db).fridges.find((x) => x.id === cream)!.level).toBe('red');
    expect(updateFridge(db, cream, { maxTemp: '8,0' })).toMatchObject({ maxTemp: 8 });
    // peak 7.1 in the email rows: no longer an excursion. Not green either: its last reading (14 Sep) is
    // stale against "now" (17 Sep 06:00, the last email row), and no data never looks like fine.
    const after = dashboard(db).fridges.find((x) => x.id === cream)!;
    expect(after.level).toBe('grey');
    expect(after.reasons.map((r) => r.code)).toEqual(['stale']);
    expect(() => updateFridge(db, cream, { maxTemp: 'warm' })).toThrow(/between -30 and 30/);
    expect(() => updateFridge(db, cream, { maxTemp: 50 })).toThrow(/between -30 and 30/);
    const walkIn = fridgeId('Tel Aviv / Walk-in');
    expect(() => updateFridge(db, walkIn, { name: 'display 2' })).toThrow(/already has a fridge called "Display 2"/);
    expect(updateFridge(db, walkIn, { name: 'Walk-in cooler' })).toMatchObject({ name: 'Walk-in cooler' });
  });
});

describe('loggers', () => {
  it('lists loggers with unit, current fridge and reading counts', () => {
    expect(listLoggers(db).find((l) => l.id === 'TL-0417')).toMatchObject({
      unit: 'C', unitConfirmed: true, readings: 5, lastReading: '2026-09-17T06:00', currentFridge: { label: 'Tel Aviv / Display 2', since: '2026-09-17T06:00' },
    });
  });

  it('changing a unit recomputes every reading from the stored original, and can be undone (D4)', () => {
    expect(tempC('TL-0231', '2026-09-14T06:00')).toEqual({ temp_c: 3.5, original_value: '38.3', original_unit: 'F' });
    expect(setLoggerUnit(db, 'TL-0231', 'C')).toEqual({ loggerId: 'TL-0231', unit: 'C', recomputed: 3 });
    expect(tempC('TL-0231', '2026-09-14T06:00')).toEqual({ temp_c: 38.3, original_value: '38.3', original_unit: 'C' });
    expect(tempC('TL-0231', '2026-09-14T06:30')).toMatchObject({ temp_c: null, original_value: 'ERR' });
    setLoggerUnit(db, 'TL-0231', 'F');
    expect(tempC('TL-0231', '2026-09-14T06:00')).toEqual({ temp_c: 3.5, original_value: '38.3', original_unit: 'F' });
    expect(() => setLoggerUnit(db, 'TL-0231', 'K')).toThrow(/"C" or "F"/);
    expect(() => setLoggerUnit(db, 'TL-9999', 'C')).toThrow(/does not exist/);
  });

  it('moves a logger: the history changes, stored readings keep their fridge (D33)', () => {
    const walkIn = fridgeId('Tel Aviv / Walk-in');
    const display2 = fridgeId('Tel Aviv / Display 2');
    const before = db.prepare("SELECT fridge_id FROM measurements WHERE logger_id = 'TL-0417' ORDER BY ts").all();
    // Display 2 has TL-0417 now: one logger per fridge
    const jerusalem = fridgeId('Jerusalem / Dairy');
    expect(() => moveLogger(db, 'TL-0512', { fridgeId: display2, from: '2026-09-18T08:00' })).toThrow(/already has logger TL-0417/);

    const hist = moveLogger(db, 'TL-0417', { fridgeId: walkIn, from: '2026-09-18T08:00' });
    expect(hist.map((a) => [a.fridgeId, a.validFrom, a.validTo])).toEqual([
      [walkIn, '2026-09-14T05:45', '2026-09-17T06:00'],
      [display2, '2026-09-17T06:00', '2026-09-18T08:00'],
      [walkIn, '2026-09-18T08:00', null],
    ]);
    expect(db.prepare("SELECT fridge_id FROM measurements WHERE logger_id = 'TL-0417' ORDER BY ts").all()).toEqual(before);
    expect(listBranches(db).find((b) => b.name === 'Tel Aviv')!.fridges.find((f) => f.id === walkIn)!.currentLogger).toBe('TL-0417');

    // same move twice: nothing changes, not even row ids
    const ids = db.prepare('SELECT id FROM logger_assignments ORDER BY id').all();
    moveLogger(db, 'TL-0417', { fridgeId: walkIn, from: '2026-09-18T08:00' });
    expect(db.prepare('SELECT id FROM logger_assignments ORDER BY id').all()).toEqual(ids);

    expect(() => moveLogger(db, 'TL-0417', { fridgeId: jerusalem, from: '18/09/2026' })).toThrow(/local time/);
  });
});
