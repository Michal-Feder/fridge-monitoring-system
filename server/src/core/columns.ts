// Columns "move around" between branches, so they are mapped by CONTENT, not by position.
// Header names help when present, but a file without a header still works.
import type { CsvTable } from './csv.ts';
import { looksLikeDateTime, isDateOnly, isTimeOnly } from './parseTime.ts';
import { parseTemp, isErrorToken } from './parseTemp.ts';
import { looksLikeLoggerId, nameKey } from './names.ts';
import type { Unit } from './units.ts';

export type Field = 'logger' | 'branch' | 'fridge' | 'datetime' | 'date' | 'clock' | 'temp';
export type ColumnMap = Partial<Record<Field, number>>;

export interface ColumnDetection {
  ok: boolean;
  error?: string;
  /** sheet = Summer's pasted 5-column sheet; raw = a logger file (time + temperature only) */
  mode: 'sheet' | 'raw';
  hasHeader: boolean;
  columns: ColumnMap;
  headerLabels: string[] | null;
  /** unit written in the temperature header, e.g. "Temp (°F)" */
  headerUnit: Unit | null;
  warnings: string[];
}

const HEADER_PATTERNS: [Field, RegExp][] = [
  ['logger', /logger|sensor|device|serial|^id$/i],
  ['branch', /branch|site|store|shop|location|סניף/i],
  ['fridge', /fridge|refrigerator|cooler|chiller|מקרר/i],
  ['temp', /temp|°|celsius|fahrenheit|reading|value|טמפ/i],
  ['datetime', /date.?time|timestamp|^time$|^ts$|זמן/i],
  ['date', /^date$|תאריך/i],
  ['clock', /^time$|^hour$|שעה/i],
];

interface Profile { dt: number; dateOnly: number; timeOnly: number; num: number; err: number; logger: number; text: number }

function profile(values: string[]): Profile {
  const n = Math.max(1, values.length);
  const p: Profile = { dt: 0, dateOnly: 0, timeOnly: 0, num: 0, err: 0, logger: 0, text: 0 };
  for (const v of values) {
    if (looksLikeDateTime(v)) p.dt++;
    else if (isDateOnly(v)) p.dateOnly++;
    else if (isTimeOnly(v)) p.timeOnly++;
    else if (parseTemp(v).status === 'ok') p.num++;
    else if (looksLikeLoggerId(v)) p.logger++;
    else if (isErrorToken(v)) p.err++;
    else p.text++;
  }
  for (const k of Object.keys(p) as (keyof Profile)[]) p[k] /= n;
  return p;
}

function isHeaderRow(cells: string[]): boolean {
  if (cells.length < 2) return false;
  return cells.every((c) => c === '' || (!looksLikeDateTime(c) && !isDateOnly(c) && !isTimeOnly(c) && parseTemp(c).status !== 'ok' && !looksLikeLoggerId(c)));
}

function unitFromHeader(label: string): Unit | null {
  if (/°\s*F|\(F\)|\bF\b|fahrenheit/i.test(label)) return 'F';
  if (/°\s*C|\(C\)|\bC\b|celsius/i.test(label)) return 'C';
  return null;
}

