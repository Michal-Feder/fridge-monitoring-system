// D50: Excel (.xlsx) upload, read in the browser. The first sheet becomes tab-separated text, the same as rows
// pasted from Excel, and goes through the normal preview / confirm: the server never sees a spreadsheet.
// Times are written as local wall-clock text ("2026-09-14 06:15"), never through the browser's timezone (D13).

/** One cell as read-excel-file returns it. */
export type Cell = string | number | boolean | Date | null;

const p2 = (n: number) => String(n).padStart(2, '0');

/** Excel has no date type: a date is a number of days since 1899-12-30, shown with a date format. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
export const serialToDate = (serial: number) => new Date(EXCEL_EPOCH_MS + Math.round(serial * 86400000));

/** read-excel-file gives dates as UTC instants of the wall-clock time; round to the minute (Excel stores fractions). */
function parts(d: Date) {
  const r = new Date(Math.round(d.getTime() / 60000) * 60000);
  return { y: r.getUTCFullYear(), mo: r.getUTCMonth() + 1, d: r.getUTCDate(), h: r.getUTCHours(), mi: r.getUTCMinutes() };
}
const isTimeOnly = (d: Date) => parts(d).y <= 1900; // a time-of-day cell sits on Excel's day 0 or 1
const isMidnight = (d: Date) => {
  const x = parts(d);
  return x.h === 0 && x.mi === 0;
};

const DATE_HEADER = /date|time|תאריך|שעה|זמן/i;

function formatDate(d: Date, dateOnly: boolean): string {
  const x = parts(d);
  if (isTimeOnly(d)) return `${p2(x.h)}:${p2(x.mi)}`;
  const date = `${x.y}-${p2(x.mo)}-${p2(x.d)}`;
  return dateOnly ? date : `${date} ${p2(x.h)}:${p2(x.mi)}`;
}

/**
 * Rows of cells -> tab-separated text. Per column:
 * - Date cells -> "YYYY-MM-DD HH:mm"; a column whose dates are all at midnight is a date-only column ("YYYY-MM-DD"),
 *   so a separate Date + Time pair still works; a time-of-day cell -> "HH:mm".
 * - Plain numbers in a column whose header says date or time are Excel serial dates and are converted the same way.
 * - Everything else is kept as text (ERR stays ERR, 38.3 stays 38.3). Tabs and line breaks inside a cell become spaces.
 */
export function sheetToTsv(rows: Cell[][]): string {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const header = rows[0] ?? [];
  const asDate = (c: Cell, col: number): Date | null => {
    if (c instanceof Date) return c;
    if (typeof c === 'number' && typeof header[col] === 'string' && DATE_HEADER.test(header[col] as string) && c >= 0 && c < 100000) return serialToDate(c);
    return null;
  };
  const dateOnly: boolean[] = [];
  for (let col = 0; col < width; col++) {
    const dates = rows.slice(1).map((r) => asDate(r[col] ?? null, col)).filter((d): d is Date => d !== null && !isTimeOnly(d));
    dateOnly[col] = dates.length > 0 && dates.every(isMidnight);
  }
  const text = (c: Cell, col: number, rowIndex: number): string => {
    if (c === null || c === undefined) return '';
    const d = rowIndex === 0 ? null : asDate(c, col);
    if (d) return formatDate(d, dateOnly[col]);
    if (c instanceof Date) return formatDate(c, false);
    if (typeof c === 'boolean') return c ? 'TRUE' : 'FALSE';
    return String(c).replace(/[\t\r\n]+/g, ' ');
  };
  return rows
    .filter((r) => r.some((c) => c !== null && c !== ''))
    .map((r, i) => Array.from({ length: width }, (_, col) => text(r[col] ?? null, col, i)).join('\t'))
    .join('\n');
}

export class ExcelFormatError extends Error {}

/** Old binary Excel (.xls) starts with this signature; read-excel-file only reads .xlsx. */
const XLS_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];

export async function isOldXls(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return XLS_SIGNATURE.every((b, i) => head[i] === b);
}

/** First sheet of an .xlsx file as tab-separated text. The library is loaded only when an Excel file is picked. */
export async function xlsxToTsv(file: File): Promise<string> {
  if (/\.xls$/i.test(file.name) || (await isOldXls(file))) throw new ExcelFormatError('old-xls');
  const { readSheet } = await import('read-excel-file/browser');
  const rows = (await readSheet(file)) as Cell[][];
  return sheetToTsv(rows);
}
