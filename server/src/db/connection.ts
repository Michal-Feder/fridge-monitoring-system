import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = DatabaseSync;

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = resolve(here, '../../data/fridge.db');

/** Opens (and creates) the database. Use ':memory:' in tests. */
export function openDb(path: string = DEFAULT_DB_PATH): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));
  return db;
}

/** Runs fn in a transaction; rolls back on error. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
