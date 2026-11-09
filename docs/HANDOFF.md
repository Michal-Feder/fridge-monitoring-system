# HANDOFF - instructions for Claude Code

You are continuing a build that was started in a cloud session that could not install npm packages.
The repo you are in has two commits: the original planning docs and the revised plan. Read `INIT.md`,
`CLAUDE.md` and `DECISIONS.md` first. They are the spec.

This handoff folder (`../handoff/` next to the repo, NOT inside it) contains code that is already written:

| Path in `files/` | State |
|---|---|
| `server-src/core/*` | Written AND run: 62 tests green on Node 22, `tsc --noEmit` clean. Uses `import ... from './x.ts'` (needs `allowImportingTsExtensions`, see `server-tsconfig.json`). |
| `server-src/core/units.STUB.ts` | The stub used for the "failing test first" commit (step 2). |
| `server-src/db/*`, `server-src/services/importService.ts` | Written and smoke-tested with `node:sqlite` (preview, confirm, idempotent re-import, conflict marks the existing row too, logger move, raw file needing branch/fridge). No Vitest tests yet: you write them in step 6. |
| `DECISIONS.md`, `AI_LOG.md` | Final versions after the core work (D10 revised to 1.0 °C, 2 extra AI_LOG rows). Copy them in at step 5. |

Never copy this folder into the repo. Copy files into place step by step as below.

## Working rules (in addition to CLAUDE.md)
- **Do not run `git commit` or `git push`.** At the end of each step print a `COMMIT POINT` block: the list of changed
  files, what to look at in the diff, and a suggested commit message. Then stop and wait for "next". The human commits.
- Do not change rules in `core/` without a failing test first and a DECISIONS.md entry.
- Every step ends with `npm test` green (except step 2, which must be red on purpose).
- If you find a bug in the handed-off code, fix it with a test, and add a line to AI_LOG.md
  (tool: "Claude (cloud session)", what was wrong, how you caught it).
- Windows machine. Node 24. Use cross-platform npm scripts (no `rm -rf`, no `&&`-chains that need bash).

## Steps (one COMMIT POINT each)

### 1. Stage A - scaffold
- Root `package.json`: workspaces `server`, `client`; `engines.node >= 22.13`; scripts `dev` (concurrently: server + client),
  `seed`, `test`, `build`, `start` (server serves `client/dist` + API on 3001). Dev dep: `concurrently`.
- `server`: deps `express`; dev `typescript`, `tsx`, `vitest`, `@types/node`, `@types/express`. `tsconfig.json` = `files/server-tsconfig.json`.
  `src/index.ts`: Express app on 3001, `express.json({ limit: '25mb' })`, `GET /api/health`. Fail fast with a clear message if Node < 22.13.
  Vitest config so `npm test` passes with zero tests.
- `client`: React + Vite + TypeScript + Tailwind v4 (`@tailwindcss/vite`) + Recharts. Vite on 5173, `/api` proxied to 3001. Placeholder page that calls `/api/health`.
- `.gitignore`: node_modules, dist, `server/data/`, `*.db*`.
- `npm install`, `npm test`, `npm run dev` work. Commit `package-lock.json`.
- Suggested message: `Stage A: workspaces, Express, Vite + Tailwind v4 + Recharts, concurrently dev script`

### 2. Failing Fahrenheit test (the caught AI mistake)
- Copy `core/units.test.ts` and `core/units.STUB.ts` -> `server/src/core/units.ts`. Run `npm test`: **8 failing tests is the expected result**.
- Suggested message: `Failing test: Haifa TL-0231 is Fahrenheit, not x10 (AI mistake caught)` with a body explaining
  Gemini's /10 suggestion (38.3/10 = 3.83 looks healthy; correct is 3.5 C). See AI_LOG.

### 3. units implementation
- Copy the real `core/units.ts`. 8 green. Message: `Implement units: Fahrenheit suggestion by median, toCelsius`

