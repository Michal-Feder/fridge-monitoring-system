import { describe, it, expect } from 'vitest';
import { dedupe, markConflicts, type Keyed } from './dedupe.ts';
import { typicalInterval, findGaps, fridgeRuns, fridgeMoves } from './gaps.ts';
import { findExcursions, type SeriesPoint } from './events.ts';
import { evaluateTrend, firstWarning } from './trend.ts';
import { analyzeFridge, type Reading } from './analyze.ts';
import { changePointsFromRows, rebuildAssignments, fridgeAt, fridgeForRow, hasOverlap, sameAssignments } from './assignments.ts';
import { inspectorReport } from './report.ts';
import { toMinutes, fromMinutes } from './time.ts';
import { levelRank, type Level } from './status.ts';

const m = (ts: string) => toMinutes(ts);
const pts = (list: [string, number | null][]): SeriesPoint[] => list.map(([ts, temp]) => ({ t: m(ts), temp }));
const row = (ts: string, v: string, logger = 'TL-0512'): Keyed => ({ loggerId: logger, ts, originalValue: v, value: v === 'ERR' ? null : Number(v), status: 'ok' });

describe('dedupe', () => {
  it('drops an exact duplicate and counts it', () => {
    const r = dedupe([row('2026-09-14T06:15', '3.9'), row('2026-09-14T06:15', '3.9'), row('2026-09-14T06:00', '3.8')]);
    expect(r.rows).toHaveLength(2);
    expect(r.exactDuplicates).toBe(1);
    expect(r.conflicts).toBe(0);
  });

  it('keeps both values of a conflicting duplicate and flags them', () => {
    const r = dedupe([row('2026-09-14T06:15', '3.9'), row('2026-09-14T06:15', '4.9')]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.every((x) => x.status === 'conflict')).toBe(true);
  });

  it('treats "3.90" and "3.9" as the same value, and ERR next to a number as no conflict', () => {
    const r = dedupe([row('2026-09-14T06:15', '3.9'), row('2026-09-14T06:15', '3.90'), row('2026-09-14T06:15', 'ERR')]);
    expect(r.exactDuplicates).toBe(1);
    expect(r.conflicts).toBe(0);
    expect(r.rows.find((x) => x.originalValue === 'ERR')!.status).toBe('error');
  });

  it('is idempotent and order-independent: importing the same rows again changes nothing', () => {
    const week = [row('2026-09-14T06:00', '3.8'), row('2026-09-14T06:15', '3.9'), row('2026-09-14T06:15', '4.9'), row('2026-09-14T06:30', 'ERR')];
    const once = dedupe(week).rows;
    const twice = dedupe([...once, ...[...week].reverse()]).rows;
    const key = (rs: Keyed[]) => rs.map((x) => `${x.ts}|${x.originalValue}|${x.status}`).sort();
    expect(key(twice)).toEqual(key(once));
    expect(key(markConflicts([...once].reverse()))).toEqual(key(once));
  });
});

describe('gaps', () => {
  it('finds the 2h15m Jerusalem gap even with only three readings (mode, not median)', () => {
    const times = ['2026-09-14T06:00', '2026-09-14T06:15', '2026-09-14T08:30'].map(m);
    expect(typicalInterval(times)).toBe(15);
    const gaps = findGaps(times);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].minutes).toBe(135);
  });

  it('does not assume 15 minutes: a 60-minute logger has no gap at 60 minutes', () => {
    const times = [0, 60, 120, 180, 240].map((x) => m('2026-09-14T00:00') + x);
    expect(typicalInterval(times)).toBe(60);
    expect(findGaps(times)).toHaveLength(0);
  });

  it('splits a logger series where the fridge changes: the delta across a move is not a gap (D38)', () => {
    const pts = [
      ['2026-09-17T06:00', 'Display 2'],
      ['2026-09-14T06:00', 'Walk-in'],
      ['2026-09-14T06:15', 'Walk-in'],
      ['2026-09-17T06:15', 'Display 2'],
      ['2026-09-18T06:00', 'Walk-in'], // moved back: a second move, still no gap
    ].map(([ts, fridge]) => ({ t: m(ts), fridge }));
    const runs = fridgeRuns(pts);
    expect(runs.map((r) => [r.fridge, r.times.length])).toEqual([['Walk-in', 2], ['Display 2', 2], ['Walk-in', 1]]);
    expect(runs.flatMap((r) => findGaps(r.times, 15))).toEqual([]);
    expect(fridgeMoves(runs)).toEqual([
      { atMin: m('2026-09-17T06:00'), from: 'Walk-in', to: 'Display 2' },
      { atMin: m('2026-09-18T06:00'), from: 'Display 2', to: 'Walk-in' },
    ]);
  });
});

