# INIT.md - Master build instructions

Read this file first, then `CLAUDE.md` and `DECISIONS.md`. Build in the stages below.
Finish and verify a stage before starting the next. Do not skip tests.

## 1. Context
Client: Summer Smith, operations at Squanchy Bakery (12 branches, a few fridges each, one temperature logger per fridge).
Problem: weekly logger files are pasted into one Excel sheet (~3,000 rows) and checked by eye on Sundays.
- She cannot answer the Ministry of Health inspector: "when did this fridge go above five degrees, and for how long?"
- Last month a full fridge of dairy in Rishon was thrown out: it had been slowly warming for two days and nobody noticed.
- She mostly uses her phone.

She wants: upload the files, see in one place how every fridge is doing and where something is wrong, answer the inspector.
Hard constraint (the only one): runs on a laptop from the README, no accounts, no paid services.
Summer is unreachable: make a call, write it in `DECISIONS.md`.

### The sample data (all 16 rows, exactly as in the email)
This is also a test fixture: `sample-data/email-sample.csv` and `server/src/core/fixtures/emailSample.ts` (D20).
```
Logger  Branch         Fridge       Time              Temp
TL-0512 Jerusalem      Dairy        2026-09-14 06:00  3.8
TL-0417 Tel Aviv       Walk-in      2026-09-14 06:00  4.1
TL-0231 Haifa          Dairy        14/09/2026 06:00  38.3   <- Fahrenheit (~3.5 C), not "x10"
TL-0512 Jerusalem      Dairy        2026-09-14 06:15  3.9
TL-0417 Tel Aviv       Walk-in      2026-09-14 06:15  9.4    <- one high reading (door)
TL-0388 Rishon LeZion  Cream cakes  2026-09-14 06:00  4.6
TL-0417 Tel Aviv       Walk-in      2026-09-14 06:30  4.3    <- back to normal: proves it was a spike
TL-0231 Haifa          Dairy        14/09/2026 06:15  39.0   <- Fahrenheit (~3.9 C)
TL-0512 Jerusalem      Dairy        2026-09-14 06:15  3.9    <- exact duplicate
TL-0388 Rishon LeZion  Cream cakes  2026-09-14 06:15  5.4    <- above 5
TL-0417 Tel Aviv       Walk-in      2026-09-14 05:45  4.0    <- out of order
TL-0388 Rishon LeZion  Cream cakes  2026-09-14 06:30  6.3
TL-0231 Haifa          Dairy        14/09/2026 06:30  ERR    <- error reading
TL-0388 Rishon LeZion  Cream cakes  2026-09-14 06:45  7.1    <- still rising at end of data: ongoing, red
TL-0512 Jerusalem      Dairy        2026-09-14 08:30  4.0    <- 2h15m after 06:15: gap
TL-0417 tel aviv       Display 2    2026-09-17 06:00  3.7    <- logger moved, lower-case branch
```
Real logger files contain only time + temperature. Logger id, branch and fridge are typed by Summer.

Note: the Rishon rows in the sample are a **fast** rise in *Cream cakes* this week. The **slow two-day** warm-up was a
*Dairy* fridge last month. The seed keeps both stories apart (D21).

