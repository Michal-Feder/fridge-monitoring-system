import { describe, it, expect, beforeAll } from 'vitest';
import { openDb, type Db } from '../db/connection.ts';
import * as repo from '../db/repo.ts';
import { generateSeedFiles } from '../seed/generate.ts';
import { seedDatabase } from '../seed/seedDatabase.ts';
import { dashboard, fridgeDetail, fridgeReport, search } from './analysisService.ts';
import { levelRank } from '../core/status.ts';

let db: Db;
const idOf = (label: string) => {
  const f = repo.fridges(db).find((x) => `${x.branch} / ${x.name}` === label);
  if (!f) throw new Error(`no fridge ${label}`);
  return f.id;
};

beforeAll(() => {
  db = openDb(':memory:');
  seedDatabase(db, generateSeedFiles());
}, 60_000);

describe('dashboard', () => {
  it('uses the latest reading as "now" and lists red, orange, grey before green (D11, D22)', () => {
    const d = dashboard(db, '7d');
    expect(d).toMatchObject({ asOf: '2026-09-20T23:45', windowStart: '2026-09-13T23:45', counts: { red: 2, orange: 2, grey: 4, green: 20 } });
    const ranks = d.fridges.map((f) => levelRank(f.level));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(d.fridges.slice(0, 2).map((f) => `${f.branch} / ${f.name}`)).toEqual(['Rishon LeZion / Cream cakes', 'Rishon LeZion / Dairy']);
  });

  it('the 24 h window drops what happened earlier in the week, but keeps "no logger" and ongoing problems', () => {
    const d = dashboard(db, '24h');
    const level = (label: string) => d.fridges.find((f) => `${f.branch} / ${f.name}` === label)!.level;
    expect(d.windowStart).toBe('2026-09-19T23:45');
    expect(level('Rishon LeZion / Cream cakes')).toBe('green'); // the 14 Sep excursion is outside the window
    expect(level('Jerusalem / Dairy')).toBe('green'); // so is the 14 Sep gap
    expect(level('Rishon LeZion / Dairy')).toBe('red'); // still above at the last reading
    expect(level('Tel Aviv / Walk-in')).toBe('grey'); // no logger, no data in the window
    expect(level('Petah Tikva / Cheese')).toBe('orange');
  });

  it('shows every fridge grey (no data) on an empty database, never green', () => {
    const empty = openDb(':memory:');
    const b = repo.ensureBranch(empty, 'Haifa');
    repo.ensureFridge(empty, b, 'Dairy');
    expect(dashboard(empty)).toMatchObject({ asOf: null, counts: { grey: 1, green: 0 }, fridges: [{ level: 'grey', reasons: [{ code: 'no_data' }] }] });
  });
});

describe('fridge page', () => {
  it('Rishon / Dairy: chart data for the last 7 days, first warm-up warning, logger history', () => {
    const d = fridgeDetail(db, idOf('Rishon LeZion / Dairy'));
    expect(d.range).toEqual({ from: '2026-09-13T23:45', to: '2026-09-20T23:45' });
    expect(d.status.level).toBe('red');
    expect(d.firstWarning).toBe('2026-09-18T22:00');
    expect(d.readings[0].ts >= d.range!.from && d.readings.at(-1)!.ts === '2026-09-20T23:45').toBe(true);
    expect(d.events.at(-1)).toMatchObject({ class: 'ongoing', firstHigh: '2026-09-19T13:30' });
    expect(d.loggerHistory).toEqual([{ loggerId: 'TL-0389', unit: 'C', validFrom: '2026-09-10T00:00', validTo: null }]);
  });

  it('a chosen range limits readings and events, but the status stays "now"', () => {
    const d = fridgeDetail(db, idOf('Rishon LeZion / Cream cakes'), { from: '2026-09-14T00:00', to: '2026-09-14T23:59' });
    expect(d.readings.every((r) => r.ts.startsWith('2026-09-14'))).toBe(true);
    expect(d.events).toHaveLength(1);
    expect(d.events[0]).toMatchObject({ class: 'sustained', firstHigh: '2026-09-14T06:15', lastHigh: '2026-09-14T08:00', peak: 7.4 });
    expect(d.status.level).toBe('red');
  });

  it('keeps original values next to °C for the Fahrenheit logger (D4)', () => {
    const d = fridgeDetail(db, idOf('Haifa / Dairy'), { from: '2026-09-14T06:00', to: '2026-09-14T06:30' });
    expect(d.readings.map((r) => [r.originalValue, r.originalUnit, r.tempC, r.status])).toEqual([
      ['38.3', 'F', 3.5, 'ok'],
      ['39.0', 'F', 3.89, 'ok'],
      ['ERR', 'F', null, 'error'],
    ]);
  });

  it('rejects a range that ends before it starts, and an unknown fridge', () => {
    expect(() => fridgeDetail(db, idOf('Haifa / Dairy'), { from: '2026-09-15T00:00', to: '2026-09-14T00:00' })).toThrow(/must be before/);
    expect(() => fridgeDetail(db, 9999)).toThrow(/does not exist/);
  });
});