describe('events (D6-D8)', () => {
  it('door-open spike on a 15-min logger is a spike, not red (max exactly 30 min: boundary)', () => {
    const e = findExcursions(pts([['2026-09-14T05:45', 4.0], ['2026-09-14T06:00', 4.1], ['2026-09-14T06:15', 9.4], ['2026-09-14T06:30', 4.3]]), 5);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ class: 'spike', minMinutes: 0, maxMinutes: 30, peak: 9.4 });
  });

  it('the D6 example: 06:00 ok, 06:15 6.0, 06:30 7.0, 06:45 ok -> min 15, max 45, unverified', () => {
    const e = findExcursions(pts([['2026-09-14T06:00', 4.0], ['2026-09-14T06:15', 6.0], ['2026-09-14T06:30', 7.0], ['2026-09-14T06:45', 4.2]]), 5);
    expect(e[0]).toMatchObject({ minMinutes: 15, maxMinutes: 45, durationKnown: true, class: 'unverified' });
  });

  it('sustained excursion (provably over 30 min) is red', () => {
    const list: [string, number][] = [['2026-09-14T06:00', 4.0]];
    for (let i = 1; i <= 5; i++) list.push([fromMinutes(m('2026-09-14T06:00') + i * 15), 6.5]);
    list.push(['2026-09-14T07:30', 4.5]);
    const e = findExcursions(pts(list), 5);
    expect(e[0]).toMatchObject({ class: 'sustained', minMinutes: 60, maxMinutes: 90 });
  });

  it('one high reading on a 60-min logger cannot be verified (orange, not spike)', () => {
    const e = findExcursions(pts([['2026-09-19T10:00', 3.5], ['2026-09-19T11:00', 6.8], ['2026-09-19T12:00', 3.6]]), 5);
    expect(e[0]).toMatchObject({ class: 'unverified', minMinutes: 0, maxMinutes: 120 });
  });

  it('excursion cut by a gap has unknown duration; only the lower bound is given', () => {
    const p = pts([['2026-09-14T06:00', 4.0], ['2026-09-14T06:15', 6.0], ['2026-09-14T06:30', 6.5], ['2026-09-14T10:00', 4.1]]);
    const gaps = findGaps(p.map((x) => x.t), 15);
    const e = findExcursions(p, 5, gaps);
    expect(e[0]).toMatchObject({ durationKnown: false, maxMinutes: null, minMinutes: 15, gapAfter: true, class: 'unverified' });
  });

  it('strictly above: exactly 5.0 is not an excursion (D2)', () => {
    expect(findExcursions(pts([['2026-09-14T06:00', 5.0], ['2026-09-14T06:15', 5.0]]), 5)).toHaveLength(0);
  });

  it('an ERR inside an excursion does not split it and is counted', () => {
    const e = findExcursions(pts([['2026-09-14T06:00', 4], ['2026-09-14T06:15', 6], ['2026-09-14T06:30', null], ['2026-09-14T06:45', 6.2], ['2026-09-14T07:00', 4]]), 5);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ errorsInside: 1, minMinutes: 30, maxMinutes: 60 });
  });

  it('still above at the last reading is ongoing (red)', () => {
    const e = findExcursions(pts([['2026-09-14T06:00', 4.6], ['2026-09-14T06:15', 5.4], ['2026-09-14T06:30', 6.3]]), 5);
    expect(e[0]).toMatchObject({ class: 'ongoing', ongoing: true, maxMinutes: null });
  });
});