## 2. Stack (fixed, see D15-D19)
- Node >= 22.13 (developed and verified on 22.23; Summer's laptop has 24.12). SQLite via built-in `node:sqlite`.
- Server: Node + Express + TypeScript, run with `tsx`.
- Client: React + TypeScript + Vite + Tailwind CSS v4 (`@tailwindcss/vite`, via npm, no CDN). Charts: Recharts.
- Tests: Vitest. npm workspaces: `server`, `client`.
- Root scripts: `npm run dev`, `npm run seed`, `npm test`, `npm run build`, `npm start`.
- Any new dependency needs a line in `DECISIONS.md`.

## 3. Repo layout
```
/  README.md NOTES.md DECISIONS.md AI_LOG.md CLAUDE.md INIT.md PLAN.md package.json
server/src/core/       pure functions + *.test.ts (no DB, no fs, no Date.now())
server/src/db/         schema.sql, connection, repository functions
server/src/services/   import (preview/confirm) and analysis glue: core + db
server/src/routes/     thin HTTP handlers
server/src/seed/       deterministic generator, writes sample-data/*.csv and imports them through the real import path
client/src/            pages, components, api client, strings.ts
sample-data/           generated CSVs for manual upload (both upload modes, messy)
```

## 4. Stages and acceptance criteria

### Stage A - docs and scaffold
Workspaces, TS configs, Vitest, Tailwind v4, `concurrently` dev script, Express server with `GET /api/health`.
Acceptance: `npm install && npm test` runs.

### Stage B - core (pure) + tests [MOST IMPORTANT]
Modules in `server/src/core/`:
1. `units.ts` - `suggestUnit(values, headerHint?)` returns `{unit, confidence, reason}`, a SUGGESTION only. `toCelsius`.
   **Commit the Fahrenheit test alone first, failing against a stub** (proof of the caught AI mistake).
2. `parseTime.ts` - ISO `YYYY-MM-DD HH:mm[:ss]` (space or `T`) and `DD/MM/YYYY HH:mm` (`/`, `.` or `-`). Slash order detected per file (D12). Output local `YYYY-MM-DDTHH:mm`, no timezone conversion (D13).
3. `parseTemp.ts` - numbers (`3.8`, `-1.5`, `3,8`, `38.3°F`); `ERR`, empty, text -> status `error`, never 0, never dropped.
4. `csv.ts` - delimiter detection (tab, comma, semicolon), quotes, BOM.
5. `names.ts` - trim, collapse spaces, case-insensitive match to canonical names (known names win).
6. `columns.ts` - map columns by content, not position. Sheet mode (logger, branch, fridge, time, temp) and raw mode (time + temp, or date + time + temp), any order, with or without header.
7. `dedupe.ts` - exact duplicate dropped and counted; same logger+time+different number kept, both `conflict`. Order-independent.
8. `gaps.ts` - typical interval = most common delta (D5); gap = delta > 2.5 x typical.
9. `events.ts` - excursions above threshold: min/max duration, class (spike / unverified / sustained / ongoing), gaps, errors, peak (D6-D8).
10. `trend.ts` - warm-up vs the fridge's own baseline (D10), plus first time the warning fired.
11. `status.ts` - red / orange / grey / green with reasons (D11, D22, D23).
12. `assignments.ts` - which fridge a logger belonged to at a time; rebuild history from change points (D25).
13. `report.ts` - plain-English sentence for the inspector + reliability notes.
14. `analyze.ts` - one call that runs 8-11 for a fridge.

Required tests (each its own `it`): Fahrenheit (38.3 -> 3.5, fails if someone divides by 10); ERR; both date formats;
ambiguous date; unsorted rows; exact duplicate; conflicting duplicate; name casing; gap of 2h15m on the email sample;
door spike not red (boundary: max exactly 30 min); sustained excursion red; excursion next to a gap = unknown duration;
the 06:00/06:15/06:30/06:45 example (min 15, max 45, unverified); Rishon slow warm-up is orange before 5.0 and red after;
logger moved between fridges; re-import is idempotent; **whole email sample end to end** (D20).
Acceptance: `npm test` green.

### Stage C - DB + import + seed + API
Schema in section 5. Import is stateless: preview and confirm both receive the file texts (JSON), nothing is stored on preview.
`npm run seed` is deterministic (fixed PRNG seed) and builds one week (2026-09-14 .. 2026-09-20) for 12 branches, 2-4 fridges each, intervals 15/30/60 min:
- The 16 email rows verbatim, inside a weekly "sheet" file for Jerusalem, Tel Aviv, Haifa, Rishon LeZion.
- Rishon / Cream cakes: the fast rise from the email continues to 7.4 and is fixed by 08:15 (sustained excursion).
- Rishon / Dairy: slow warm-up from 18 Sep, crosses 5.0 on day 2 (orange first, then red).
- Tel Aviv: door spikes; TL-0417 moves Walk-in -> Display 2 on 17 Sep (Walk-in then has no logger: grey).
- Haifa: logger in Fahrenheit. Petah Tikva / Cheese: warming now, still below 5 (orange).
- A 60-min logger with one high reading (unverified, orange), a battery gap, repeated ERR, conflicts, mixed casing, shifted columns, both date formats.
- Raw logger files in several shapes. Plus `new-logger-TL-0240.csv` (unknown logger, in °F) to try the upload flow.
- `npm run seed -- --empty` creates an empty DB so the upload can be tried from zero.
Seed imports its own files through the real import service (it is an integration test of the import path).

API (thin routes, logic in core/services):
- `POST /api/imports/preview` `{files:[{name,text}]}` -> detection summary per file. Saves nothing.
- `POST /api/imports/confirm` `{files, decisions}` -> saves. Requires a unit decision for every unconfirmed logger.
- `GET /api/dashboard?window=7d|24h`
- `GET /api/fridges/:id?from&to`, `GET /api/fridges/:id/report?from&to`, `PATCH /api/fridges/:id` (max temp, name)
- `GET /api/search?above=&minMinutes=&from=&to=&certainty=possibly|certainly`
- CRUD-lite: `GET/POST /api/branches`, `POST /api/fridges`, `GET /api/loggers`, `PATCH /api/loggers/:id` (unit), `POST /api/loggers/:id/move`.
Acceptance: uploading the same file twice gives an identical DB (test + manual check).

### Stage D - client (mobile first, verify at 375px)
- Dashboard: "as of" time, 7d/24h toggle, "needs attention" first (red, orange, grey), green collapsed by branch. Grey looks clearly different from green.
- Upload: pick or drop several files, or paste from Excel -> preview (rows, columns found, date format, loggers, °F suggestion with confirm, duplicates, conflicts, errors, gaps, new branches/fridges, unknown loggers) -> confirm -> result.
- Fridge page: Recharts line chart (threshold line, gap shading, error marks, excursion bands, first warm-up warning), events list, data quality, threshold editor, logger history.
- Inspector report: fridge + date range -> sentence + events table + reliability notes + print stylesheet.
- Threshold search: "fridges above X °C for at least N minutes between dates".
- Setup (CRUD-lite): branches and fridges, add fridge, move a logger, change a logger's unit.
- All UI strings in `client/src/strings.ts`. UI language English.

### Stage E - docs
README verified from a clean clone. NOTES.md filled. DECISIONS.md and AI_LOG.md kept current.

## 5. Data model
```
branches(id, name UNIQUE COLLATE NOCASE)
fridges(id, branch_id, name, max_temp REAL DEFAULT 5.0, min_temp REAL NULL, UNIQUE(branch_id, name COLLATE NOCASE))
loggers(id TEXT PK, unit 'C'|'F' DEFAULT 'C', unit_confirmed INT DEFAULT 0)
logger_assignments(id, logger_id, fridge_id, valid_from, valid_to NULL)   -- no overlaps per logger
imports(id, filename, uploaded_at, row_count, new_rows, sha256)
measurements(id, logger_id, fridge_id, ts, original_value TEXT, original_unit, value_key, temp_c REAL NULL,
             status 'ok'|'error'|'conflict', import_id, UNIQUE(logger_id, ts, value_key))
import_issues(id, import_id, row_no, kind, detail)
```
Fridge identity = branch + fridge name, never the logger.

## 6. Working rules
- Commit small and often; messages explain why. AI-written commits carry a `Co-Authored-By` trailer.
- Log every AI mistake or rejected suggestion in `AI_LOG.md` when it happens.
- When unsure, decide, write it in `DECISIONS.md`, move on.
- If time runs out, cut in this order: setup screen, threshold search, trend first-warning scan, trend algorithm (keep the Rishon seed data regardless).
  Never cut: normalization, duration calculation, grey vs green, tests, README.