describe('inspector report', () => {
  it('answers "when above 5 and for how long" for Rishon / Cream cakes on 14 Sep', () => {
    const r = fridgeReport(db, idOf('Rishon LeZion / Cream cakes'), { from: '2026-09-14T00:00', to: '2026-09-14T23:59' });
    expect(r.report.headline).toBe('Rishon LeZion / Cream cakes went above 5.0 °C 1 time between 14 Sep 2026 00:00 and 14 Sep 2026 23:59.');
    expect(r.report.sentences[0]).toContain('from 14 Sep 2026 06:15 to 14 Sep 2026 08:00 (between 1 h 45 min and 2 h 15 min), peak 7.4 °C');
  });

  it('labels the door spike instead of hiding it, and notes the gap, the error and the °F conversion', () => {
    const tlv = fridgeReport(db, idOf('Tel Aviv / Walk-in'), { from: '2026-09-14T00:00', to: '2026-09-14T23:59' });
    expect(tlv.report.headline).toContain('plus 1 short spike of at most 30 minutes');
    const jer = fridgeReport(db, idOf('Jerusalem / Dairy'), { from: '2026-09-14T00:00', to: '2026-09-14T23:59' });
    expect(jer.report.notes.join(' ')).toMatch(/1 period with no data \(2 h 15 min in total\).*nothing was filled in/);
    const haifa = fridgeReport(db, idOf('Haifa / Dairy'), { from: '2026-09-14T00:00', to: '2026-09-14T23:59' });
    expect(haifa.report.notes.join(' ')).toMatch(/1 reading was an error/);
    expect(haifa.report.notes.join(' ')).toMatch(/Logger TL-0231 records in °F/);
  });

  it('says it cannot tell when there are no readings in the range', () => {
    const r = fridgeReport(db, idOf('Tel Aviv / Display 2'), { from: '2026-09-14T00:00', to: '2026-09-15T00:00' });
    expect(r.report.headline).toMatch(/^No readings were recorded .* We cannot say whether it went above 5.0 °C\.$/);
  });
});

describe('threshold search (D29)', () => {
  const labels = (r: ReturnType<typeof search>) => r.results.map((x) => `${x.fridge.branch} / ${x.fridge.name}`).sort();

  it('"possibly" counts the longest possible duration; "certainly" only the proven one', () => {
    const possibly = search(db, { above: 5, minMinutes: 45, certainty: 'possibly' });
    expect(labels(possibly)).toEqual(['Beersheba / Bakery cooler', 'Rishon LeZion / Cream cakes', 'Rishon LeZion / Dairy']);
    const certainly = search(db, { above: 5, minMinutes: 45, certainty: 'certainly' });
    expect(labels(certainly)).toEqual(['Rishon LeZion / Cream cakes', 'Rishon LeZion / Dairy']);
  });

  it('includes 30-minute door spikes at "30 minutes, possibly", and uses its own threshold, not the fridge limit', () => {
    expect(labels(search(db, { above: 5, minMinutes: 30, certainty: 'possibly' }))).toEqual(
      expect.arrayContaining(['Tel Aviv / Display 1', 'Tel Aviv / Display 2', 'Tel Aviv / Walk-in']),
    );
    expect(labels(search(db, { above: 7, minMinutes: 0, certainty: 'possibly' }))).toEqual(['Rishon LeZion / Cream cakes', 'Tel Aviv / Display 1', 'Tel Aviv / Walk-in']);
  });

  it('only searches the chosen dates', () => {
    const r = search(db, { above: 5, minMinutes: 45, certainty: 'certainly', from: '2026-09-18T00:00', to: '2026-09-20T23:45' });
    expect(labels(r)).toEqual(['Rishon LeZion / Dairy']);
  });
});