// Rishon / Dairy (D21): baseline ~3.0 for 4.5 days, then a slow rise of 0.055 °C/h.
function rishonDairy(): Reading[] {
  const start = m('2026-09-14T00:00');
  const riseStart = m('2026-09-18T12:00');
  const out: Reading[] = [];
  for (let t = start; t <= m('2026-09-20T23:45'); t += 15) {
    const base = 3.0 + 0.15 * Math.sin((t / 60 / 24) * 2 * Math.PI);
    const temp = t < riseStart ? base : base + ((t - riseStart) / 60) * 0.055;
    out.push({ loggerId: 'TL-0390', ts: fromMinutes(t), tempC: Math.round(temp * 100) / 100, status: 'ok' });
  }
  return out;
}

describe('trend (D10) - Rishon slow warm-up', () => {
  const readings = rishonDairy();
  const crossing = readings.find((r) => (r.tempC as number) > 5)!.ts;
  const analyzeAt = (asOf: string) =>
    analyzeFridge({ readings: readings.filter((r) => r.ts <= asOf), threshold: 5, asOf, windowStart: fromMinutes(m(asOf) - 1440), hasLogger: true });

  it('warns (orange) before the fridge crosses 5.0', () => {
    const pointsT = readings.map((r) => ({ t: m(r.ts), temp: r.tempC as number }));
    const warn = firstWarning(pointsT, m('2026-09-17T00:00'), m('2026-09-20T23:45'));
    expect(warn).not.toBeNull();
    expect(warn!).toBeLessThan(m(crossing));
    const a = analyzeAt(fromMinutes(warn!));
    expect(a.level).toBe('orange');
    expect(a.reasons[0].code).toBe('warming');
    expect(a.lastReading!.tempC!).toBeLessThan(5);
    // lead time worth having: at least 6 hours of warning before the threshold
    expect(m(crossing) - warn!).toBeGreaterThanOrEqual(6 * 60);
  });

  it('is red after it crosses 5.0', () => {
    const later = fromMinutes(m(crossing) + 60);
    expect(analyzeAt(later).level).toBe('red');
  });

  it('gives no trend alert without 3 days of history', () => {
    const pointsT = readings.slice(0, 4 * 24 * 2).map((r) => ({ t: m(r.ts), temp: r.tempC as number }));
    expect(evaluateTrend(pointsT, pointsT[pointsT.length - 1].t).state).toBe('insufficient_history');
  });

  it('a stable fridge with door spikes is not warming', () => {
    const stable = readings.filter((r) => r.ts < '2026-09-18T12:00').map((r) => ({ t: m(r.ts), temp: r.tempC as number }));
    stable.push({ t: m('2026-09-18T11:50'), temp: 9.4 });
    expect(evaluateTrend(stable, m('2026-09-18T11:55')).state).toBe('stable');
  });
});

