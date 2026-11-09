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

  nav: {
    label: 'Main',
    dashboard: 'Dashboard',
    upload: 'Upload',
  },

  upload: {
    title: 'Upload logger files',
    intro: 'Add the weekly sheet or raw logger files (CSV or TSV). Nothing is saved until you press Save.',
    pick: 'Choose files',
    drop: 'or drop them here',
    accept: '.csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values',
    pasteLabel: 'Or paste from Excel',
    pastePlaceholder: 'Copy the rows in Excel (with or without the header row) and paste them here',
    pasteAdd: 'Add pasted rows',
    pastedName: (k: number) => `pasted-${k}.tsv`,
    files: (count: number) => plural(count, 'file'),
    remove: 'Remove',
    removeFile: (name: string) => `Remove ${name}`,
    clear: 'Start over',
    readError: (name: string) => `Could not read ${name}.`,
    checking: 'Checking the files…',

    summary: 'What was found',
    totals: {
      rowsRead: 'Rows read',
      newRows: 'New readings',
      alreadyInDb: 'Already saved',
      exactDuplicates: 'Exact duplicates (dropped)',
      conflicts: 'Same time, different value',
      errorReadings: 'Error readings (e.g. ERR)',
      skipped: 'Lines skipped',
    },
    totalsHint: 'Error readings are kept and shown as errors, never as 0. Duplicates are counted, not saved twice.',

    decide: 'Your decision is needed',
    decideNone: 'Nothing to decide.',
    unitTitle: (id: string) => `Unit for ${id}`,
    newLogger: 'new logger',
    unitHelp: 'The system only suggests the unit. Your choice is saved on the logger and used for its future files.',
    suggested: 'Suggested',
    celsius: '°C (Celsius)',
    fahrenheit: '°F (Fahrenheit)',
    unitChosen: (u: 'C' | 'F') => `Will be saved as °${u}.`,
    lowConfidence: 'Not sure: please check against the logger.',
    loggerIn: (fridges: string[]) => `In ${fridges.join(', ')}`,

    assignTitle: (file: string) => `Where does ${file} come from?`,
    assignHelp: 'A raw logger file has only time and temperature. Choose the logger and the fridge it hangs in.',
    loggerId: 'Logger id',
    loggerIdPlaceholder: 'TL-0000',
    branch: 'Branch',
    fridge: 'Fridge',
    assignApply: 'Use this fridge',
    assignChosen: (branch: string, fridge: string) => `Going to ${branch} / ${fridge}.`,
    assignMissing: 'Fill in all fields.',

    warnings: 'Check these',
    willCreate: 'Will be created',
    willCreateHint: 'Names are matched ignoring upper/lower case and extra spaces. If one of these is a typo, fix the file first.',
    newBranch: (name: string) => `Branch: ${name}`,
    newFridge: (label: string) => `Fridge: ${label}`,

    filesTitle: 'Files',
    mode: { sheet: 'Sheet (logger, branch, fridge, time, temp)', raw: 'Raw logger file (time + temp)' },
    modeShort: { sheet: 'sheet', raw: 'raw' },
    fileNew: (n: number) => `${n} new`,
    fileError: 'Cannot be read',
    columns: 'Columns found',
    column: { logger: 'Logger', branch: 'Branch', fridge: 'Fridge', datetime: 'Date + time', date: 'Date', clock: 'Time', temp: 'Temperature' },
    columnAt: (field: string, index: number, label: string | null) => `${field} (column ${index + 1}${label ? `, “${label}”` : ''})`,
    noHeader: 'No header row: columns recognised by their content.',
    dateFormat: 'Date format',
    dates: (f: { order: 'DMY' | 'MDY'; ambiguous: boolean; hasIso: boolean; hasSlashed: boolean } | null) => {
      if (!f) return '—';
      const slashed = f.order === 'DMY' ? 'DD/MM/YYYY' : 'MM/DD/YYYY';
      const parts = [f.hasIso ? 'YYYY-MM-DD' : null, f.hasSlashed ? `${slashed}${f.ambiguous ? ' (guessed)' : ''}` : null].filter(Boolean);
      return parts.join(' and ') || '—';
    },
    rawFrom: (src: 'history' | 'decision' | null) => (src === 'history' ? 'from the logger history' : src === 'decision' ? 'chosen by you' : ''),
    rawLogger: (id: string | null, src: string | null) =>
      id ? `Logger ${id}${src === 'filename' ? ' (from the file name)' : src === 'decision' ? ' (typed by you)' : ''}` : 'Logger: not known yet',
    issues: 'Skipped lines',
    issueLine: (lineNo: number, detail: string) => `Line ${lineNo}: ${detail}`,
    moreIssues: (n: number) => `…and ${n} more.`,

    loggersTitle: 'Loggers',
    loggerRange: (from: string, to: string) => `${fmtTs(from)} to ${fmtTs(to)}`,
    interval: (min: number | null) => (min === null ? 'interval unknown' : `every ${fmtDuration(min)}`),
    gaps: (count: number) => plural(count, 'gap'),
    gapLine: (from: string, to: string, minutes: number) => `${fmtTs(from)} to ${fmtTs(to)} (${fmtDuration(minutes)}): no readings, temperature unknown`,
    moveLine: (to: string, at: string) => `Moved to ${to} on ${fmtTs(at)}`,
    rows: (n: number) => plural(n, 'row'),

    save: (n: number) => `Save ${plural(n, 'new reading')}`,
    saveNothing: 'Save (nothing new)',
    saving: 'Saving…',
    blocked: (n: number) => `${plural(n, 'decision')} left before saving`,

    doneTitle: 'Saved',
    done: (n: number) => `${plural(n, 'new reading')} saved.`,
    doneSkipped: (inDb: number, dup: number) => `${inDb} already saved before, ${plural(dup, 'exact duplicate')} dropped.`,
    doneConflicts: (n: number) => `${plural(n, 'reading')} now marked as conflicts (two values at the same time).`,
    doneCreated: 'Created',
    toDashboard: 'Go to the dashboard',
    uploadMore: 'Upload more files',
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