### 4. Core parsing
- Copy `time.ts`, `parseTime.ts`, `parseTemp.ts`, `csv.ts`, `names.ts`, `columns.ts`, `fixtures/emailSample.ts`, `parsing.test.ts`.
- Message: `Core parsing: time, temperature, CSV, names, columns by content`

### 5. Core logic
- Copy `dedupe.ts`, `gaps.ts`, `events.ts`, `trend.ts`, `status.ts`, `assignments.ts`, `analyze.ts`, `report.ts`, `importFile.ts`,
  `logic.test.ts`, `emailSample.test.ts`. Replace `DECISIONS.md` and `AI_LOG.md` with the handoff versions.
- 62 tests green. Message: `Core logic: dedupe, gaps, excursions, trend, status, assignments, report` and mention in the body that
  the Rishon test forced the trend threshold from 1.5 to 1.0 °C (D10) and the email test forced mode-interval gaps (D5).

### 6. DB + import service
- Copy `db/*` and `services/importService.ts`. Write `server/src/services/importService.test.ts` (in-memory DB, `openDb(':memory:')`):
  email sample preview (16 read, 15 new, 1 duplicate, all 4 loggers need a unit decision, Haifa suggested F); confirm;
  **confirm again -> identical DB snapshot**; a later file with 4.9 at Jerusalem 06:15 marks both rows `conflict`;
  TL-0417 history Walk-in -> Display 2; raw file `TL-0240.csv` needs branch/fridge, then confirms with a decision.
- Message: `DB + stateless import preview/confirm, idempotent re-import tested`

### 7. Seed + sample-data (INIT Stage C list, D21, D31)
- Deterministic PRNG. Writes `sample-data/*.csv` (both upload modes, messy) and imports them **through `confirmImport`**.
  Week 2026-09-14..20. Must include the 16 email rows verbatim; Rishon/Cream cakes continues to 7.4 and is fixed by 08:15;
  Rishon/Dairy slow warm-up from 18 Sep (orange first, red after 5.0); Petah Tikva/Cheese warming now, still < 5 (orange);
  60-min logger with one high reading (unverified); battery gap; repeated ERR; conflicts; `new-logger-TL-0240.csv` (°F, unknown logger).
  Seed also needs a few days BEFORE the week so trend has 3 days history (start the generated data on 2026-09-10).
  `npm run seed -- --empty` = empty DB.
- After seeding, print a table of every fridge's status and check it against the story above. Message: `Seed: 12 branches, demo stories, messy sample files`

### 8. API (Express, thin routes; INIT Stage C list)
- `services/analysisService.ts`: loads readings + assignments for a fridge and calls `core/analyze.ts` and `core/report.ts`.
  `asOf` = latest reading in DB (D22). Dashboard window 7d (default) or 24h. Warning scan for the fridge page.
- Routes: preview, confirm, dashboard, fridge, report, PATCH fridge, search (D29), branches, fridges, loggers, PATCH logger unit
  (recomputes temp_c, D4), POST logger move. Route tests with supertest are NOT needed; test the services.
- Message: `API: dashboard, fridge, report, search, setup endpoints`

### 9-12. Client (one commit per screen; mobile first, check 375px; strings in `client/src/strings.ts`)
9. Dashboard (needs attention first, green collapsed by branch, grey clearly different, "as of" time, 7d/24h).
10. Upload: files / drag-drop / paste -> preview (everything in `PreviewResult`) -> unit confirm, raw file assignment -> confirm -> result.
11. Fridge page: Recharts line, `ReferenceLine` threshold, `ReferenceArea` for gaps (grey) and excursions (red/orange), error marks,
    first warm-up warning marker, events list, data quality, threshold editor, logger history. Inspector report page + print CSS.
12. Threshold search + Setup (add fridge, move logger, change unit).

### 13. Docs
README from a clean clone (check every command), NOTES.md filled (time spent, decisions, questions for Summer,
not done, AI mistakes: Fahrenheit, the stack reversal, D5/D8/D10 caught by tests). PLAN.md ticked.
