// The answer to the inspector: "when did this fridge go above five degrees, and for how long?"
// Plain sentences, honest about what we do not know (gaps, errors, conversions).
import { formatDuration, formatTs, fromMinutes, toMinutes, type LocalTs } from './time.ts';
import type { EventView, GapView } from './analyze.ts';

export interface ReportInput {
  fridgeLabel: string;
  threshold: number;
  from: LocalTs;
  to: LocalTs;
  events: EventView[];
  gaps: GapView[];
  readings: number;
  errors: number;
  conflicts: number;
  firstReading: LocalTs | null;
  lastReading: LocalTs | null;
  /** loggers that record °F: their readings were converted */
  fahrenheitLoggers: string[];
  /** logger periods in this fridge that overlap the range */
  loggerPeriods: { loggerId: string; from: LocalTs; to: LocalTs | null }[];
  /** latest reading in the whole DB (asOf, D22): time after it is "not uploaded yet", not missing */
  dataEnd: LocalTs | null;
  /** gap limit of the fridge's logger (2.5 x typical interval, D5), or null when unknown */
  gapLimitMin: number | null;
}

/** D40: how much of the period the readings actually cover. */
export interface Coverage {
  /** from -> min(to, dataEnd) */
  periodMinutes: number;
  /** uncovered start + uncovered end + gaps inside */
  missingMinutes: number;
  /** covered share of the period, one decimal */
  percent: number;
  /** before the first and after the last reading, when longer than the gap limit */
  uncovered: GapView[];
}

export interface Report {
  headline: string;
  sentences: string[];
  notes: string[];
  coverage: Coverage;
}

/** Same floor as "stale" (D23): a start or end shorter than this is normal logging, not missing data. */
const MIN_MISSING_MIN = 60;

export function coverage(r: Pick<ReportInput, 'from' | 'to' | 'dataEnd' | 'gapLimitMin' | 'firstReading' | 'lastReading' | 'gaps' | 'readings'>): Coverage {
  const end = r.dataEnd !== null && r.dataEnd < r.to ? r.dataEnd : r.to;
  const p0 = toMinutes(r.from);
  const p1 = Math.max(toMinutes(end), p0);
  const limit = Math.max(r.gapLimitMin ?? 0, MIN_MISSING_MIN);
  const uncovered: GapView[] = [];
  if (r.readings === 0 || !r.firstReading || !r.lastReading) {
    if (p1 > p0) uncovered.push({ from: r.from, to: fromMinutes(p1), minutes: p1 - p0 });
  } else {
    const f = toMinutes(r.firstReading);
    const l = toMinutes(r.lastReading);
    if (f - p0 > limit) uncovered.push({ from: r.from, to: r.firstReading, minutes: f - p0 });
    if (p1 - l > limit) uncovered.push({ from: r.lastReading, to: fromMinutes(p1), minutes: p1 - l });
  }
  const inGaps = r.gaps.reduce((a, g) => a + Math.max(0, Math.min(toMinutes(g.to), p1) - Math.max(toMinutes(g.from), p0)), 0);
  const missing = Math.min(uncovered.reduce((a, u) => a + u.minutes, 0) + inGaps, p1 - p0);
  const period = p1 - p0;
  return { periodMinutes: period, missingMinutes: missing, percent: period > 0 ? Math.round(((period - missing) / period) * 1000) / 10 : 0, uncovered };
}

const t = (ts: LocalTs) => formatTs(ts);
const deg = (n: number) => `${n.toFixed(1)} °C`;

/** `withContinued: false` when the caller adds the D45 "continued after the end" part itself (no nested brackets). */
export function durationText(e: EventView, withContinued = true): string {
  if (e.ongoing) return `at least ${formatDuration(e.minMinutes)}, still above at the last reading`;
  const base = !e.durationKnown
    ? `at least ${formatDuration(e.minMinutes)}; exact length unknown because ${e.startsAtDataStart ? 'the data starts while it was already above' : 'of a gap in the data'}`
    : e.minMinutes === e.maxMinutes
      ? formatDuration(e.minMinutes)
      : e.minMinutes === 0 // one high reading: provably at least 0 min, so only the upper bound is said (D49)
        ? `up to ${formatDuration(e.maxMinutes as number)}`
        : `between ${formatDuration(e.minMinutes)} and ${formatDuration(e.maxMinutes as number)}`;
  // D45: the period ended inside this excursion; the readings after it show when it really ended
  return e.continuesAfter && withContinued ? `${base}; ${continuedText(e)}` : base;
}

function continuedText(e: EventView): string {
  return `it continued after the end of the period (until ${t(e.lastHigh)})`;
}

/** `withLabel: false` for the "Longest: ..." sentence, which would otherwise read "Longest: Excursion: above". */
export function eventSentence(e: EventView, threshold: number, withLabel = true): string {
  const label = { spike: 'Short spike (likely a door opening)', unverified: 'Time above the limit, length unknown', sustained: 'Time above the limit', ongoing: 'Still above the limit' }[e.class];
  const when = e.readingsAbove === 1 ? `at ${t(e.firstHigh)}` : `from ${t(e.firstHigh)} to ${t(e.lastHigh)}`;
  const continued = e.continuesAfter && !e.ongoing ? `; ${continuedText(e)}` : '';
  return `${withLabel ? `${label}: a` : 'a'}bove ${deg(threshold)} ${when} (${durationText(e, false)}), peak ${deg(e.peak)}${continued}.`;
}

