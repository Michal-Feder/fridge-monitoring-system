# INIT.md - Master build instructions

Read this file first, then CLAUDE.md and DECISIONS.md. Build in the stages below. Finish and verify a stage before starting the next. Do not skip tests.

## 1. Context
Client: Summer Smith, operations at Squanchy Bakery (12 branches, several fridges each, one temperature logger per fridge).
Problem: weekly logger files are pasted into one Excel sheet (~3,000 rows) and checked by eye. She cannot answer the Ministry of Health inspector ("when did this fridge go above 5 degrees, and for how long?"), and a fridge of dairy in Rishon LeZion was lost to a slow, unnoticed warm-up over two days.
She wants: upload files, see in one place how every fridge is doing, answer the inspector. She mostly uses a phone.
Hard constraint (the only one): runs on a laptop from the README, no accounts, no paid services.
Summer is unreachable: make a call, write it in DECISIONS.md.

Source rows (the entire sample data):
```
Logger  Branch         Fridge       Time              Temp
TL-0512 Jerusalem      Dairy        2026-09-14 06:00  3.8
TL-0417 Tel Aviv       Walk-in      2026-09-14 06:00  4.1
TL-0231 Haifa          Dairy        14/09/2026 06:00  38.3   <- Fahrenheit (~3.5 C)
TL-0512 Jerusalem      Dairy        2026-09-14 06:15  3.9
TL-0417 Tel Aviv       Walk-in      2026-09-14 06:15  9.4    <- door open, one reading
TL-0388 Rishon LeZion  Cream cakes  2026-09-14 06:00  4.6
TL-0231 Haifa          Dairy        14/09/2026 06:30  ERR
TL-0512 Jerusalem      Dairy        2026-09-14 06:15  3.9    <- duplicate
TL-0417 Tel Aviv       Walk-in      2026-09-14 05:45  4.0    <- out of order
TL-0512 Jerusalem      Dairy        2026-09-14 08:30  4.0    <- 2h15m gap
TL-0417 tel aviv       Display 2    2026-09-17 06:00  3.7    <- logger moved, name casing
```
Real logger files contain only time + temperature. Logger id, branch and fridge are typed by Summer.

## 2. Stack (fixed)
- Node >= 22.13 (developed on 24.12). SQLite via built-in `node:sqlite` (no native dependency).
- Server: Node + Express + TypeScript. Run with `tsx`. Tests with Vitest.
- Client: React + TypeScript + Vite + Tailwind CSS v4 (`@tailwindcss/vite`), installed via npm, no CDN. Charts: Recharts.
- npm workspaces: `server`, `client`. Root scripts: `npm run dev`, `npm run seed`, `npm test`, `npm run build`.
- Minimal dependencies. Justify any addition in DECISIONS.md.

## 3. Repo layout
```
/ README.md NOTES.md DECISIONS.md AI_LOG.md CLAUDE.md INIT.md PLAN.md package.json
server/src/core/    pure functions + *.test.ts (no DB, no fs, no Date.now())
server/src/db/      schema.sql, connection, queries
server/src/routes/  express routes (thin)
server/src/seed/    deterministic generator + writes sample CSVs
client/src/         pages, components, api client, i18n strings
sample-data/        generated CSVs for manual upload
```

## 4. Stages and acceptance criteria

### Stage A - docs and scaffold
Workspaces, TS configs, Vitest, `concurrently` dev script, empty docs committed. Acceptance: `npm install && npm test` runs (even with zero tests).

