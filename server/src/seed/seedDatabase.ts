// Imports the generated files through the real import service, exactly like an upload + confirm.
import type { Db } from '../db/connection.ts';
import { confirmImport, type ConfirmResult, type UploadFile, type Decisions } from '../services/importService.ts';
import { UPLOADED_AT, type SeedFiles } from './generate.ts';

function confirmOrThrow(db: Db, files: UploadFile[], decisions: Decisions): ConfirmResult {
  const r = confirmImport(db, files, decisions, UPLOADED_AT);
  if (!r.ok) throw new Error(`Seed import was refused:\n- ${r.blocking.join('\n- ')}`);
  return r;
}

export function seedDatabase(db: Db, files: SeedFiles): { sheets: ConfirmResult; raw: ConfirmResult } {
  const sheets = confirmOrThrow(db, files.batch1, files.decisions1);
  const raw = confirmOrThrow(db, files.batch2, files.decisions2);
  return { sheets, raw };
}
