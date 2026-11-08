import type { Unit } from './units.ts';

// D9: ERR / blank / text is a reading with status "error". It is never turned into 0 and never dropped.
export interface ParsedTemp {
  value: number | null;
  status: 'ok' | 'error';
  /** unit written next to the number ("38.3°F"), if any */
  unitHint: Unit | null;
  raw: string;
}

const NUM = /^([+-]?\d+(?:[.,]\d+)?)\s*(?:°\s*)?([CF])?$/i;

export function parseTemp(raw: string | undefined | null): ParsedTemp {
  const r = (raw ?? '').trim();
  const m = NUM.exec(r.replace(/\s+/g, ' '));
  if (!m) return { value: null, status: 'error', unitHint: null, raw: r };
  const value = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(value)) return { value: null, status: 'error', unitHint: null, raw: r };
  const unitHint = m[2] ? (m[2].toUpperCase() as Unit) : null;
  return { value, status: 'ok', unitHint, raw: r };
}

/** Key used for duplicate detection: numbers compare by value ("3.90" = "3.9"), other text by upper-case text. */
export function valueKey(raw: string): string {
  const p = parseTemp(raw);
  return p.status === 'ok' && p.value !== null ? String(p.value) : p.raw.toUpperCase() || '(EMPTY)';
}

export function looksLikeTemp(raw: string): boolean {
  return parseTemp(raw).status === 'ok';
}

export function isErrorToken(raw: string): boolean {
  const r = raw.trim().toUpperCase();
  return r === 'ERR' || r === 'ERROR' || r === 'N/A' || r === 'NA' || r === '--' || r === '-' || r === '';
}