export function detectColumns(table: CsvTable, knownBranches: string[] = []): ColumnDetection {
  const warnings: string[] = [];
  const first = table.rows[0]?.cells ?? [];
  const hasHeader = isHeaderRow(first);
  const data = (hasHeader ? table.rows.slice(1) : table.rows).slice(0, 300);
  const width = Math.max(0, ...table.rows.map((r) => r.cells.length));
  const empty: ColumnDetection = { ok: false, mode: 'raw', hasHeader, columns: {}, headerLabels: hasHeader ? first : null, headerUnit: null, warnings };
  if (data.length === 0) return { ...empty, error: 'The file has no data rows.' };

  const profiles = Array.from({ length: width }, (_, i) => profile(data.map((r) => r.cells[i] ?? '')));
  const cols: ColumnMap = {};
  const used = new Set<number>();
  const take = (f: Field, i: number) => { cols[f] = i; used.add(i); };

  // 1) header names, but only where the content agrees
  if (hasHeader) {
    first.forEach((label, i) => {
      for (const [field, re] of HEADER_PATTERNS) {
        if (cols[field] !== undefined || used.has(i) || !re.test(label.trim())) continue;
        const p = profiles[i];
        const fits =
          (field === 'temp' && p.num + p.err >= 0.5 && p.num > 0) ||
          (field === 'datetime' && p.dt >= 0.6) ||
          (field === 'date' && p.dateOnly >= 0.6) ||
          (field === 'clock' && p.timeOnly >= 0.6) ||
          (field === 'logger' && p.logger >= 0.6) ||
          ((field === 'branch' || field === 'fridge') && p.text >= 0.6);
        if (fits) { take(field, i); break; }
      }
    });
  }

  const best = (score: (p: Profile) => number, min: number): number | undefined => {
    let bi: number | undefined;
    let bs = min;
    profiles.forEach((p, i) => {
      if (used.has(i)) return;
      const s = score(p);
      if (s >= bs) { bs = s; bi = i; }
    });
    return bi;
  };

  // 2) content
  if (cols.datetime === undefined && (cols.date === undefined || cols.clock === undefined)) {
    const dt = best((p) => p.dt, 0.6);
    if (dt !== undefined) take('datetime', dt);
    else {
      const d = cols.date ?? best((p) => p.dateOnly, 0.6);
      if (d !== undefined && cols.date === undefined) take('date', d);
      const c = cols.clock ?? best((p) => p.timeOnly, 0.6);
      if (c !== undefined && cols.clock === undefined) take('clock', c);
    }
  }
  if (cols.temp === undefined) {
    const t = best((p) => (p.num >= 0.5 ? p.num + p.err : 0), 0.5);
    if (t !== undefined) take('temp', t);
  }
  if (cols.logger === undefined) {
    const l = best((p) => p.logger, 0.6);
    if (l !== undefined) take('logger', l);
  }

  const hasTime = cols.datetime !== undefined || (cols.date !== undefined && cols.clock !== undefined);
  if (!hasTime) return { ...empty, error: 'Could not find a date/time column.' };
  if (cols.temp === undefined) return { ...empty, error: 'Could not find a temperature column.' };

  // 3) branch vs fridge: both are free text
  if (cols.branch === undefined || cols.fridge === undefined) {
    const textCols = profiles.map((p, i) => ({ p, i })).filter(({ p, i }) => !used.has(i) && p.text >= 0.6).map(({ i }) => i);
    if (cols.branch !== undefined && cols.fridge === undefined && textCols.length >= 1) take('fridge', textCols[0]);
    else if (cols.fridge !== undefined && cols.branch === undefined && textCols.length >= 1) take('branch', textCols[0]);
    else if (textCols.length >= 2) {
      const known = new Set(knownBranches.map(nameKey));
      const hits = textCols.map((i) => data.filter((r) => known.has(nameKey(r.cells[i] ?? ''))).length);
      const [a, b] = textCols;
      if (hits[0] !== hits[1] && known.size > 0) {
        const branchCol = hits[0] > hits[1] ? a : b;
        take('branch', branchCol);
        take('fridge', branchCol === a ? b : a);
      } else {
        take('branch', a);
        take('fridge', b);
        warnings.push('Could not tell the branch column from the fridge column; assumed the left one is the branch.');
      }
    }
  }

  const mode = cols.branch !== undefined && cols.fridge !== undefined && cols.logger !== undefined ? 'sheet' : 'raw';
  if (mode === 'raw' && (cols.branch !== undefined || cols.fridge !== undefined)) {
    warnings.push('Found branch/fridge text but no logger column; treating it as a logger file.');
    delete cols.branch;
    delete cols.fridge;
  }
  const headerUnit = hasHeader && cols.temp !== undefined ? unitFromHeader(first[cols.temp] ?? '') : null;
  return { ok: true, mode, hasHeader, columns: cols, headerLabels: hasHeader ? first : null, headerUnit, warnings };
}
