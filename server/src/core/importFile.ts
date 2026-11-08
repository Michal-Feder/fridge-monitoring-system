// Turns the text of one uploaded file into rows. Pure: no DB. The import service adds what the DB knows
// (existing names, logger units, assignments) and decides what to save.
import { parseCsv } from './csv.ts';
import { detectColumns, type ColumnDetection } from './columns.ts';
import { detectDateFormat, parseTime, parseDateAndTime, type DateFormatDetection } from './parseTime.ts';
import { parseTemp } from './parseTemp.ts';
import { normalizeLoggerId, looksLikeLoggerId, cleanName, loggerIdFromFilename } from './names.ts';
import type { Unit } from './units.ts';
import type { LocalTs } from './time.ts';

export interface FileRow {
  lineNo: number;
  loggerId: string | null;
  branch: string | null;
  fridge: string | null;
  ts: LocalTs;
  originalValue: string;
  value: number | null;
  status: 'ok' | 'error';
  unitHint: Unit | null;
}

export interface FileIssue {
  lineNo: number;
  kind: 'bad_time' | 'missing_logger' | 'missing_names' | 'short_row';
  detail: string;
}

export interface ParsedFile {
  name: string;
  detection: ColumnDetection;
  dateFormat: DateFormatDetection | null;
  rows: FileRow[];
  issues: FileIssue[];
  /** D26: logger id found in the file name (raw files) */
  loggerIdFromName: string | null;
}

export function parseFile(name: string, text: string, knownBranches: string[] = []): ParsedFile {
  const table = parseCsv(text);
  const detection = detectColumns(table, knownBranches);
  const loggerIdFromName = loggerIdFromFilename(name);
  if (!detection.ok) return { name, detection, dateFormat: null, rows: [], issues: [], loggerIdFromName };

  const c = detection.columns;
  const dataRows = detection.hasHeader ? table.rows.slice(1) : table.rows;
  const timeValues = dataRows.map((r) => (c.datetime !== undefined ? r.cells[c.datetime] : r.cells[c.date!]) ?? '');
  const dateFormat = detectDateFormat(timeValues);

  const rows: FileRow[] = [];
  const issues: FileIssue[] = [];
  for (const { lineNo, cells } of dataRows) {
    const get = (i: number | undefined) => (i === undefined ? '' : (cells[i] ?? '').trim());
    const ts = c.datetime !== undefined ? parseTime(get(c.datetime), dateFormat.order) : parseDateAndTime(get(c.date), get(c.clock), dateFormat.order);
    if (!ts) {
      const shown = c.datetime !== undefined ? get(c.datetime) : `${get(c.date)} ${get(c.clock)}`;
      issues.push({ lineNo, kind: 'bad_time', detail: `Cannot read the time "${shown}"; row skipped.` });
      continue;
    }
    let loggerId: string | null = null;
    if (c.logger !== undefined) {
      const raw = get(c.logger);
      if (!raw || !looksLikeLoggerId(raw)) {
        issues.push({ lineNo, kind: 'missing_logger', detail: `Logger id "${raw}" is missing or not valid; row skipped.` });
        continue;
      }
      loggerId = normalizeLoggerId(raw);
    }
    let branch: string | null = null;
    let fridge: string | null = null;
    if (detection.mode === 'sheet') {
      branch = cleanName(get(c.branch));
      fridge = cleanName(get(c.fridge));
      if (!branch || !fridge) {
        issues.push({ lineNo, kind: 'missing_names', detail: 'Branch or fridge is empty; row skipped.' });
        continue;
      }
    }
    const temp = parseTemp(get(c.temp));
    rows.push({ lineNo, loggerId, branch, fridge, ts, originalValue: temp.raw, value: temp.value, status: temp.status, unitHint: temp.unitHint });
  }
  return { name, detection, dateFormat, rows, issues, loggerIdFromName };
}
