// The seed is an integration test of the import path: every demo story is checked here (INIT Stage C, D21).
import { describe, it, expect, beforeAll } from 'vitest';
import { openDb, type Db } from '../db/connection.ts';
import * as repo from '../db/repo.ts';
import { previewImport, confirmImport } from '../services/importService.ts';
import { EMAIL_SAMPLE_TSV } from '../core/fixtures/emailSample.ts';
import { toMinutes } from '../core/time.ts';
import { generateSeedFiles, UPLOADED_AT, type SeedFiles } from './generate.ts';
import { seedDatabase } from './seedDatabase.ts';
import { statusTable, type StatusRow } from './statusTable.ts';

let db: Db;
let files: SeedFiles;
let table: ReturnType<typeof statusTable>;
const row = (label: string): StatusRow => {
  const r = table.rows.find((x) => `${x.branch} / ${x.fridge}` === label);
  if (!r) throw new Error(`no fridge ${label}`);
  return r;
};

beforeAll(() => {
  files = generateSeedFiles();
  db = openDb(':memory:');
  seedDatabase(db, files);
  table = statusTable(db);
}, 60_000);

describe('seed: files', () => {
  it('is deterministic', () => {
    expect(generateSeedFiles()).toEqual(files);
  });

  it('puts the 16 email rows verbatim into the week 38 sheet', () => {
    const week38 = files.batch1.find((f) => f.name === 'week38-sheet.csv')!.text;
    expect(week38).toContain(EMAIL_SAMPLE_TSV.split('\n').slice(1).join('\n'));
  });

  it('writes sample-data/email-sample.csv as exactly the 16-row fixture, and does not import it (D20)', () => {
    const f = files.extra.find((x) => x.name === 'email-sample.csv')!;
    expect(f.text).toBe(EMAIL_SAMPLE_TSV + '\n');
    expect([...files.batch1, ...files.batch2].map((x) => x.name)).not.toContain('email-sample.csv');
  });

  it('builds 12 branches with 2-4 fridges each, data from 10 Sep, "now" at the end of 20 Sep', () => {
    const perBranch = new Map<string, number>();
    for (const f of repo.fridges(db)) perBranch.set(f.branch, (perBranch.get(f.branch) ?? 0) + 1);
    expect(perBranch.size).toBe(12);
    expect([...perBranch.values()].every((n) => n >= 2 && n <= 4)).toBe(true);
    expect(repo.dataStart(db)).toBe('2026-09-10T00:00');
    expect(table.asOf).toBe('2026-09-20T23:45');
  });

  it('re-importing all seed files changes nothing', () => {
    const before = repo.counts(db);
    expect(confirmImport(db, files.batch1, {}, UPLOADED_AT)).toMatchObject({ ok: true, newRows: 0 });
    expect(confirmImport(db, files.batch2, {}, UPLOADED_AT)).toMatchObject({ ok: true, newRows: 0 });
    expect(repo.counts(db)).toEqual(before);
  });
});

