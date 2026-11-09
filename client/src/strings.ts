// All UI text lives here (CLAUDE.md). UI language: English.
import type { Level, Reason } from './api.ts';
import { fmtDuration, fmtMinutesTs, fmtTemp, fmtTs, plural } from './format.ts';

type P = Reason['params'];
const n = (v: P[string]) => (typeof v === 'number' ? v : 0);
const t = (v: P[string]) => (typeof v === 'number' ? fmtMinutesTs(v) : '?');

export const strings = {
  appName: 'Fridge Watch',
  tagline: 'Squanchy Bakery fridge temperatures',

  common: {
    loading: 'Loading…',
    retry: 'Try again',
    offline: 'Cannot reach the server. Is it running (npm run dev)?',
    error: (message: string) => `Something went wrong: ${message}`,
  },

  level: {
    // words, not only colours: the status must read the same on a phone in the sun or in print
    red: 'Too warm',
    was_red: 'Was too warm – check the products',
    orange: 'Watch',
    grey: 'No reliable data',
    green: 'OK',
  } satisfies Record<Level, string>,

  /** for the small summary tiles */
  levelShort: {
    red: 'Too warm',
    was_red: 'Was too warm',
    orange: 'Watch',
    grey: 'No reliable data',
    green: 'OK',
  } satisfies Record<Level, string>,

  dashboard: {
    title: 'All fridges',
    asOf: (ts: string) => `Data as of ${fmtTs(ts, true)}`,
    asOfHint: 'the latest reading uploaded, not the current time',
    window: { label: 'Period', '7d': 'Last 7 days', '24h': 'Last 24 hours' },
    counts: 'Summary',
    attention: 'Needs attention',
    attentionNone: 'Nothing needs attention in this period.',
    ok: 'OK',
    okBranch: (count: number) => `${plural(count, 'fridge')} OK`,
    lastReading: (temp: number | null, ts: string) => `Last reading ${fmtTemp(temp)} at ${fmtTs(ts)}`,
    noReading: 'No readings yet',
    limit: (max: number) => `limit ${fmtTemp(max)}`,
    empty: 'No data yet. Upload logger files to start.',
  },

  /** One sentence per status reason (server core/status.ts codes). */
  reason: (r: Reason, maxTemp: number): string => {
    const p = r.params;
    switch (r.code) {
      case 'ongoing':
        return `Above ${fmtTemp(maxTemp)} since ${t(p.since)} and still above at the last reading (peak ${fmtTemp(n(p.peak))}).`;
      case 'sustained': {
        const len = p.maxMinutes === null ? `at least ${fmtDuration(n(p.minMinutes))}` : `${fmtDuration(n(p.minMinutes))} to ${fmtDuration(n(p.maxMinutes))}`;
        const more = n(p.count) > 1 ? ` (${plural(n(p.count), 'time')} in this period; longest shown)` : '';
        // a finished event: say it is over, so a red card for the past does not read as "too warm now"
        const back = typeof p.nextOk === 'number' ? ` Back to normal since ${t(p.nextOk)}.` : '';
        return `Above ${fmtTemp(maxTemp)} for ${len} from ${t(p.at)}, peak ${fmtTemp(n(p.peak))}${more}.${back}`;
      }
      case 'warming':
        return `Warming up: last 6 h average ${fmtTemp(n(p.recentMean))}, ${fmtTemp(n(p.delta))} above its usual ${fmtTemp(n(p.baseline))}.`;
      case 'unverified':
        return `High reading of ${fmtTemp(n(p.peak))} at ${t(p.at)}; too few readings around it to tell how long it lasted.`;
      case 'no_logger':
        return 'No logger is assigned to this fridge.';
      case 'no_data':
        return 'No readings in this period.';
      case 'stale':
        return `No readings since ${t(p.last)} (${fmtDuration(n(p.minutes))} before the latest data).`;
      case 'gap':
        return `${plural(n(p.count), 'gap')} in the data; longest ${fmtDuration(n(p.longest))} (${t(p.from)} to ${t(p.to)}). The temperature then is unknown.`;
      case 'errors':
        return `${plural(n(p.count), 'error reading')} (e.g. "ERR") in this period.`;
      case 'spikes':
        return `${plural(n(p.count), 'short spike')} of at most 30 min (door opening?).`;
      case 'conflicts':
        return `${plural(n(p.count), 'reading')} with two different values at the same time; the higher one is used.`;
      default:
        return r.code;
    }
  },
} as const;
