import { describe, it, expect } from 'vitest';
import { parseTime, detectDateFormat, parseDateAndTime } from './parseTime.ts';
import { parseTemp, valueKey } from './parseTemp.ts';
import { parseCsv } from './csv.ts';
import { canonicalize, normalizeLoggerId, loggerIdFromFilename } from './names.ts';
import { detectColumns } from './columns.ts';
import { toMinutes, fromMinutes, formatDuration } from './time.ts';
import { EMAIL_SAMPLE_TSV } from './fixtures/emailSample.ts';

describe('parseTime', () => {
  it('parses ISO and DD/MM/YYYY to the same local time, no timezone shift', () => {
    expect(parseTime('2026-09-14 06:00')).toBe('2026-09-14T06:00');
    expect(parseTime('14/09/2026 06:00', 'DMY')).toBe('2026-09-14T06:00');
    expect(parseTime('2026-09-14T06:15:00')).toBe('2026-09-14T06:15');
    expect(parseTime('14.09.2026 6:30')).toBe('2026-09-14T06:30');
  });

  it('detects DD/MM when a first part is over 12', () => {
    expect(detectDateFormat(['14/09/2026 06:00', '01/09/2026 06:00'])).toMatchObject({ order: 'DMY', ambiguous: false });
  });

  it('detects MM/DD when a second part is over 12', () => {
    const d = detectDateFormat(['09/14/2026 06:00']);
    expect(d).toMatchObject({ order: 'MDY', ambiguous: false });
    expect(parseTime('09/14/2026 06:00', d.order)).toBe('2026-09-14T06:00');
  });

  it('defaults ambiguous slashed dates to DD/MM and says it guessed', () => {
    const d = detectDateFormat(['03/09/2026 06:00', '04/09/2026 06:00']);
    expect(d).toMatchObject({ order: 'DMY', ambiguous: true });
    expect(parseTime('03/09/2026 06:00', d.order)).toBe('2026-09-03T06:00');
  });

  it('rejects impossible dates and dates without time', () => {
    expect(parseTime('31/02/2026 06:00')).toBeNull();
    expect(parseTime('2026-09-14')).toBeNull();
    expect(parseTime('ERR')).toBeNull();
    expect(parseTime('2026-09-14 25:00')).toBeNull();
  });

  it('joins separate date and time columns', () => {
    expect(parseDateAndTime('14/09/2026', '06:45')).toBe('2026-09-14T06:45');
  });

  it('does time arithmetic without timezones', () => {
    expect(toMinutes('2026-09-14T08:30') - toMinutes('2026-09-14T06:15')).toBe(135);
    expect(fromMinutes(toMinutes('2026-09-14T23:45') + 30)).toBe('2026-09-15T00:15');
    expect(formatDuration(135)).toBe('2 h 15 min');
  });
});

describe('parseTemp', () => {
  it('reads numbers, including comma decimals and a unit suffix', () => {
    expect(parseTemp('3.8')).toMatchObject({ value: 3.8, status: 'ok' });
    expect(parseTemp('-1,5')).toMatchObject({ value: -1.5, status: 'ok' });
    expect(parseTemp('38.3°F')).toMatchObject({ value: 38.3, unitHint: 'F' });
  });

  it('turns ERR, empty and text into an error reading, never 0', () => {
    for (const raw of ['ERR', '', '  ', 'n/a', 'sensor fault']) {
      const p = parseTemp(raw);
      expect(p.status).toBe('error');
      expect(p.value).toBeNull();
    }
  });

  it('compares values as numbers for duplicate detection', () => {
    expect(valueKey('3.90')).toBe(valueKey('3.9'));
    expect(valueKey('err')).toBe(valueKey('ERR'));
  });
});

describe('names', () => {
  it('matches name casing and spacing to one canonical name', () => {
    const m = canonicalize(['Tel Aviv', 'tel aviv', ' Tel  Aviv ', 'Tel Aviv']);
    expect(m.get('tel aviv')).toBe('Tel Aviv');
    expect(m.get(' Tel  Aviv ')).toBe('Tel Aviv');
  });

  it('prefers a name that already exists in the system', () => {
    expect(canonicalize(['TEL AVIV'], ['Tel Aviv']).get('TEL AVIV')).toBe('Tel Aviv');
  });

  it('normalizes logger ids and reads them from file names', () => {
    expect(normalizeLoggerId('tl 0417')).toBe('TL-0417');
    expect(loggerIdFromFilename('TL0240_week38.csv')).toBe('TL-0240');
    expect(loggerIdFromFilename('export.csv')).toBeNull();
  });
});

describe('csv + detectColumns', () => {
  it('reads the email sample (tab separated) as a 5-column sheet with a header', () => {
    const t = parseCsv(EMAIL_SAMPLE_TSV);
    expect(t.delimiter).toBe('\t');
    expect(t.rows).toHaveLength(17);
    const d = detectColumns(t);
    expect(d).toMatchObject({ ok: true, mode: 'sheet', hasHeader: true, columns: { logger: 0, branch: 1, fridge: 2, datetime: 3, temp: 4 } });
  });

  it('maps shifted columns by content, without a header', () => {
    const t = parseCsv('3.8;Jerusalem;2026-09-14 06:00;TL-0512;Dairy\n4.1;Jerusalem;2026-09-14 06:15;TL-0512;Dairy');
    const d = detectColumns(t, ['Jerusalem']);
    expect(d).toMatchObject({ ok: true, mode: 'sheet', hasHeader: false, columns: { temp: 0, branch: 1, datetime: 2, logger: 3, fridge: 4 } });
  });

  it('uses known branch names to tell branch from fridge', () => {
    const t = parseCsv('TL-0001,Dairy,Haifa,2026-09-14 06:00,3.1\nTL-0001,Dairy,Haifa,2026-09-14 06:15,3.2');
    expect(detectColumns(t, ['Haifa']).columns).toMatchObject({ branch: 2, fridge: 1 });
  });

  it('reads a raw logger file: temperature first, time second, no header', () => {
    const d = detectColumns(parseCsv('38.3,14/09/2026 06:00\nERR,14/09/2026 06:15\n39.0,14/09/2026 06:30'));
    expect(d).toMatchObject({ ok: true, mode: 'raw', columns: { temp: 0, datetime: 1 } });
  });

  it('reads a raw logger file with separate Date and Time columns and a °F header', () => {
    const d = detectColumns(parseCsv('Date,Time,Temp (°F)\n14/09/2026,06:00,38.3\n14/09/2026,06:15,39.0'));
    expect(d).toMatchObject({ ok: true, mode: 'raw', headerUnit: 'F', columns: { date: 0, clock: 1, temp: 2 } });
  });

  it('explains when a file has no temperature column', () => {
    const d = detectColumns(parseCsv('a,b\nx,2026-09-14 06:00'));
    expect(d.ok).toBe(false);
    expect(d.error).toMatch(/temperature/);
  });
});
