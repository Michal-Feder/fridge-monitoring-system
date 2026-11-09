// npm run seed            -> fresh DB with the demo week + sample-data/*.csv
// npm run seed -- --empty -> fresh, empty DB (try the upload from zero)
import '../checkNode.ts';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, DEFAULT_DB_PATH } from '../db/connection.ts';
import * as repo from '../db/repo.ts';
import { generateSeedFiles } from './generate.ts';
import { seedDatabase } from './seedDatabase.ts';
import { statusTable, formatStatusTable } from './statusTable.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = resolve(here, '../../../sample-data');
const empty = process.argv.includes('--empty');

try {
  for (const suffix of ['', '-wal', '-shm']) rmSync(DEFAULT_DB_PATH + suffix, { force: true });
} catch (e) {
  console.error(`Cannot delete ${DEFAULT_DB_PATH}. Stop the server (npm run dev / npm start) and run the seed again.`);
  console.error(String(e));
  process.exit(1);
}

const db = openDb(DEFAULT_DB_PATH);

if (empty) {
  console.log(`Empty database created at ${DEFAULT_DB_PATH}. Upload files from sample-data/ to fill it.`);
  db.close();
  process.exit(0);
}

const files = generateSeedFiles();
mkdirSync(SAMPLE_DIR, { recursive: true });
for (const f of [...files.batch1, ...files.batch2, ...files.extra]) writeFileSync(resolve(SAMPLE_DIR, f.name), f.text);

const result = seedDatabase(db, files);
const c = repo.counts(db);
console.log(`Wrote ${files.batch1.length + files.batch2.length + files.extra.length} files to ${SAMPLE_DIR}`);
console.log(
  `Imported sheets: ${result.sheets.newRows} rows (${result.sheets.exactDuplicates} exact duplicates dropped, ${result.sheets.conflicts} conflicting rows kept); ` +
    `raw logger files: ${result.raw.newRows} rows.`,
);
console.log(`Database: ${c.branches} branches, ${c.fridges} fridges, ${c.loggers} loggers, ${c.measurements} measurements -> ${DEFAULT_DB_PATH}\n`);
console.log(formatStatusTable(statusTable(db)));
db.close();