describe('status (D11, D22, D23)', () => {
  const base = (ts: string, temp: number | null, status: Reading['status'] = 'ok'): Reading => ({ loggerId: 'TL-1000', ts, tempC: temp, status });
  const steady = (from: string, to: string): Reading[] => {
    const out: Reading[] = [];
    for (let t = m(from); t <= m(to); t += 30) out.push(base(fromMinutes(t), 3.5));
    return out;
  };

  it('green when everything is normal', () => {
    const a = analyzeFridge({ readings: steady('2026-09-19T00:00', '2026-09-20T23:30'), threshold: 5, asOf: '2026-09-20T23:30', windowStart: '2026-09-20T00:00', hasLogger: true });
    expect(a.level).toBe('green');
  });

  it('grey, not green, when there is no data at all', () => {
    const a = analyzeFridge({ readings: [], threshold: 5, asOf: '2026-09-20T23:30', windowStart: '2026-09-20T00:00', hasLogger: true });
    expect(a.level).toBe('grey');
    expect(a.reasons.map((r) => r.code)).toContain('no_data');
  });

  it('D48: grey "low_coverage" when readings cover less than 80% of the window; full coverage stays green', () => {
    const week = { threshold: 5, asOf: '2026-09-20T23:30', windowStart: '2026-09-13T23:30', hasLogger: true };
    // readings only on the last 2 days of a 7-day window: about 29% covered
    const a = analyzeFridge({ ...week, readings: steady('2026-09-19T00:00', '2026-09-20T23:30') });
    expect(a.level).toBe('grey');
    const r = a.reasons.find((x) => x.code === 'low_coverage')!;
    expect(r).toMatchObject({ level: 'grey' });
    expect(r.params.percent).toBeGreaterThan(25);
    expect(r.params.percent).toBeLessThan(35);
    // the whole week has readings: green, no low_coverage
    const full = analyzeFridge({ ...week, readings: steady('2026-09-13T00:00', '2026-09-20T23:30') });
    expect(full.level).toBe('green');
    expect(full.reasons.map((x) => x.code)).not.toContain('low_coverage');
  });

  it('grey when the data stopped (stale) and when the fridge has no logger', () => {
    const a = analyzeFridge({ readings: steady('2026-09-19T00:00', '2026-09-20T10:00'), threshold: 5, asOf: '2026-09-20T23:30', windowStart: '2026-09-20T00:00', hasLogger: false });
    expect(a.level).toBe('grey');
    expect(a.reasons.map((r) => r.code)).toEqual(['no_logger', 'stale']);
  });

  it('grey for repeated ERR readings', () => {
    const r = steady('2026-09-20T00:00', '2026-09-20T23:30');
    for (let i = 0; i < 3; i++) r[10 + i] = { ...r[10 + i], tempC: null, status: 'error' };
    expect(analyzeFridge({ readings: r, threshold: 5, asOf: '2026-09-20T23:30', windowStart: '2026-09-20T00:00', hasLogger: true }).level).toBe('grey');
  });

  it('red wins over grey, and both reasons are listed', () => {
    const r = steady('2026-09-20T00:00', '2026-09-20T12:00');
    r.push(base('2026-09-20T18:00', 7.0), base('2026-09-20T18:30', 7.2));
    const a = analyzeFridge({ readings: r, threshold: 5, asOf: '2026-09-20T18:30', windowStart: '2026-09-20T00:00', hasLogger: true });
    expect(a.level).toBe('red');
    expect(a.reasons.map((x) => x.code)).toContain('gap');
  });

  it('a finished sustained excursion says when it was back to normal (a past event must not read as "too warm now")', () => {
    const r = steady('2026-09-20T00:00', '2026-09-20T23:30');
    for (const ts of ['2026-09-20T10:00', '2026-09-20T10:30', '2026-09-20T11:00']) r[r.findIndex((x) => x.ts === ts)] = base(ts, 7.0);
    const a = analyzeFridge({ readings: r, threshold: 5, asOf: '2026-09-20T23:30', windowStart: '2026-09-20T00:00', hasLogger: true });
    const reason = a.reasons.find((x) => x.code === 'sustained')!;
    expect(reason.params).toMatchObject({ at: m('2026-09-20T10:00'), nextOk: m('2026-09-20T11:30') });
  });

  it('D36: a sustained excursion that already ended is "was_red", not red and not green', () => {
    const r = steady('2026-09-20T00:00', '2026-09-20T23:30');
    for (const ts of ['2026-09-20T10:00', '2026-09-20T10:30', '2026-09-20T11:00']) r[r.findIndex((x) => x.ts === ts)] = base(ts, 7.0);
    const a = analyzeFridge({ readings: r, threshold: 5, asOf: '2026-09-20T23:30', windowStart: '2026-09-20T00:00', hasLogger: true });
    expect(a.level).toBe('was_red');
    expect(a.reasons.map((x) => `${x.level}:${x.code}`)).toEqual(['was_red:sustained']);
  });

  it('D36: "was_red" ranks after red and before orange and grey', () => {
    // a finished excursion in the morning, then a gap: was_red wins over grey, both listed
    const r = steady('2026-09-20T00:00', '2026-09-20T12:00').filter((x) => x.ts < '2026-09-20T15:00');
    for (const ts of ['2026-09-20T08:00', '2026-09-20T08:30', '2026-09-20T09:00']) r[r.findIndex((x) => x.ts === ts)] = base(ts, 7.0);
    r.push(...steady('2026-09-20T18:00', '2026-09-20T23:30'));
    const a = analyzeFridge({ readings: r, threshold: 5, asOf: '2026-09-20T23:30', windowStart: '2026-09-20T00:00', hasLogger: true });
    expect(a.level).toBe('was_red');
    expect(a.reasons.map((x) => x.code)).toEqual(['sustained', 'gap']);
    expect(['red', 'was_red', 'orange', 'grey', 'green'].map((l) => levelRank(l as Level))).toEqual([0, 1, 2, 3, 4]);
  });

  it('D36: still above at the last reading stays red, even with a finished excursion earlier', () => {
    const r = steady('2026-09-20T00:00', '2026-09-20T22:30');
    for (const ts of ['2026-09-20T08:00', '2026-09-20T08:30', '2026-09-20T09:00']) r[r.findIndex((x) => x.ts === ts)] = base(ts, 7.0);
    r.push(base('2026-09-20T23:00', 6.5), base('2026-09-20T23:30', 6.9));
    const a = analyzeFridge({ readings: r, threshold: 5, asOf: '2026-09-20T23:30', windowStart: '2026-09-20T00:00', hasLogger: true });
    expect(a.level).toBe('red');
    expect(a.reasons.map((x) => `${x.level}:${x.code}`)).toEqual(['red:ongoing', 'was_red:sustained']);
  });

  it('an unverified excursion reason carries its peak value', () => {
    const r = steady('2026-09-20T00:00', '2026-09-20T23:30');
    r[r.findIndex((x) => x.ts === '2026-09-20T15:00')] = base('2026-09-20T15:00', 6.8);
    const a = analyzeFridge({ readings: r, threshold: 5, asOf: '2026-09-20T23:30', windowStart: '2026-09-20T00:00', hasLogger: true });
    expect(a.level).toBe('orange');
    expect(a.reasons.find((x) => x.code === 'unverified')!.params).toMatchObject({ at: m('2026-09-20T15:00'), peak: 6.8 });
  });
});

