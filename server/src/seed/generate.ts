// Deterministic demo data (INIT Stage C, D21, D31). Pure: returns file texts and the decisions Summer
// would make in the upload preview. index.ts writes them to sample-data/ and imports them through the
// real import service, so the seed is also an integration test of the import path.
//
// Generated data runs 2026-09-10 .. 2026-09-20 (the demo week is 14-20 Sep; the 4 days before give the
// trend rule its >= 3 days of history, D10).
import { toMinutes, fromMinutes, type LocalTs } from '../core/time.ts';
import { parseTime } from '../core/parseTime.ts';
import { EMAIL_SAMPLE_TSV } from '../core/fixtures/emailSample.ts';
import type { Unit } from '../core/units.ts';
import type { UploadFile, Decisions } from '../services/importService.ts';
import { mulberry32, seedFromString } from './prng.ts';

export const DATA_START: LocalTs = '2026-09-10T00:00';
export const DATA_END: LocalTs = '2026-09-20T23:45';
/** Upload time stored on the imports (fixed, so the DB is the same on every run). */
export const UPLOADED_AT: LocalTs = '2026-09-21T08:00';

type Special = number | 'ERR' | 'skip' | undefined;

interface Spec {
  branch: string;
  fridge: string;
  logger: string;
  interval: 15 | 30 | 60;
  /** unit the logger records in; values are generated in °C and converted for 'F' */
  unit: Unit;
  base: number;
  noise?: number;
  source: 'sheetA' | 'sheetB' | 'raw';
  rawShape?: 1 | 2 | 3;
  rawFile?: string;
  from?: LocalTs;
  to?: LocalTs;
  /** a fixed value, an ERR, or 'skip' (no reading) at this time; undefined = normal reading */
  special?: (t: number) => Special;
}

export interface Reading { ts: LocalTs; value: string }

const m = toMinutes;
const at = (ts: LocalTs) => (t: number) => t === m(ts);
const round1 = (n: number) => Math.round(n * 10) / 10;

// --- the stories ---------------------------------------------------------------------------------
const RISHON_DAIRY_WARMUP_FROM = m('2026-09-18T00:00');
const PETAH_TIKVA_WARMUP_FROM = m('2026-09-20T08:00');

const CREAM_CAKES_AFTER_EMAIL: Record<string, number> = {
  // the email rows end at 06:45 7.1 (still rising); the fridge peaks and is fixed by 08:15 (D21)
  '2026-09-14T07:00': 7.4,
  '2026-09-14T07:15': 7.2,
  '2026-09-14T07:30': 6.6,
  '2026-09-14T07:45': 5.8,
  '2026-09-14T08:00': 5.2,
  '2026-09-14T08:15': 4.6,
};

