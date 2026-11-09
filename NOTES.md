# NOTES

## Time spent
TODO: X h total: planning ~A h, build ~B h, manual review ~C h.

## How I worked
- Planned with Gemini, GPT and Claude, reviewed the plan myself and kept the result in `INIT.md` and `DECISIONS.md`.
- A cloud Claude session wrote and tested the core rules; Claude Code built the rest locally from
  `docs/HANDOFF.md` (the step-by-step brief, kept unchanged).
- The AI never ran git: it stopped at each COMMIT POINT, and I reviewed the diff and committed.
- I checked every screen myself, which found D36, D38 and D40; a code review found D44 and D45.

## Decisions Summer did not ask for
All of them, with the reasons, are in `DECISIONS.md` (D1-D47). The ones she will notice: the unit is suggested and
confirmed once per logger, never converted silently (D3, D42); durations are ranges, "at least" when data is missing
(D6, D7); grey "no reliable data" never looks green (D11); a short door spike is labelled, not red (D8); a finished
excursion is "Was too warm – check the products", not "Too warm" (D36); "now" is the latest reading uploaded (D22);
the report says how much of the period has readings (D40); one printable report per branch (D46).

## Questions for Summer
Collected in `DECISIONS.md` (rows marked "Question for Summer" and "Open / to decide"). The main ones: other limits
or freezers; defrost cycles and the warm-up warning; do file names contain the logger number; loggers that export
tenths or another unit; a new logger for Tel Aviv / Walk-in; one logger per fridge; should someone acknowledge an
excursion to clear it; who should be alerted.

## Not done / next hour
- Next hour: "what changed since the last upload" on the dashboard; CSV export of the report table.
- Not done: alerts (would need an account or service), over-cooling check (D30), acknowledging excursions, deleting
  data, more than one logger per fridge. Client code has no automated tests (the rules are in `server/src/core`).
- **Security:** `npm start` serves the app on the local network with no password (that is how Summer opens it on her
  phone). Use it only on a trusted Wi-Fi; anyone on the same network can see and change the data.

## AI tools: what went wrong
**The main case, fully located.** While planning, Gemini said the Haifa readings (38.3, 39.0) were "10x too high" and
should be divided by 10. 38.3 / 10 = 3.83 looks like a healthy fridge, so nothing would look wrong. They are
Fahrenheit: 38.3 °F = 3.5 °C. The test that guards it was committed alone and failing first: commit `7b8ecae`
("Failing test: Haifa TL-0231 is Fahrenheit, not x10"), file `server/src/core/units.test.ts`, first row of
`AI_LOG.md`; the fix is the next commit.

Other cases (details in `AI_LOG.md`):
- Stack reversal: an AI dropped the agreed stack for "zero dependencies" because its sandbox could not download
  packages, and presented that as a project decision; I caught it and the stack was restored (D15, D17).
- Caught by tests: the median interval hid the 2 h 15 min Jerusalem gap (D5); a 1.5 °C warm-up threshold warned too
  late (D10).
- Found by me reviewing the app: red for a fridge back to normal (D36), a logger move shown as a gap (D38), the report
  calling a week "fine" with 30 minutes of readings (D40).
- Found in code review: a raw file spanning a logger move put every row in one fridge (D44); a period ending inside
  an excursion said "still above" (D45).
