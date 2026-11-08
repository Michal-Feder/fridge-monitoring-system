// D20: the whole email sample, end to end, through the same core functions the import uses.
// Every trap in Summer's 16 rows is checked here in one place.
import { describe, it, expect } from 'vitest';
import { EMAIL_SAMPLE_TSV } from './fixtures/emailSample.ts';
import { parseFile } from './importFile.ts';
import { canonicalize } from './names.ts';
import { suggestUnit, toCelsius, type Unit } from './units.ts';
import { dedupe } from './dedupe.ts';
import { analyzeFridge, type Reading } from './analyze.ts';
import { changePointsFromRows, rebuildAssignments } from './assignments.ts';

const file = parseFile('email-sample.tsv', EMAIL_SAMPLE_TSV);
const branchName = canonicalize(file.rows.map((r) => r.branch!));
const rows = file.rows.map((r) => ({ ...r, loggerId: r.loggerId!, branch: branchName.get(r.branch!)!, status: r.status as Reading['status'] }));
const loggers = [...new Set(rows.map((r) => r.loggerId))];
const suggested = Object.fromEntries(loggers.map((l) => [l, suggestUnit(rows.filter((r) => r.loggerId === l && r.value !== null).map((r) => r.value!))]));
// the human confirms the suggestion once per logger (D3)
const unit: Record<string, Unit> = Object.fromEntries(loggers.map((l) => [l, suggested[l].unit]));
const { rows: unique, exactDuplicates, conflicts } = dedupe(rows);
const readings = unique.map((r) => ({ ...r, tempC: r.value === null ? null : toCelsius(r.value, unit[r.loggerId]) }));

function fridge(branch: string, name: string) {
  const rs = readings.filter((r) => r.branch === branch && r.fridge === name);
  const last = rs.map((r) => r.ts).sort().at(-1)!;
  return { rs, a: analyzeFridge({ readings: rs, threshold: 5, asOf: last, windowStart: '2026-09-14T00:00', hasLogger: true }) };
}

describe('email sample, end to end', () => {
  it('reads all 16 rows from the sheet, both date formats, no row lost', () => {
    expect(file.detection.mode).toBe('sheet');
    expect(file.rows).toHaveLength(16);
    expect(file.issues).toHaveLength(0);
    expect(rows.find((r) => r.loggerId === 'TL-0231')!.ts).toBe('2026-09-14T06:00');
  });

  it('suggests Fahrenheit only for Haifa TL-0231, and converts it to ~3.5 °C (not 3.83)', () => {
    expect(suggested['TL-0231'].unit).toBe('F');
    for (const l of ['TL-0512', 'TL-0417', 'TL-0388']) expect(suggested[l].unit).toBe('C');
    const haifa = readings.filter((r) => r.loggerId === 'TL-0231' && r.tempC !== null).sort((a, b) => (a.ts < b.ts ? -1 : 1));
    expect(haifa[0].tempC!).toBeCloseTo(3.5, 2);
    expect(haifa[1].tempC!).toBeCloseTo(3.89, 2);
    expect(fridge('Haifa', 'Dairy').a.events).toHaveLength(0);
  });

  it('keeps the Haifa ERR as an error reading', () => {
    const err = readings.find((r) => r.loggerId === 'TL-0231' && r.ts === '2026-09-14T06:30')!;
    expect(err).toMatchObject({ status: 'error', tempC: null, originalValue: 'ERR' });
  });

  it('drops the one exact duplicate and finds no conflicts', () => {
    expect(exactDuplicates).toBe(1);
    expect(conflicts).toBe(0);
    expect(readings).toHaveLength(15);
  });

  it('merges "tel aviv" into "Tel Aviv"', () => {
    expect(new Set(readings.map((r) => r.branch))).toEqual(new Set(['Jerusalem', 'Tel Aviv', 'Haifa', 'Rishon LeZion']));
  });

  it('sorts the out-of-order Tel Aviv row and calls 9.4 a spike, not red', () => {
    const { a } = fridge('Tel Aviv', 'Walk-in');
    expect(a.events).toHaveLength(1);
    expect(a.events[0]).toMatchObject({ class: 'spike', firstHigh: '2026-09-14T06:15', prevOk: '2026-09-14T06:00', nextOk: '2026-09-14T06:30', maxMinutes: 30 });
    expect(a.level).not.toBe('red');
  });

  it('finds the 2h15m gap in Jerusalem', () => {
    const { a } = fridge('Jerusalem', 'Dairy');
    expect(a.gaps).toEqual([{ from: '2026-09-14T06:15', to: '2026-09-14T08:30', minutes: 135 }]);
    expect(a.level).toBe('grey');
  });

  it('flags Rishon / Cream cakes red: above 5 from 06:15 and still rising at the last reading', () => {
    const { a } = fridge('Rishon LeZion', 'Cream cakes');
    expect(a.level).toBe('red');
    expect(a.events[0]).toMatchObject({ class: 'ongoing', firstHigh: '2026-09-14T06:15', lastHigh: '2026-09-14T06:45', minMinutes: 30, peak: 7.1 });
  });

  it('records that TL-0417 moved from Walk-in to Display 2', () => {
    const ids: Record<string, number> = { 'Tel Aviv/Walk-in': 1, 'Tel Aviv/Display 2': 2 };
    const cp = changePointsFromRows(readings.filter((r) => r.loggerId === 'TL-0417').map((r) => ({ loggerId: r.loggerId, ts: r.ts, fridgeId: ids[`${r.branch}/${r.fridge}`] })));
    const hist = rebuildAssignments('TL-0417', [], cp.get('TL-0417')!);
    expect(hist.map((h) => [h.fridgeId, h.validFrom, h.validTo])).toEqual([
      [1, '2026-09-14T05:45', '2026-09-17T06:00'],
      [2, '2026-09-17T06:00', null],
    ]);
  });
});
