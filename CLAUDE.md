# Instructions for AI tools in this repo

Read `INIT.md` (what to build, in which order) and `DECISIONS.md` (every rule and why) before changing anything.

## Rules
- Business logic lives only in `server/src/core` as pure functions: no DB, no fs, no `Date.now()` (pass time in).
- Every core function gets a Vitest test, written before or with the code. A bug fix starts with a failing test.
- Never fill in or guess missing data. A gap is "unknown". No interpolation, no smoothing.
- Never convert units silently. Keep `original_value` and `original_unit`. Unit is a per-logger setting, confirmed by a human.
- Fridge identity is branch + fridge, not the logger id.
- Do not filter short spikes out of the inspector report; label them.
- "No data" must never look like "fine": grey is not green.
- Minimal dependencies (list in D17). Any new one needs a line in `DECISIONS.md`.
- Record every new decision in `DECISIONS.md` and every AI mistake or rejected AI suggestion in `AI_LOG.md`.
- Keep routes thin (parse request -> call service -> send JSON). Keep UI strings in `client/src/strings.ts`.
- Mobile first: check layouts at 375px width. The report page must print cleanly.
- Times are local wall-clock strings `YYYY-MM-DDTHH:mm`. Do arithmetic with `toMinutes()` from `core/time.ts`, never `new Date(localString)`.

## Facts that are easy to get wrong
- Haifa TL-0231 is Fahrenheit: 38.3 F = 3.5 C. Dividing by 10 (3.83) is wrong and a test guards it.
- The email sample has 16 rows. Use the fixture, do not retype it.
- Dashboard "now" is the latest reading in the DB (`asOf`), not the wall clock (D22).

## Before saying "done"
`npm test` green, `npm run seed` runs, the changed screen checked at 375px, docs updated.

## Commits
Small, message explains why. Commits written with AI carry `Co-Authored-By: Claude <noreply@anthropic.com>`.