describe('seed: every story shows the status it was written for', () => {
  it('Rishon / Cream cakes: the email rise continues to 7.4, fixed by 08:15: was too warm (sustained, ended, D36)', () => {
    expect(row('Rishon LeZion / Cream cakes')).toMatchObject({ level: 'was_red', firstAbove: '2026-09-14T06:15' });
    expect(row('Rishon LeZion / Cream cakes').reasons).toContain('was_red:sustained');
    const peak = db.prepare("SELECT MAX(temp_c) AS p FROM measurements WHERE logger_id = 'TL-0388' AND ts LIKE '2026-09-14%'").get() as { p: number };
    expect(peak.p).toBe(7.4);
  });

  it('Rishon / Dairy: slow warm-up warns (orange) well before 5.0, red after', () => {
    const r = row('Rishon LeZion / Dairy');
    expect(r.level).toBe('red');
    expect(r.reasons).toEqual(expect.arrayContaining(['red:ongoing', 'orange:warming']));
    expect(r.firstWarning).not.toBeNull();
    expect(r.firstWarning! >= '2026-09-18T00:00').toBe(true);
    expect(toMinutes(r.firstAbove!) - toMinutes(r.firstWarning!)).toBeGreaterThanOrEqual(6 * 60);
  });

  it('Petah Tikva / Cheese: warming now, still below 5: orange', () => {
    expect(row('Petah Tikva / Cheese')).toMatchObject({ level: 'orange', reasons: ['orange:warming'], firstAbove: null });
  });

  it('Tel Aviv: door spikes are labelled, not coloured; Walk-in has no logger after the move: grey', () => {
    expect(row('Tel Aviv / Display 1')).toMatchObject({ level: 'green', reasons: ['info:spikes'] });
    expect(row('Tel Aviv / Walk-in').level).toBe('grey');
    expect(row('Tel Aviv / Walk-in').reasons).toEqual(expect.arrayContaining(['grey:no_logger', 'grey:stale']));
    const name = new Map(repo.fridges(db).map((f) => [f.id, `${f.branch} / ${f.name}`]));
    expect(repo.assignments(db, 'TL-0417').map((a) => [name.get(a.fridgeId), a.validFrom, a.validTo])).toEqual([
      ['Tel Aviv / Walk-in', '2026-09-10T00:00', '2026-09-17T06:00'],
      ['Tel Aviv / Display 2', '2026-09-17T06:00', null],
    ]);
  });

  it('Haifa / Dairy: Fahrenheit logger stored in °C (38.3 F = 3.5 C), original kept', () => {
    expect(row('Haifa / Dairy').level).toBe('green');
    const m = db.prepare("SELECT original_value, original_unit, temp_c FROM measurements WHERE logger_id = 'TL-0231' AND ts = '2026-09-14T06:00'").get();
    expect(m).toEqual({ original_value: '38.3', original_unit: 'F', temp_c: 3.5 });
  });

  it('data problems are grey: Jerusalem gap, Netanya battery gap, Ashdod repeated ERR', () => {
    expect(row('Jerusalem / Dairy')).toMatchObject({ level: 'grey', reasons: ['grey:gap'] });
    expect(row('Netanya / Dairy')).toMatchObject({ level: 'grey', reasons: ['grey:gap'] });
    expect(row('Ashdod / Walk-in')).toMatchObject({ level: 'grey', reasons: ['grey:errors'] });
  });

  it('Beersheba / Bakery cooler: one high reading on a 60-min logger cannot be verified: orange', () => {
    expect(row('Beersheba / Bakery cooler')).toMatchObject({ level: 'orange', reasons: ['orange:unverified'], firstAbove: '2026-09-16T14:00' });
  });

  it('Holon / Drinks: conflicting re-paste keeps both values and is listed, not coloured', () => {
    expect(row('Holon / Drinks')).toMatchObject({ level: 'green', reasons: ['info:conflicts'] });
  });

  it('Herzliya / Dairy: the raw file found its fridge in the logger history, no gap at the hand-over', () => {
    expect(files.decisions2.raw).not.toHaveProperty('TL0490.csv');
    expect(row('Herzliya / Dairy')).toMatchObject({ level: 'green', reasons: [] });
    expect(repo.assignments(db, 'TL-0490')).toHaveLength(1);
  });

  it('every fridge without a story is green with no reasons', () => {
    const storied = new Set([
      'Rishon LeZion / Cream cakes', 'Rishon LeZion / Dairy', 'Petah Tikva / Cheese', 'Tel Aviv / Display 1', 'Tel Aviv / Display 2',
      'Tel Aviv / Walk-in', 'Jerusalem / Dairy', 'Netanya / Dairy', 'Ashdod / Walk-in', 'Beersheba / Bakery cooler', 'Holon / Drinks',
    ]);
    const others = table.rows.filter((r) => !storied.has(`${r.branch} / ${r.fridge}`));
    expect(others).toHaveLength(17);
    expect(others.filter((r) => r.level !== 'green' || r.reasons.length)).toEqual([]);
  });
});

describe('seed: new-logger-TL-0240.csv (not imported) is ready for the upload flow', () => {
  it('is an unknown logger in °F that needs a branch, a fridge and a unit decision', () => {
    const f = files.extra.find((x) => x.name === 'new-logger-TL-0240.csv')!;
    const p = previewImport(db, [f]);
    expect(p.files[0].raw).toMatchObject({ loggerId: 'TL-0240', loggerIdSource: 'filename', needsAssignment: true });
    expect(p.canConfirm).toBe(false);
    const withPlace = previewImport(db, [f], { raw: { [f.name]: { branch: 'Haifa', fridge: 'Dairy' } } });
    expect(withPlace.loggers[0]).toMatchObject({ known: false, needsUnitDecision: true, suggestion: { unit: 'F', confidence: 'high' } });
  });
});
