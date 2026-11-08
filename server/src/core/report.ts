// The answer to the inspector: "when did this fridge go above five degrees, and for how long?"
// Plain sentences, honest about what we do not know (gaps, errors, conversions).
import { formatDuration, formatTs, type LocalTs } from './time.ts';
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
}

export interface Report {
  headline: string;
  sentences: string[];
  notes: string[];
}

const t = (ts: LocalTs) => formatTs(ts);
const deg = (n: number) => `${n.toFixed(1)} °C`;

export function durationText(e: EventView): string {
  if (e.ongoing) return `at least ${formatDuration(e.minMinutes)}, still above at the last reading`;
  if (!e.durationKnown) return `at least ${formatDuration(e.minMinutes)}; exact length unknown because ${e.startsAtDataStart ? 'the data starts while it was already above' : 'of a gap in the data'}`;
  if (e.minMinutes === e.maxMinutes) return formatDuration(e.minMinutes);
  return `between ${formatDuration(e.minMinutes)} and ${formatDuration(e.maxMinutes as number)}`;
}

export function eventSentence(e: EventView, threshold: number): string {
  const label = { spike: 'Short spike (likely a door opening)', unverified: 'Short excursion that cannot be verified', sustained: 'Excursion', ongoing: 'Ongoing excursion' }[e.class];
  const when = e.readingsAbove === 1 ? `at ${t(e.firstHigh)}` : `from ${t(e.firstHigh)} to ${t(e.lastHigh)}`;
  return `${label}: above ${deg(threshold)} ${when} (${durationText(e)}), peak ${deg(e.peak)}.`;
}

export function inspectorReport(r: ReportInput): Report {
  const range = `between ${t(r.from)} and ${t(r.to)}`;
  const sentences: string[] = [];
  const notes: string[] = [];
  const counted = r.events.filter((e) => e.class !== 'spike');
  const spikes = r.events.filter((e) => e.class === 'spike');

  let headline: string;
  if (r.readings === 0) {
    headline = `No readings were recorded for ${r.fridgeLabel} ${range}. We cannot say whether it went above ${deg(r.threshold)}.`;
  } else if (r.events.length === 0) {
    headline = `${r.fridgeLabel} did not go above ${deg(r.threshold)} in any recorded reading ${range}.`;
  } else {
    const parts = [`${counted.length} time${counted.length === 1 ? '' : 's'}`];
    if (spikes.length) parts.push(`plus ${spikes.length} short spike${spikes.length === 1 ? '' : 's'} of at most 30 minutes`);
    headline = `${r.fridgeLabel} went above ${deg(r.threshold)} ${parts.join(', ')} ${range}.`;
    const longest = counted.reduce<EventView | null>((a, b) => (!a || b.minMinutes > a.minMinutes ? b : a), null);
    if (longest) sentences.push(`Longest: ${eventSentence(longest, r.threshold)}`);
    for (const e of r.events) if (e !== longest) sentences.push(eventSentence(e, r.threshold));
  }

  if (r.firstReading && r.lastReading) notes.push(`Readings cover ${t(r.firstReading)} to ${t(r.lastReading)} (${r.readings} readings).`);
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
  return { headline, sentences, notes };
}
