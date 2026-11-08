// Small CSV/TSV reader: detects the delimiter (tab, comma, semicolon), handles quotes and a BOM.
export type Delimiter = '\t' | ',' | ';';

export function detectDelimiter(text: string): Delimiter {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  const candidates: Delimiter[] = ['\t', ';', ','];
  let best: Delimiter = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map((l) => splitLine(l, d).length);
    if (counts.length === 0) continue;
    const min = Math.min(...counts);
    // the delimiter that gives the same number (>1) of columns on most lines wins
    const consistent = counts.filter((c) => c === counts[0]).length;
    const score = min > 1 ? consistent * 10 + min : 0;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export interface CsvTable {
  delimiter: Delimiter;
  /** rows with their 1-based line number in the file */
  rows: { lineNo: number; cells: string[] }[];
}

export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(clean);
  const rows: CsvTable['rows'] = [];
  clean.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = splitLine(line, delimiter);
    if (cells.every((c) => c === '')) return;
    rows.push({ lineNo: i + 1, cells });
  });
  return { delimiter, rows };
}
