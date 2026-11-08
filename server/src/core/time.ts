// Times are local wall-clock strings "YYYY-MM-DDTHH:mm" (D13). For arithmetic they are mapped to
// "minutes since 1970 as if UTC". This never applies a timezone, so 06:00 stays 06:00.
export type LocalTs = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function toMinutes(ts: LocalTs): number {
  const m = RE.exec(ts);
  if (!m) throw new Error(`Bad local timestamp: ${ts}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
}

export function fromMinutes(min: number): LocalTs {
  const d = new Date(min * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function isValidLocalTs(ts: string): boolean {
  return RE.test(ts);
}

/** "2 h 15 min", "45 min", "1 day 3 h". */
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const days = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const rest = m % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (h) parts.push(`${h} h`);
  if (rest && !days) parts.push(`${rest} min`);
  return parts.join(' ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "14 Sep 2026 06:15" */
export function formatTs(ts: LocalTs, withYear = true): string {
  const [date, time] = ts.split('T');
  const [y, mo, d] = date.split('-');
  return `${+d} ${MONTHS[+mo - 1]}${withYear ? ' ' + y : ''} ${time}`;
}
