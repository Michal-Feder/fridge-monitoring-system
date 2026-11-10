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
    okBranchPartial: (ok: number, total: number) => `${ok} of ${total} fridges OK`,
    okAll: (count: number) => `${plural(count, 'fridge')} OK`,
    show: 'show',
    hide: 'hide',
    lastReading: (temp: number | null, ts: string) => `Last reading ${fmtTemp(temp)} at ${fmtTs(ts)}`,
    noReading: 'No readings yet',
    limit: (max: number) => `limit ${fmtTemp(max)}`,
    empty: 'No data yet. Upload logger files to start.',
  },

  nav: {
    label: 'Main',
    dashboard: 'Dashboard',
    upload: 'Upload',
    search: 'Search',
    setup: 'Setup',
  },

  search: {
    title: 'Find times above a temperature',
    intro: 'Which fridges were above a temperature for at least some minutes, and when.',
    above: 'Above (°C)',
    minMinutes: 'For at least (minutes)',
    from: 'From',
    to: 'To',
    certainty: 'Which times to count',
    possibly: 'Include times with unknown length (safer)',
    possiblyHelp: 'Also counts times above the limit whose length is unknown because of a gap.',
    certainly: 'Only times we know lasted that long',
    certainlyHelp: 'Only times the readings prove were that long.',
    run: 'Search',
    none: 'Try a lower temperature or fewer minutes.',
    report: 'Report',
    // D47: printable results
    printTitle: 'Temperature search',
    print: 'Print results',
    query: (above: number, min: number, from: string, to: string, certainty: 'possibly' | 'certainly') =>
      `Fridges above ${fmtTemp(above)} for at least ${fmtDuration(min)}, ${fmtTs(from, true)} to ${fmtTs(to, true)}. ` +
      (certainty === 'possibly'
        ? 'Includes times with unknown length (safer).'
        : 'Only times we know lasted that long.'),
    count: (n: number, checked: number) => `${n} of ${plural(checked, 'fridge')} match.`,
    noneSentence: (above: number, min: number, from: string, to: string, checked: number) =>
      `No fridge was above ${fmtTemp(above)} for at least ${fmtDuration(min)} between ${fmtTs(from, true)} and ${fmtTs(to, true)}; ${plural(checked, 'fridge')} were checked.`,
    coverage: (p: number) => (p >= 100 ? 'Readings cover the whole period' : `Readings cover ${p}% of the period`),
  },

  setup: {
    title: 'Setup',
    intro: 'Branches, fridges and loggers. New branches and fridges are also created by uploads.',
    branches: 'Branches and fridges',
    noLogger: 'no logger',
    fridgeCount: (n: number) => plural(n, 'fridge'),
    limit: (max: number) => `limit ${fmtTemp(max)}`,
    addBranch: 'Add a branch',
    branchName: 'Branch name',
    branchAdded: (name: string, created: boolean) => (created ? `Added ${name}.` : `${name} already exists (names ignore upper/lower case).`),
    addFridge: 'Add a fridge',
    branch: 'Branch',
    fridgeName: 'Fridge name',
    fridgeLimit: 'Limit (°C)',
    fridgeAdded: (branch: string, name: string) => `Added ${branch} / ${name}.`,
    add: 'Add',
    loggers: 'Loggers',
    loggersNone: 'No loggers yet. They appear after the first upload.',
    loggerWhere: (label: string | null, since: string) => (label ? `${label} since ${fmtTs(since)}` : 'not in a fridge'),
    loggerStats: (n: number, last: string | null) => `${plural(n, 'reading')}${last ? `, last ${fmtTs(last)}` : ''}`,
    move: 'Move',
    moveTitle: (id: string) => `Move ${id}`,
    moveTo: 'To fridge',
    moveFrom: 'From (date and time)',
    moveHelp: 'Only changes where the logger is from that time on. Readings already saved keep the fridge they were uploaded with.',
    moveSave: 'Move logger',
    moved: (id: string, label: string) => `${id} is now in ${label}.`,
    cancel: 'Cancel',
    choose: 'Choose…',
  },

  upload: {
    title: 'Upload logger files',
    intro: 'Add the weekly sheet or raw logger files: Excel (.xlsx), CSV or TSV, or paste rows from Excel. Nothing is saved until you press Save.',
    pick: 'Choose files',
    drop: 'or drop them here',
    accept: '.xlsx,.xls,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,text/tab-separated-values',
    pasteLabel: 'Or paste from Excel',
    pastePlaceholder: 'Copy the rows in Excel (with or without the header row) and paste them here',
    pasteAdd: 'Add pasted rows',
    pastedName: (k: number) => `pasted-${k}.tsv`,
    files: (count: number) => plural(count, 'file'),
    remove: 'Remove',
    removeFile: (name: string) => `Remove ${name}`,
    clear: 'Start over',
    readError: (name: string) => `Could not read ${name}.`,
    oldXls: (name: string) => `${name} is an old Excel file (.xls). Save it as .xlsx or CSV and add it again.`,
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
    cannotSave: 'Cannot be saved yet',
    decideNone: 'Nothing to decide.',
    unitTitle: (id: string) => `Unit for ${id}`,
    newLogger: 'new logger',
    unitHelp: 'The system only suggests the unit. Your choice is saved on the logger and used for its future files.',
    suggested: 'Suggested',
    celsius: '°C (Celsius)',
    fahrenheit: '°F (Fahrenheit)',
    unitChosen: (u: 'C' | 'F') => `Will be saved as °${u}.`,
    lowConfidence: 'Not sure: please check against the logger.',
    unitNoFit: (id: string) => `${id} cannot be saved`,
    unitNoFitHelp: 'Only °C and °F are supported. Remove this file, fix it (or export it again from the logger) and add it again.',
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
    rawSplit: 'The logger moved during this file; the rows go to (from the logger history):',
    rawSplitLine: (label: string, from: string, to: string, rows: number) => `${label}: ${fmtTs(from)} to ${fmtTs(to)} (${plural(rows, 'row')})`,
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
    // covers both "choose" (unit, fridge) and "fix the file" (D42)
    blocked: (n: number) => `${plural(n, 'thing')} to sort out above before saving`,

    doneTitle: 'Saved',
    done: (n: number) => `${plural(n, 'new reading')} saved.`,
    doneSkipped: (inDb: number, dup: number) => `${inDb} already saved before, ${plural(dup, 'exact duplicate')} dropped.`,
    doneConflicts: (n: number) => `${plural(n, 'reading')} now marked as conflicts (two values at the same time).`,
    doneCreated: 'Created',
    toDashboard: 'Go to the dashboard',
    uploadMore: 'Upload more files',
  },

  fridge: {
    back: '← All fridges',
    title: (branch: string, name: string) => `${branch} / ${name}`,
    statusNow: 'Status now',
    statusNowHint: (asOf: string) => `last 7 days up to ${fmtTs(asOf)}`,
    range: 'Period',
    from: 'From',
    to: 'To',
    show: 'Show',
    resetRange: 'Reset to last 7 days',
    rangeShown: (from: string, to: string) => `${fmtTs(from)} to ${fmtTs(to)}`,
    report: 'Inspector report',
    noReadings: 'No readings in this period.',

    chart: 'Temperature',
    chartLabel: (name: string) => `Temperature chart for ${name}`,
    legend: {
      temp: 'Temperature (°C)',
      limit: 'Limit',
      excursion: 'Above the limit',
      unverified: 'Above, length unknown',
      spike: 'Short spike',
      gap: 'Gap: no readings',
      error: 'Error reading',
      warning: 'Warm-up warning',
    },
    limitLabel: (max: number) => `limit ${fmtTemp(max)}`,
    warningLabel: 'warm-up warning',
    tooltipError: (original: string) => `Error reading ("${original}")`,
    tooltipOriginal: (value: string, unit: string) => `logged as ${value} °${unit}`,
    tooltipConflict: 'two values at this time; the higher one is used',

    warning: (ts: string) => `The warm-up warning first fired at ${fmtTs(ts)}.`,

    events: 'Times above the limit',
    // D40: "never above" is only said about time that has readings
    eventsNone: (max: number) => `Never above ${fmtTemp(max)} in this period.`,
    eventsNoneNoData: 'No readings in this period, so we cannot tell.',
    eventsNonePartial: (max: number, percent: number) =>
      `Never above ${fmtTemp(max)} in the recorded readings. Only ${percent}% of this period has readings; what happened in the rest is unknown.`,
    eventClass: { spike: 'Short spike', unverified: 'Length unknown', sustained: 'Too warm', ongoing: 'Still too warm' },
    eventWhen: (e: { firstHigh: string; lastHigh: string; readingsAbove: number }) =>
      e.readingsAbove === 1 ? `at ${fmtTs(e.firstHigh)}` : `${fmtTs(e.firstHigh)} to ${fmtTs(e.lastHigh)}`,
    eventDuration: (e: { minMinutes: number; maxMinutes: number | null; ongoing: boolean; durationKnown: boolean; startsAtDataStart: boolean; continuesAfter?: boolean; lastHigh?: string }) => {
      if (e.ongoing) return `at least ${fmtDuration(e.minMinutes)}, still above at the last reading`;
      const base = !e.durationKnown
        ? `at least ${fmtDuration(e.minMinutes)}; exact length unknown (${e.startsAtDataStart ? 'the data starts while it was already above' : 'gap in the data'})`
        : e.minMinutes === e.maxMinutes
          ? fmtDuration(e.minMinutes)
          : e.minMinutes === 0 // one high reading: provably at least 0 min, so say only the upper bound
            ? `up to ${fmtDuration(e.maxMinutes ?? 0)}`
            : `${fmtDuration(e.minMinutes)} to ${fmtDuration(e.maxMinutes ?? 0)}`;
      // D45: the period ended inside this excursion
      return e.continuesAfter && e.lastHigh ? `${base}; continued after the end of the period (until ${fmtTs(e.lastHigh)})` : base;
    },
    eventPeak: (peak: number) => `peak ${fmtTemp(peak)}`,
    eventBackAt: (ts: string) => `back to normal at ${fmtTs(ts)}`,
    eventErrors: (n: number) => plural(n, 'error reading') + ' inside',

    quality: 'Data quality',
    qReadings: 'Readings',
    qErrors: 'Error readings',
    qConflicts: 'Conflicts',
    qGaps: 'Gaps',
    qInterval: (logger: string, min: number | null) => `${logger}: ${min === null ? 'interval unknown' : `every ${fmtDuration(min)}`}`,
    gapLine: (from: string, to: string, minutes: number) => `${fmtTs(from)} to ${fmtTs(to)} (${fmtDuration(minutes)}): temperature unknown`,

    threshold: 'Limit for this fridge',
    thresholdHelp: 'Above this temperature counts as too warm (strictly above). Default 5.0 °C.',
    thresholdSave: 'Save limit',
    thresholdSaved: 'Saved.',
    thresholdUnit: '°C',

    loggers: 'Logger history',
    loggersNone: 'No logger has been assigned to this fridge.',
    period: (from: string, to: string | null) => (to ? `${fmtTs(from)} to ${fmtTs(to)}` : `since ${fmtTs(from)}`),
    current: 'current',
  },

  loggerUnit: {
    unit: (u: 'C' | 'F' | null) => (u ? `°${u}` : '—'),
    change: 'Change unit',
    to: (u: 'C' | 'F') => `Change to °${u}`,
    confirmTitle: (id: string, from: 'C' | 'F', to: 'C' | 'F') => `Change ${id} from °${from} to °${to}?`,
    confirmBody: (count: number | null) =>
      `All ${count === null ? '' : `${count} `}readings of this logger, in every fridge it has been in, will be recomputed from the original values stored at upload. Nothing is lost: you can change it back.`,
    confirmYes: (u: 'C' | 'F') => `Yes, recompute as °${u}`,
    cancel: 'Cancel',
    working: 'Recomputing…',
    done: (n: number, u: 'C' | 'F') => `${plural(n, 'reading')} recomputed as °${u}.`,
  },

  report: {
    title: 'Inspector report',
    fridge: 'Fridge',
    print: 'Print',
    back: '← Fridge page',
    period: (from: string, to: string) => `${fmtTs(from, true)} to ${fmtTs(to, true)}`,
    events: 'Times above the limit',
    eventsNone: 'None in this period.',
    cols: { when: 'When', duration: 'How long', peak: 'Peak', kind: 'Kind' },
    gaps: 'No readings (temperature unknown)',
    coverage: (percent: number, missing: number) =>
      percent >= 100 ? 'Readings cover the whole period.' : `Readings cover ${percent}% of the period; ${fmtDuration(missing)} has no readings.`,
    cols2: { from: 'From', to: 'To', length: 'Length' },
    notes: 'About this data',
    wholeBranch: (branch: string) => `Whole branch: ${branch}`,
  },

  branchReport: {
    title: 'Branch report',
    branch: 'Branch',
    all: 'All branches',
    summary: 'Summary',
    cols: { fridge: 'Fridge', times: 'Times above the limit', longest: 'Longest', peak: 'Peak', coverage: 'Readings cover' },
    times: (n: number, spikes: number) => `${n}${spikes ? ` (+${plural(spikes, 'short spike')})` : ''}`,
    none: '—',
    coverage: (p: number) => `${p}%`,
    intro: (n: number) => `${plural(n, 'fridge')}. The full report for each fridge follows the summary, one per page when printed.`,
    link: 'Branch report',
    button: 'Inspector report',
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
      case 'low_coverage':
        return `Readings cover only ${n(p.percent)}% of this period; the rest is unknown.`;
      case 'stale':
        return `No readings since ${t(p.last)} (${fmtDuration(n(p.minutes))} before the latest data).`;
      case 'gap':
        return `${plural(n(p.count), 'gap')} in the data; longest ${fmtDuration(n(p.longest))} (${t(p.from)} to ${t(p.to)}). The temperature then is unknown.`;
      case 'errors':
        return `${plural(n(p.count), 'error reading')} (e.g. "ERR") in this period.`;
      case 'spikes':
        return `${plural(n(p.count), 'short spike')} of up to 30 min (door?).`;
      case 'conflicts':
        return `${plural(n(p.count), 'reading')} with two different values at the same time; the higher one is used.`;
      default:
        return r.code;
    }
  },
} as const;