export const SPECS: Spec[] = [
  // Sheet A: the four branches from the email, Summer's tab-separated weekly sheet
  // Jerusalem: keeps the email's 2h15m gap (06:15 -> 08:30 on 14 Sep): grey
  { branch: 'Jerusalem', fridge: 'Dairy', logger: 'TL-0512', interval: 15, unit: 'C', base: 3.6, source: 'sheetA',
    special: (t) => (t >= m('2026-09-14T06:00') && t <= m('2026-09-14T08:30') ? 'skip' : undefined) },
  { branch: 'Jerusalem', fridge: 'Bread fillings', logger: 'TL-0513', interval: 30, unit: 'C', base: 3.2, source: 'sheetA' },
  // Tel Aviv: door spikes; TL-0417 moves Walk-in -> Display 2 on 17 Sep 06:00, Walk-in is left without a logger (grey)
  { branch: 'Tel Aviv', fridge: 'Walk-in', logger: 'TL-0417', interval: 15, unit: 'C', base: 3.9, noise: 0.2, source: 'sheetA', to: '2026-09-17T05:45' },
  { branch: 'Tel Aviv', fridge: 'Display 2', logger: 'TL-0417', interval: 15, unit: 'C', base: 3.4, source: 'sheetA', from: '2026-09-17T06:00',
    special: (t) => (at('2026-09-19T09:00')(t) ? 6.8 : undefined) },
  { branch: 'Tel Aviv', fridge: 'Display 1', logger: 'TL-0418', interval: 15, unit: 'C', base: 3.5, source: 'sheetA',
    special: (t) => (at('2026-09-15T12:15')(t) ? 8.1 : at('2026-09-18T17:30')(t) ? 7.6 : undefined) },
  // Haifa: TL-0231 records Fahrenheit (38.3 F = 3.5 C, not 3.83)
  { branch: 'Haifa', fridge: 'Dairy', logger: 'TL-0231', interval: 15, unit: 'F', base: 3.6, source: 'sheetA' },
  { branch: 'Haifa', fridge: 'Cakes', logger: 'TL-0232', interval: 30, unit: 'C', base: 3.8, source: 'sheetA' },
  // Rishon LeZion: Cream cakes = the email's fast rise, continues to 7.4, fixed by 08:15 (sustained: red)
  { branch: 'Rishon LeZion', fridge: 'Cream cakes', logger: 'TL-0388', interval: 15, unit: 'C', base: 3.9, noise: 0.2, source: 'sheetA',
    special: (t) => CREAM_CAKES_AFTER_EMAIL[fromMinutes(t)] },
  // Rishon LeZion: Dairy = Summer's slow two-day warm-up, from 18 Sep at 0.055 °C/h: orange first, red after 5.0
  { branch: 'Rishon LeZion', fridge: 'Dairy', logger: 'TL-0389', interval: 15, unit: 'C', base: 3.0, noise: 0.15, source: 'sheetA',
    special: (t) => (t >= RISHON_DAIRY_WARMUP_FROM ? round1(3.0 + (0.055 * (t - RISHON_DAIRY_WARMUP_FROM)) / 60) : undefined) },
  { branch: 'Rishon LeZion', fridge: 'Drinks', logger: 'TL-0390', interval: 60, unit: 'C', base: 3.3, source: 'sheetA' },

  // Sheet B: shifted columns, no header, semicolons, comma decimals, mixed casing
  // Petah Tikva: Cheese warming now (from 20 Sep 08:00), still below 5 at the end: orange
  { branch: 'Petah Tikva', fridge: 'Cheese', logger: 'TL-0450', interval: 15, unit: 'C', base: 2.5, noise: 0.2, source: 'sheetB',
    special: (t) => (t >= PETAH_TIKVA_WARMUP_FROM ? round1(2.5 + (1.8 * (t - PETAH_TIKVA_WARMUP_FROM)) / 945) : undefined) },
  { branch: 'Petah Tikva', fridge: 'Dairy', logger: 'TL-0451', interval: 30, unit: 'C', base: 3.4, source: 'sheetB' },
  // Netanya: battery gap 16 Sep 10:00 -> 17 Sep 02:00: grey
  { branch: 'Netanya', fridge: 'Dairy', logger: 'TL-0460', interval: 30, unit: 'C', base: 3.5, source: 'sheetB',
    special: (t) => (t > m('2026-09-16T10:00') && t < m('2026-09-17T02:00') ? 'skip' : undefined) },
  { branch: 'Netanya', fridge: 'Walk-in', logger: 'TL-0461', interval: 15, unit: 'C', base: 3.7, source: 'sheetB' },
  // Ashdod: repeated ERR on the walk-in: grey
  { branch: 'Ashdod', fridge: 'Walk-in', logger: 'TL-0470', interval: 15, unit: 'C', base: 3.6, source: 'sheetB',
    special: (t) => (['2026-09-19T03:00', '2026-09-19T03:15', '2026-09-19T03:30', '2026-09-19T15:00'].some((ts) => at(ts)(t)) ? 'ERR' : undefined) },
  { branch: 'Ashdod', fridge: 'Cream cakes', logger: 'TL-0471', interval: 30, unit: 'C', base: 3.3, source: 'sheetB' },
  { branch: 'Ashdod', fridge: 'Display', logger: 'TL-0472', interval: 30, unit: 'C', base: 3.9, noise: 0.2, source: 'sheetB' },
  { branch: 'Ashdod', fridge: 'Drinks', logger: 'TL-0473', interval: 60, unit: 'C', base: 4.0, noise: 0.2, source: 'sheetB' },
  // Holon: Drinks gets conflicts from holon-corrections.csv (info, not a colour)
  { branch: 'Holon', fridge: 'Drinks', logger: 'TL-0480', interval: 30, unit: 'C', base: 3.8, noise: 0.2, source: 'sheetB' },
  { branch: 'Holon', fridge: 'Dairy', logger: 'TL-0481', interval: 15, unit: 'C', base: 3.2, source: 'sheetB' },
  // Herzliya: Dairy is in sheet B until 16 Sep, then a raw logger file whose fridge comes from the history (D25)
  { branch: 'Herzliya', fridge: 'Dairy', logger: 'TL-0490', interval: 15, unit: 'C', base: 3.4, source: 'sheetB', to: '2026-09-16T23:45' },
  { branch: 'Herzliya', fridge: 'Dairy', logger: 'TL-0490', interval: 15, unit: 'C', base: 3.4, source: 'raw', rawShape: 3, rawFile: 'TL0490.csv', from: '2026-09-17T00:00' },
  { branch: 'Herzliya', fridge: 'Cakes', logger: 'TL-0491', interval: 30, unit: 'C', base: 3.6, source: 'sheetB' },

  // Raw logger files (time + temperature only), three shapes; branch/fridge chosen in the preview
  // Beersheba: a 60-min logger with one high reading: cannot be verified (orange)
  { branch: 'Beersheba', fridge: 'Bakery cooler', logger: 'TL-0501', interval: 60, unit: 'C', base: 3.5, source: 'raw', rawShape: 1, rawFile: 'TL-0501_week37-38.csv',
    special: (t) => (at('2026-09-16T14:00')(t) ? 6.2 : undefined) },
  { branch: 'Beersheba', fridge: 'Dairy', logger: 'TL-0502', interval: 15, unit: 'C', base: 3.3, source: 'raw', rawShape: 2, rawFile: 'export_TL-0502.csv' },
  { branch: 'Bnei Brak', fridge: 'Dairy', logger: 'TL-0521', interval: 30, unit: 'C', base: 3.1, source: 'raw', rawShape: 3, rawFile: 'TL0521.csv' },
  { branch: 'Bnei Brak', fridge: 'Walk-in', logger: 'TL-0522', interval: 15, unit: 'C', base: 3.8, noise: 0.2, source: 'raw', rawShape: 1, rawFile: 'TL-0522_week37-38.csv' },
  { branch: 'Ramat Gan', fridge: 'Dairy', logger: 'TL-0531', interval: 15, unit: 'C', base: 3.4, source: 'raw', rawShape: 2, rawFile: 'export_TL-0531.csv' },
  { branch: 'Ramat Gan', fridge: 'Display', logger: 'TL-0532', interval: 30, unit: 'C', base: 3.7, source: 'raw', rawShape: 3, rawFile: 'TL0532.csv' },
];

