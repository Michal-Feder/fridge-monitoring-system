# PLAN (checklist)

## A scaffold
- [x] workspaces + TS + Vitest + Tailwind v4 - [x] `concurrently` dev script - [x] Express `/api/health` - [x] `.gitignore`

## B core + tests
- [x] units (Fahrenheit test committed alone, failing) - [x] time + parseTime - [x] parseTemp - [x] csv - [x] names - [x] columns
- [x] dedupe - [x] gaps - [x] events - [x] trend - [x] status - [x] assignments - [x] report - [x] analyze - [x] email sample end to end

## C DB + import + seed + API
- [x] schema.sql - [x] import preview / confirm (idempotent) - [x] seed + sample-data - [x] dashboard - [x] fridge - [x] report
- [x] search - [x] PATCH fridge - [x] CRUD-lite

## D client
- [x] dashboard - [x] upload + preview - [x] fridge chart - [x] inspector report + print - [x] search - [x] setup - [x] check at 375px

## E docs
- [x] README from clean clone (clone, `npm install`, `npm run seed`, `seed -- --empty`, `npm test`, `npm run build`, `npm run dev` checked on Windows / Node 24.12)
- [x] NOTES.md (left: "Time spent", to be filled in by hand) - [x] DECISIONS (D1-D47) / AI_LOG up to date

## Review fixes and extras
- [x] raw file across a logger move (D44) - [x] period ending inside an excursion (D45) - [x] branch report (D46)

## Left (not in the brief, see NOTES "Not done / next hour")
- [ ] alerts, over-cooling check (D30), acknowledging an excursion (question for Summer), CSV export of the report
