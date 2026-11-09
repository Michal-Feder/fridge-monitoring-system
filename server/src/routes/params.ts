// Request parsing shared by the routes. Turns query strings into typed values or a 400.
import { isValidLocalTs, type LocalTs } from '../core/time.ts';
import { badRequest } from '../services/errors.ts';
import type { Window } from '../services/analysisService.ts';

const one = (v: unknown): string | undefined => (Array.isArray(v) ? one(v[0]) : typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

/** "2026-09-14" (start or end of that day) or "2026-09-14T06:00". */
export function localTs(v: unknown, name: string, endOfDay = false): LocalTs | undefined {
  const s = one(v);
  if (s === undefined) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T${endOfDay ? '23:59' : '00:00'}`;
  if (isValidLocalTs(s)) return s;
  throw badRequest(`"${name}" must be a date (2026-09-14) or a local time (2026-09-14T06:00).`);
}

export function range(q: Record<string, unknown>): { from?: LocalTs; to?: LocalTs } {
  return { from: localTs(q.from, 'from'), to: localTs(q.to, 'to', true) };
}

export function windowParam(v: unknown): Window {
  const s = one(v) ?? '7d';
  if (s !== '7d' && s !== '24h') throw badRequest('"window" must be 7d or 24h.');
  return s;
}

export function numberParam(v: unknown, name: string, fallback: number): number {
  const s = one(v);
  if (s === undefined) return fallback;
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n)) throw badRequest(`"${name}" must be a number.`);
  return n;
}

export function idParam(v: unknown, name = 'id'): number {
  const n = Number(one(v));
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`"${name}" must be a positive whole number.`);
  return n;
}

/** Wall-clock upload time, local, "YYYY-MM-DDTHH:mm" (D13). Only the import record uses it. */
export function nowLocal(d = new Date()): LocalTs {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
