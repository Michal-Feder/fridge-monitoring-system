// Display formatting. Times are local wall-clock strings "YYYY-MM-DDTHH:mm" (D13): they are split as
// text, never passed to new Date(localString), so nothing shifts by a timezone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "20 Sep 23:45"; withYear -> "20 Sep 2026 23:45" */
export function fmtTs(ts: string, withYear = false): string {
  const [date, time] = ts.split('T');
  const [y, mo, d] = date.split('-');
  // non-breaking space between day and month: "14" and "Sep" must not end up on different lines
  return `${+d} ${MONTHS[+mo - 1]}${withYear ? ` ${y}` : ''} ${time}`;
}

/** Server reason params carry times as minutes since 1970 on the wall clock (core/time.ts toMinutes). */
export function fmtMinutesTs(min: number, withYear = false): string {
  const d = new Date(min * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return fmtTs(`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`, withYear);
}

/** "45 min", "2 h 15 min", "1 day 3 h" (same wording as the server report) */
export function fmtDuration(minutes: number): string {
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

// non-breaking space: "°C" must never wrap onto a line by itself
export const fmtTemp = (c: number | null | undefined) => (c === null || c === undefined ? '—' : `${c.toFixed(1)} °C`);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
