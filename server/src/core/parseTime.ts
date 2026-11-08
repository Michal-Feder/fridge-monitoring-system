import type { LocalTs } from './time.ts';

// D12: ISO is unambiguous. Slashed dates (also "." or "-" between day and month) are DD/MM or MM/DD;
// the order is decided once per file from all its values.
export type SlashOrder = 'DMY' | 'MDY';

export interface DateFormatDetection {
  order: SlashOrder;
  /** true when no value proved the order and DD/MM was assumed (Israel). */
  ambiguous: boolean;
  hasIso: boolean;
  hasSlashed: boolean;
}

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const SLASH = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const TIME_ONLY = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function clean(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function detectDateFormat(values: string[]): DateFormatDetection {
  let firstOver12 = false;
  let secondOver12 = false;
  let hasIso = false;
  let hasSlashed = false;
  for (const raw of values) {
    const v = clean(raw);
    if (ISO.test(v)) { hasIso = true; continue; }
    const m = SLASH.exec(v);
    if (!m) continue;
    hasSlashed = true;
    if (+m[1] > 12) firstOver12 = true;
    if (+m[2] > 12) secondOver12 = true;
  }
  if (firstOver12) return { order: 'DMY', ambiguous: false, hasIso, hasSlashed };
  if (secondOver12) return { order: 'MDY', ambiguous: false, hasIso, hasSlashed };
  return { order: 'DMY', ambiguous: hasSlashed, hasIso, hasSlashed };
}

function build(y: number, mo: number, d: number, h: number, mi: number): LocalTs | null {
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59) return null;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}`;
}

/** Parses one date-time value. Returns null if it is not a valid date-time (a date without time is rejected). */
export function parseTime(raw: string, order: SlashOrder = 'DMY'): LocalTs | null {
  const v = clean(raw);
  let m = ISO.exec(v);
  if (m) {
    if (m[4] === undefined) return null;
    return build(+m[1], +m[2], +m[3], +m[4], +m[5]);
  }
  m = SLASH.exec(v);
  if (m) {
    if (m[4] === undefined) return null;
    const a = +m[1], b = +m[2];
    let y = +m[3];
    if (m[3].length === 2) y += 2000;
    const [d, mo] = order === 'DMY' ? [a, b] : [b, a];
    return build(y, mo, d, +m[4], +m[5]);
  }
  return null;
}

/** A date-only value ("2026-09-14", "14/09/2026"), for files with separate date and time columns. */
export function isDateOnly(raw: string): boolean {
  const v = clean(raw);
  const iso = ISO.exec(v);
  if (iso) return iso[4] === undefined;
  const s = SLASH.exec(v);
  return !!s && s[4] === undefined;
}

export function isTimeOnly(raw: string): boolean {
  const m = TIME_ONLY.exec(clean(raw));
  return !!m && +m[1] <= 23 && +m[2] <= 59;
}

/** Joins a separate date and time column. */
export function parseDateAndTime(date: string, time: string, order: SlashOrder = 'DMY'): LocalTs | null {
  if (!isTimeOnly(time)) return null;
  return parseTime(`${clean(date)} ${clean(time)}`, order);
}

export function looksLikeDateTime(raw: string): boolean {
  return parseTime(raw, 'DMY') !== null || parseTime(raw, 'MDY') !== null;
}
