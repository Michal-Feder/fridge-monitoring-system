# Notes

## Time spent
About 12 hours: planning ~3 h, building with AI ~5 h, checking the app and fixing ~4 h.

## How I worked
- I planned with three AI tools (Gemini, GPT, Claude) and wrote the plan in INIT.md.
  Every rule and the reason for it is in DECISIONS.md.
- Claude wrote the core rules with their tests. Claude Code built the rest on my laptop,
  step by step, from docs/HANDOFF.md.
- The AI never committed. After each step I read the changes, ran the app and committed myself.
- I tested every screen in a phone-sized window. That is how I found three of the problems below.

## Decisions Summer didn't ask for
- Haifa's logger is in °F. The app suggests the unit and a person confirms it once per logger.
  It never converts on its own.
- "How long above 5 °C" is a range (e.g. "1 h 45 min to 2 h 15 min"), because a logger only
  measures every 15-60 minutes.
- One high reading that is back to normal within 30 minutes (a door opening) is labelled,
  not shown as a problem.
- Missing data is grey, never green, also when only part of the week has readings. A gap is
  "unknown"; nothing is filled in.
- A fridge that warms slowly gets an orange warning before it reaches 5 °C, compared with
  its own normal temperature.
- A fridge that was too warm earlier this week but is fine now says
  "Was too warm – check the products".
- A fridge is identified by branch and name, not by logger, because loggers move.
- Upload takes Excel (.xlsx), CSV/TSV files, or rows pasted from Excel. It has two steps: a preview of what was
  found, then Save. The same file twice changes nothing.
- One printable report per branch for the inspector.

## Questions for Summer
1. How often can the files be uploaded? Once a week means the warm-up warning comes late.
2. Is "above 5" strictly above 5.0? Any freezers or products with other limits?
3. Do the fridges defrost on a schedule? It can look like warming up.
4. Does Tel Aviv / Walk-in have a new logger since TL-0417 moved?
5. Who should be told when something is wrong, and how fast?

## Not done / next hour
- Next hour: show on the dashboard what changed since the last upload.
- Not done: email/SMS alerts, a "too cold" check,
  marking a problem as handled, deleting data, automated tests for the screens.
- Known limits: pasting a corrected file again does not move readings already saved. When one time has two
  values, the higher one is used.

## AI: one thing it got wrong
While planning, Gemini said the Haifa numbers (38.3, 39.0) were "10 times too high" and should
be divided by 10. That gives 3.83, which looks like a normal fridge, so the mistake is easy to
miss. I converted by hand: 38.3 °F is 3.5 °C. It is Fahrenheit.
- Test: `server/src/core/units.test.ts` fails if anyone divides by 10.
- Commits: `7b8ecae` (the failing test) and `7831e3d` (the fix). The test was written before
  the code in my first AI session; these two commits replay that order.
- Log: first row of `AI_LOG.md`.

Other AI mistakes I caught are in AI_LOG.md: the AI changed the agreed stack because its own
sandbox could not install packages; tests showed two rules were wrong; I found three problems
by using the app (D36, D38, D40); a separate AI code review found more: D44, D45, D48, D49.