// --- generation ----------------------------------------------------------------------------------

/** (logger|ts) of every email row: the generator leaves those times to the verbatim email rows. */
function emailTimes(): Set<string> {
  const out = new Set<string>();
  for (const line of EMAIL_SAMPLE_TSV.split('\n').slice(1)) {
    const [logger, , , time] = line.split('\t');
    out.add(`${logger}|${parseTime(time, 'DMY')}`);
  }
  return out;
}

function fmt(c: number, unit: Unit): string {
  return (unit === 'F' ? round1((c * 9) / 5 + 32) : round1(c)).toFixed(1);
}

export function series(spec: Spec, skipTimes: Set<string> = emailTimes()): Reading[] {
  const rnd = mulberry32(seedFromString(`${spec.logger}|${spec.branch}|${spec.fridge}`));
  const noise = spec.noise ?? 0.25;
  const out: Reading[] = [];
  const end = m(spec.to ?? DATA_END);
  for (let t = m(spec.from ?? DATA_START); t <= end; t += spec.interval) {
    const r = rnd(); // drawn for every slot, so a special value never shifts the rest of the series
    const ts = fromMinutes(t);
    if (skipTimes.has(`${spec.logger}|${ts}`)) continue;
    const s = spec.special?.(t);
    if (s === 'skip') continue;
    if (s === 'ERR') { out.push({ ts, value: 'ERR' }); continue; }
    out.push({ ts, value: fmt(typeof s === 'number' ? s : spec.base + (r * 2 - 1) * noise, spec.unit) });
  }
  return out;
}

const iso = (ts: LocalTs) => ts.replace('T', ' ');
const dmy = (ts: LocalTs) => {
  const [d, time] = ts.split('T');
  const [y, mo, day] = d.split('-');
  return `${day}/${mo}/${y} ${time}`;
};
const comma = (v: string) => v.replace('.', ',');

/** Mixed casing in sheet B, on a minority of rows so the proper spelling wins (names.ts). */
function branchAsTyped(branch: string, ts: LocalTs): string {
  const day = ts.slice(8, 10);
  if (day === '12') return ({ 'Petah Tikva': 'petah tikva', Netanya: 'NETANYA', Ashdod: 'ashdod', Holon: 'Holon ' } as Record<string, string>)[branch] ?? branch;
  if (day === '15' && branch === 'Petah Tikva') return 'Petah  Tikva';
  return branch;
}
const fridgeAsTyped = (fridge: string, ts: LocalTs) => (ts.slice(8, 10) === '13' && fridge === 'Dairy' ? 'dairy' : fridge);

function sheetA(from: LocalTs, to: LocalTs, withEmail: boolean): string {
  const lines = ['Logger\tBranch\tFridge\tTime\tTemp'];
  if (withEmail) lines.push(...EMAIL_SAMPLE_TSV.split('\n').slice(1)); // the 16 email rows, verbatim (D20)
  for (const spec of SPECS.filter((s) => s.source === 'sheetA')) {
    const time = spec.branch === 'Haifa' ? dmy : iso; // Haifa writes DD/MM/YYYY, like in the email
    for (const r of series(spec)) if (r.ts >= from && r.ts <= to) lines.push([spec.logger, spec.branch, spec.fridge, time(r.ts), r.value].join('\t'));
  }
  return lines.join('\n') + '\n';
}