describe('assignments (D1, D25) - TL-0417 moved Walk-in -> Display 2', () => {
  const WALK_IN = 1, DISPLAY_2 = 2;
  const rows = [
    { loggerId: 'TL-0417', ts: '2026-09-14T06:00', fridgeId: WALK_IN },
    { loggerId: 'TL-0417', ts: '2026-09-16T23:45', fridgeId: WALK_IN },
    { loggerId: 'TL-0417', ts: '2026-09-17T06:00', fridgeId: DISPLAY_2 },
    { loggerId: 'TL-0417', ts: '2026-09-14T05:45', fridgeId: WALK_IN },
  ];

  it('resolves which fridge the logger was in at each time', () => {
    const hist = rebuildAssignments('TL-0417', [], changePointsFromRows(rows).get('TL-0417')!);
    expect(hist).toEqual([
      { loggerId: 'TL-0417', fridgeId: WALK_IN, validFrom: '2026-09-14T05:45', validTo: '2026-09-17T06:00' },
      { loggerId: 'TL-0417', fridgeId: DISPLAY_2, validFrom: '2026-09-17T06:00', validTo: null },
    ]);
    expect(fridgeAt(hist, 'TL-0417', '2026-09-15T12:00')).toBe(WALK_IN);
    expect(fridgeAt(hist, 'TL-0417', '2026-09-18T12:00')).toBe(DISPLAY_2);
    expect(hasOverlap(hist)).toBe(false);
  });

  it('D44: the fridge for a raw-file row follows the history, and uses the first period before it starts', () => {
    const hist = rebuildAssignments('TL-0417', [], changePointsFromRows(rows).get('TL-0417')!);
    expect(fridgeForRow(hist, 'TL-0417', '2026-09-13T06:00')).toBe(WALK_IN); // before the first known period
    expect(fridgeForRow(hist, 'TL-0417', '2026-09-16T06:00')).toBe(WALK_IN);
    expect(fridgeForRow(hist, 'TL-0417', '2026-09-17T06:15')).toBe(DISPLAY_2);
    expect(fridgeForRow(hist, 'TL-9999', '2026-09-17T06:15')).toBeNull(); // no history at all
  });

  it('re-importing an older week does not change the history', () => {
    const hist = rebuildAssignments('TL-0417', [], changePointsFromRows(rows).get('TL-0417')!);
    const again = rebuildAssignments('TL-0417', hist, changePointsFromRows(rows.slice(0, 2)).get('TL-0417')!);
    expect(again).toEqual(hist);
  });

  it('tells an unchanged history from a changed one, so the DB is only rewritten when needed', () => {
    const hist = rebuildAssignments('TL-0417', [], changePointsFromRows(rows).get('TL-0417')!);
    expect(sameAssignments(hist, hist.map((a) => ({ ...a })))).toBe(true);
    expect(sameAssignments(hist, hist.slice(0, 1))).toBe(false);
    expect(sameAssignments(hist, [hist[0], { ...hist[1], validFrom: '2026-09-17T06:15' }])).toBe(false);
    expect(sameAssignments(hist, [hist[0], { ...hist[1], fridgeId: WALK_IN }])).toBe(false);
  });
});