### Stage B - core (pure) + tests  [MOST IMPORTANT]
Modules in `server/src/core/`:
1. `parseTime.ts` - ISO `YYYY-MM-DD HH:mm` and `DD/MM/YYYY HH:mm`. Per-file format detection; ambiguous defaults to DD/MM (see D12). Output UTC-agnostic local ISO string; no timezone conversion (see D13).
2. `parseTemp.ts` - numbers; `ERR`, empty, text -> status `error` (never 0, never dropped silently).
3. `normalizeNames.ts` - trim, collapse spaces, case-insensitive match to canonical names.
4. `detectColumns.ts` - map columns by content, not position. Supports 5-column sheet (logger, branch, fridge, time, temp) and raw 2-column logger file, any column order, with or without header.
5. `units.ts` - `suggestUnit(values)` returns `{unit:'C'|'F', confidence, reason}` as a SUGGESTION. `toCelsius`. Original value and unit always kept.
6. `dedupe.ts` - same logger+time+same value: drop and count. Same logger+time+different value: keep both, flag `conflict`.
7. `gaps.ts` - typical interval per logger = median of consecutive deltas; gap = delta > 2.5 x typical.
8. `events.ts` - excursions above threshold, with min/max duration, classification, gaps inside, max temp. Rules in DECISIONS.md D5-D9.
9. `trend.ts` - warm-up detection vs fridge's own baseline (D10).
10. `status.ts` - fridge status red / orange / grey / green (D11).
11. `assignments.ts` - resolve which fridge a logger belonged to at a given time.
Tests required (each its own `it`): Haifa Fahrenheit conversion (TL-0231 38.3 -> ~3.5C; test must fail if someone divides by 10); ERR handling; both date formats; unsorted rows; exact duplicate; conflicting duplicate; name casing; gap of 2h15m; door-open spike not red; sustained excursion red; excursion cut by a gap = unknown duration; the 06:00/06:15/06:30/06:45 example (min 15, max 45); slow warm-up (Rishon) triggers orange before crossing 5.0 and red after; logger moved between fridges; re-import is idempotent.
Acceptance: `npm test` green. Commit tests for the Fahrenheit case separately.

### Stage C - seed + DB + API
Schema (see section 5). `npm run seed` is deterministic (fixed PRNG seed) and creates one week for 12 branches, 2-4 fridges each, different sampling intervals (15/30/60 min), plus:
- Rishon LeZion / Cream cakes: slow warm-up over 2 days, crossing 5.0 on day 2.
- Tel Aviv: door-open spikes (1 reading); TL-0417 moves Walk-in -> Display 2 on 2026-09-17.
- Haifa: logger in Fahrenheit.
- Random gaps, ERR rows, exact and conflicting duplicates, unsorted rows, mixed casing, both date formats, shifted columns.
Also writes messy CSVs into `sample-data/` (both upload modes).
API (thin routes, logic in core):
- `POST /api/imports/preview` multipart; returns detection summary, NOTHING saved.
- `POST /api/imports/confirm` saves; accepts unit confirmations and logger->fridge assignments.
- `GET /api/dashboard`, `GET /api/fridges/:id?from&to`, `GET /api/fridges/:id/report?from&to`
- `PATCH /api/fridges/:id` (threshold etc.), `GET /api/search?above=&minMinutes=&from=&to=`
- CRUD-lite for branches, fridges, loggers, assignments.
Acceptance: upload the same file twice -> identical DB state.

### Stage D - client (mobile first, verify at 375px)
- Dashboard: "needs attention" first; cards sorted by severity; green collapsed; grey clearly different from green.
- Upload: drag/drop or pick several files -> preview screen (rows, loggers, suspected F units with confirm, duplicates, errors, gaps, unknown loggers needing branch/fridge) -> confirm.
- Fridge page: Recharts line chart with threshold line, gap areas shaded, events list, data-quality warnings, threshold editor.
- Inspector report: choose fridge + date range -> plain sentence + events table + reliability notes + print stylesheet.
- Threshold search: "fridges above X C for at least N minutes between dates".
- All UI strings in `client/src/strings.ts`. UI language English.

### Stage E - docs
README verified from a clean clone. NOTES.md filled (headings already present). Update DECISIONS.md and AI_LOG.md throughout.

## 5. Data model
branches(id, name UNIQUE) | fridges(id, branch_id, name, max_temp REAL DEFAULT 5.0, min_temp REAL NULL, UNIQUE(branch_id,name)) | loggers(id TEXT PK, unit TEXT DEFAULT 'C', unit_confirmed INT DEFAULT 0) | logger_assignments(id, logger_id, fridge_id, valid_from, valid_to NULL) no overlaps per logger | imports(id, filename, uploaded_at, row_count, sha256) | measurements(id, logger_id, fridge_id, ts, original_value TEXT, original_unit, temp_c REAL NULL, status 'ok'|'error'|'conflict', import_id, UNIQUE(logger_id, ts, original_value)) | import_issues(id, import_id, row_no, kind, detail).
Fridge identity = branch + fridge name, never the logger.

## 6. Working rules
- Commit small and often, messages explain why.
- Log every AI mistake or rejected suggestion in AI_LOG.md the moment it happens.
- When unsure, decide, write it in DECISIONS.md, move on.
- If time runs out, cut in this order: PDF/XLSX, notes on events, change log, threshold search, trend algorithm (keep the Rishon seed data regardless). Never cut: normalization, duration calculation, grey vs green, tests, README.