function sheetB(): string {
  // columns: temp; branch; time; logger; fridge. No header.
  const lines: string[] = [];
  for (const spec of SPECS.filter((s) => s.source === 'sheetB'))
    for (const r of series(spec)) lines.push([comma(r.value), branchAsTyped(spec.branch, r.ts), dmy(r.ts), spec.logger, fridgeAsTyped(spec.fridge, r.ts)].join(';'));
  return lines.join('\n') + '\n';
}

function holonCorrections(): string {
  // Summer re-pasted part of Holon's week: 3 rows already in sheet B (exact duplicates) and 2 rows with a
  // different value at the same time (conflicts: both kept, D14)
  const drinks = series(SPECS.find((s) => s.logger === 'TL-0480')!);
  const value = (ts: LocalTs) => drinks.find((r) => r.ts === ts)!.value;
  const lines = ['Time,Temp,Logger,Fridge,Branch'];
  for (const ts of ['2026-09-18T09:00', '2026-09-18T09:30', '2026-09-18T11:00']) lines.push(`${iso(ts)},${value(ts)},TL-0480,Drinks,Holon`);
  lines.push(`${iso('2026-09-18T10:00')},${(Number(value('2026-09-18T10:00')) + 0.7).toFixed(1)},TL-0480,Drinks,Holon`);
  lines.push(`${iso('2026-09-18T10:30')},${(Number(value('2026-09-18T10:30')) + 0.5).toFixed(1)},TL-0480,Drinks,Holon`);
  return lines.join('\n') + '\n';
}

function rawFile(spec: Spec): string {
  const rows = series(spec);
  if (spec.rawShape === 1) {
    // separate Date and Time columns, DD/MM, unit in the header
    return ['Date,Time,Temp (°C)', ...rows.map((r) => { const [d, t] = dmy(r.ts).split(' '); return `${d},${t},${r.value}`; })].join('\n') + '\n';
  }
  if (spec.rawShape === 2) {
    // no header, temperature first, semicolons and comma decimals
    return rows.map((r) => `${comma(r.value)};${dmy(r.ts)}`).join('\n') + '\n';
  }
  // ISO with seconds, tab separated
  return ['Timestamp\tTemperature', ...rows.map((r) => `${r.ts}:00\t${r.value}`)].join('\n') + '\n';
}

function newLoggerFile(): string {
  // An unknown logger in °F, NOT imported by the seed: upload it to try the preview (D3, D26, D27)
  const spec: Spec = { branch: '', fridge: '', logger: 'TL-0240', interval: 15, unit: 'F', base: 3.4, source: 'raw', from: '2026-09-20T00:00' };
  return ['Date,Time,Temp', ...series(spec).map((r) => { const [d, t] = dmy(r.ts).split(' '); return `${d},${t},${r.value}`; })].join('\n') + '\n';
}

export interface SeedFiles {
  /** sheets: imported first, they create the branches, fridges and logger history */
  batch1: UploadFile[];
  decisions1: Decisions;
  /** raw logger files: imported second, so TL0490.csv finds its fridge in the history */
  batch2: UploadFile[];
  decisions2: Decisions;
  /** written to sample-data/ only, for trying the upload */
  extra: UploadFile[];
}

const unitsFor = (specs: Spec[]) => Object.fromEntries(specs.map((s) => [s.logger, s.unit])) as Record<string, Unit>;

export function generateSeedFiles(): SeedFiles {
  const sheetSpecs = SPECS.filter((s) => s.source !== 'raw');
  const rawSpecs = SPECS.filter((s) => s.source === 'raw');
  const newRawSpecs = rawSpecs.filter((s) => !sheetSpecs.some((x) => x.logger === s.logger));
  return {
    batch1: [
      // week 37 ends on the 13th; week 38 starts on the evening of the 13th (Summer pastes overlapping exports)
      { name: 'week37-sheet.csv', text: sheetA(DATA_START, '2026-09-13T23:45', false) },
      { name: 'week38-sheet.csv', text: sheetA('2026-09-13T18:00', DATA_END, true) },
      { name: 'week37-38-shifted-columns.csv', text: sheetB() },
      { name: 'holon-corrections.csv', text: holonCorrections() },
    ],
    decisions1: { units: unitsFor(sheetSpecs) },
    batch2: rawSpecs.map((s) => ({ name: s.rawFile!, text: rawFile(s) })),
    decisions2: {
      units: unitsFor(newRawSpecs),
      raw: Object.fromEntries(newRawSpecs.map((s) => [s.rawFile!, { branch: s.branch, fridge: s.fridge }])),
    },
    extra: [
      { name: 'email-sample.csv', text: EMAIL_SAMPLE_TSV + '\n' },
      { name: 'new-logger-TL-0240.csv', text: newLoggerFile() },
    ],
  };
}