describe('inspector report', () => {
  it('says plainly when nothing went above, and that gaps are unknown', () => {
    const r = inspectorReport({
      fridgeLabel: 'Jerusalem / Dairy', threshold: 5, from: '2026-09-14T00:00', to: '2026-09-14T23:59', events: [],
      gaps: [{ from: '2026-09-14T06:15', to: '2026-09-14T08:30', minutes: 135 }], readings: 3, errors: 0, conflicts: 0,
      firstReading: '2026-09-14T06:00', lastReading: '2026-09-14T08:30', fahrenheitLoggers: [], loggerPeriods: [],
      dataEnd: null, gapLimitMin: 37.5,
    });
    expect(r.headline).toMatch(/did not go above 5.0 °C/);
    expect(r.notes.join(' ')).toMatch(/2 h 15 min.*unknown/);
  });

  // D40: Haifa / Dairy in the email-only DB has 3 readings on 14 Sep 06:00-06:30; the latest data is 17 Sep 06:00.
  const haifa = {
    fridgeLabel: 'Haifa / Dairy', threshold: 5, from: '2026-09-10T00:00', to: '2026-09-17T23:59', events: [], gaps: [],
    readings: 3, errors: 1, conflicts: 0, firstReading: '2026-09-14T06:00', lastReading: '2026-09-14T06:30',
    fahrenheitLoggers: ['TL-0231'], loggerPeriods: [], dataEnd: '2026-09-17T06:00', gapLimitMin: 37.5,
  };

  it('D40: time before the first and after the last reading is missing data, not "did not go above"', () => {
    const r = inspectorReport(haifa);
    // 10 Sep 00:00 -> 17 Sep 06:00 (latest data) = 7 days 6 h; only 30 min of it has readings
    expect(r.headline).toBe(
      'In the recorded readings (14 Sep 2026 06:00 to 06:30) Haifa / Dairy did not go above 5.0 °C. ' +
        'There are no readings for 7 days 5 h of the 7 days 6 h in this period, so we cannot say what happened then.',
    );
    expect(r.coverage).toEqual({
      periodMinutes: 7 * 1440 + 360,
      missingMinutes: 7 * 1440 + 330,
      percent: 0.3,
      uncovered: [
        { from: '2026-09-10T00:00', to: '2026-09-14T06:00', minutes: 4 * 1440 + 360 },
        { from: '2026-09-14T06:30', to: '2026-09-17T06:00', minutes: 2 * 1440 + 1410 },
      ],
    });
    const notes = r.notes.join('\n');
    expect(notes).toMatch(/No readings from 10 Sep 2026 00:00 to 14 Sep 2026 06:00 \(4 days 6 h\), before the first reading/);
    expect(notes).toMatch(/No readings from 14 Sep 2026 06:30 to 17 Sep 2026 06:00 \(2 days 23 h\), after the last reading/);
    expect(notes).toMatch(/0\.3% of the period/);
    expect(notes).toMatch(/latest uploaded data ends at 17 Sep 2026 06:00/);
  });

  it('D40: a short start or end (within the gap limit) is not missing, and full coverage keeps the plain headline', () => {
    const r = inspectorReport({
      ...haifa, from: '2026-09-14T06:00', to: '2026-09-14T06:45', readings: 3, errors: 0, fahrenheitLoggers: [],
      firstReading: '2026-09-14T06:15', lastReading: '2026-09-14T06:45', dataEnd: '2026-09-17T06:00',
    });
    expect(r.coverage.uncovered).toEqual([]);
    expect(r.coverage.percent).toBe(100);
    expect(r.headline).toBe('Haifa / Dairy did not go above 5.0 °C in any recorded reading between 14 Sep 2026 06:00 and 14 Sep 2026 06:45.');
  });
});