export function inspectorReport(r: ReportInput): Report {
  const range = `between ${t(r.from)} and ${t(r.to)}`;
  const sentences: string[] = [];
  const notes: string[] = [];
  const counted = r.events.filter((e) => e.class !== 'spike');
  const spikes = r.events.filter((e) => e.class === 'spike');
  const cov = coverage(r);
  // D40: the headline never sounds complete when part of the period has no readings
  const partial = r.readings > 0 && cov.missingMinutes > 0;
  const missingSentence = `There are no readings for ${formatDuration(cov.missingMinutes)} of the ${formatDuration(cov.periodMinutes)} in this period, so we cannot say what happened then.`;

  let headline: string;
  if (r.readings === 0) {
    headline = `No readings were recorded for ${r.fridgeLabel} ${range}. We cannot say whether it went above ${deg(r.threshold)}.`;
  } else if (r.events.length === 0 && partial) {
    headline = `In the recorded readings (${recordedSpan(r.firstReading!, r.lastReading!)}) ${r.fridgeLabel} did not go above ${deg(r.threshold)}. ${missingSentence}`;
  } else if (r.events.length === 0) {
    headline = `${r.fridgeLabel} did not go above ${deg(r.threshold)} in any recorded reading ${range}.`;
  } else if (counted.length === 0) {
    // D49: only short spikes: never "went above ... 0 times"
    const spikeText = spikesText(spikes.length);
    headline = partial
      ? `In the recorded readings (${recordedSpan(r.firstReading!, r.lastReading!)}) ${r.fridgeLabel} did not stay above ${deg(r.threshold)}; ${spikeText}. ${missingSentence}`
      : `${r.fridgeLabel} did not stay above ${deg(r.threshold)} ${range}; ${spikeText}.`;
    for (const e of r.events) sentences.push(eventSentence(e, r.threshold));
  } else {
    const parts = [`${counted.length} time${counted.length === 1 ? '' : 's'}`];
    if (spikes.length) parts.push(`plus ${spikesText(spikes.length)}`);
    headline = `${r.fridgeLabel} went above ${deg(r.threshold)} ${parts.join(', ')} ${range}.${partial ? ` ${missingSentence}` : ''}`;
    const longest = counted.reduce<EventView | null>((a, b) => (!a || b.minMinutes > a.minMinutes ? b : a), null);
    if (longest) sentences.push(`Longest: ${eventSentence(longest, r.threshold, false)}`);
    for (const e of r.events) if (e !== longest) sentences.push(eventSentence(e, r.threshold));
  }

  if (r.firstReading && r.lastReading) notes.push(`Readings cover ${t(r.firstReading)} to ${t(r.lastReading)} (${r.readings} readings, ${cov.percent}% of the period).`);
  for (const u of cov.uncovered) {
    const where = r.readings === 0 ? 'the whole period' : u.from === r.from ? 'before the first reading in this period' : 'after the last reading in this period';
    notes.push(`No readings from ${t(u.from)} to ${t(u.to)} (${formatDuration(u.minutes)}), ${where}. The temperature then is unknown.`);
  }
  if (r.dataEnd !== null && r.dataEnd < r.to) notes.push(`The latest uploaded data ends at ${t(r.dataEnd)}; the period after that is not counted (nothing has been uploaded for it yet).`);
  if (r.gaps.length) {
    const total = r.gaps.reduce((a, g) => a + g.minutes, 0);
    const list = r.gaps.slice(0, 5).map((g) => `${t(g.from)} to ${t(g.to)}`).join('; ');
    notes.push(`${r.gaps.length} period${r.gaps.length === 1 ? '' : 's'} with no data (${formatDuration(total)} in total): ${list}${r.gaps.length > 5 ? '; ...' : ''}. The temperature during these periods is unknown; nothing was filled in.`);
  }
  if (r.errors) notes.push(`${r.errors} reading${r.errors === 1 ? ' was' : 's were'} an error (e.g. "ERR") and ${r.errors === 1 ? 'is' : 'are'} not counted as a temperature.`);
  if (r.conflicts) notes.push(`${r.conflicts} readings had two different values at the same time; the higher value was used.`);
  for (const l of r.fahrenheitLoggers) notes.push(`Logger ${l} records in °F. Its readings were converted to °C after a one-time confirmation; the original values are stored.`);
  if (r.loggerPeriods.length > 1 || r.loggerPeriods.some((p) => p.from > r.from)) {
    for (const p of r.loggerPeriods) notes.push(`Logger ${p.loggerId} was in this fridge from ${t(p.from)}${p.to ? ` until ${t(p.to)}` : ''}.`);
  }
  notes.push(`"Above" means strictly above ${deg(r.threshold)}. Durations are ranges: the shortest is between the first and last high reading, the longest is between the normal readings around them.`);
  return { headline, sentences, notes, coverage: cov };
}

const spikesText = (n: number) => `${n} short spike${n === 1 ? '' : 's'} of up to 30 min (door?)`;

/** "14 Sep 2026 06:00 to 06:30" on one day, otherwise both full times. */
function recordedSpan(first: LocalTs, last: LocalTs): string {
  return first.slice(0, 10) === last.slice(0, 10) ? `${t(first)} to ${last.slice(11)}` : `${t(first)} to ${t(last)}`;
}
