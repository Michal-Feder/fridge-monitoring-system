import { describe, it, expect } from 'vitest';
import { sheetToTsv, serialToDate, type Cell } from './excel.ts';

// read-excel-file returns date cells as UTC instants of the wall-clock time
const at = (y: number, mo: number, d: number, h = 0, mi = 0, ms = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi, 0, ms));

describe('Excel sheet -> tab-separated text (D50)', () => {
  it('writes date cells as "YYYY-MM-DD HH:mm" and keeps text and numbers as they are (ERR stays ERR)', () => {
    const rows: Cell[][] = [
      ['Logger', 'Branch', 'Fridge', 'Time', 'Temp'],
      ['TL-0512', 'Jerusalem', 'Dairy', at(2026, 9, 14, 6, 0), 3.8],
      ['TL-0231', 'Haifa', 'Dairy', at(2026, 9, 14, 6, 30), 'ERR'],
      ['TL-0231', 'Haifa', 'Dairy', at(2026, 9, 14, 6, 15), 38.3],
    ];
    expect(sheetToTsv(rows)).toBe(
      ['Logger\tBranch\tFridge\tTime\tTemp', 'TL-0512\tJerusalem\tDairy\t2026-09-14 06:00\t3.8', 'TL-0231\tHaifa\tDairy\t2026-09-14 06:30\tERR', 'TL-0231\tHaifa\tDairy\t2026-09-14 06:15\t38.3'].join('\n'),
    );
  });

  it('rounds to the minute (Excel stores times as fractions of a day)', () => {
    expect(sheetToTsv([['Time', 'Temp'], [at(2026, 9, 14, 6, 14, 59999), 4]])).toBe('Time\tTemp\n2026-09-14 06:15\t4');
  });

  it('a separate date column and time column stay separate: "YYYY-MM-DD" and "HH:mm"', () => {
    const rows: Cell[][] = [
      ['Date', 'Time', 'Temp'],
      [at(2026, 9, 20), at(1899, 12, 30, 0, 15), 37.8],
      [at(2026, 9, 20), at(1899, 12, 30, 23, 45), 38.0],
    ];
    expect(sheetToTsv(rows)).toBe('Date\tTime\tTemp\n2026-09-20\t00:15\t37.8\n2026-09-20\t23:45\t38');
  });

  it('plain numbers in a column headed "Time" are Excel serial dates; elsewhere numbers stay numbers', () => {
    const serial = (Date.UTC(2026, 8, 14, 6, 0) - Date.UTC(1899, 11, 30)) / 86400000;
    expect(serialToDate(serial).toISOString()).toBe('2026-09-14T06:00:00.000Z');
    expect(sheetToTsv([['Time', 'Temp'], [serial, 46279]])).toBe('Time\tTemp\n2026-09-14 06:00\t46279');
  });

  it('drops empty rows and turns tabs or line breaks inside a cell into spaces', () => {
    expect(sheetToTsv([['Logger', 'Branch'], [null, null], ['TL-1', 'Tel\tAviv\nnorth']])).toBe('Logger\tBranch\nTL-1\tTel Aviv north');
  });
});
