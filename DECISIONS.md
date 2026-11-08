# DECISIONS (living log; feeds NOTES.md)

| # | Decision | Why |
|---|---|---|
| D1 | Fridge identity = branch + fridge. Logger is a sensor with assignment history (valid_from/valid_to). | TL-0417 moved Walk-in -> Display 2; history of both fridges must stay correct. A fridge with no logger is "no data" (grey), not green. |
| D2 | Threshold is per fridge (`max_temp`, default 5.0). Excursion = strictly above threshold (> 5.0). | Different contents need different limits; "above five" read literally. Open question for Summer. |
| D3 | Units: per-logger setting. System only SUGGESTS Fahrenheit (e.g. median > 20 for a fridge), human confirms once, saved on the logger. | 38.3 C is physically possible in a broken fridge, so auto-deciding is unsafe. Dividing by 10 (a wrong AI suggestion) gives a plausible-looking but wrong 3.83. |
| D4 | Always store original value + unit next to the converted value. | Evidence for the inspector; conversions can be corrected. |
| D5 | Gap = interval > 2.5 x the logger's median interval. Never interpolate or fill. | Logger interval is not assumed to be 15 min. Gaps may be dead battery or unsaved data; we cannot know. |
| D6 | Duration is a range: min = first high reading to last high reading; max = last OK reading before to first OK reading after. Primary shown = max. | Food safety: conservative. Example 06:00 ok, 06:15 6.0, 06:30 7.0, 06:45 ok -> min 15 min, max 45 min. |
| D7 | If a gap lies inside or adjacent to an excursion, duration is "unknown" (lower bound only shown). | Honest report beats a confident wrong one. |
| D8 | Spike vs sustained is by TIME (max 30 min above threshold and then back), not reading count. If a logger's typical interval > 30 min, one high reading is "short, cannot verify" (soft orange). Inspector report never hides spikes; it labels them. | Door opening is a statement about the world, not about the logger. |
| D9 | ERR/blank/text = measurement with status error. Not 0, not silently dropped. Repeated errors raise a grey data-quality warning. | |
| D10 | Warm-up trend: orange if mean of last 6h is >= 1.5 C above the fridge's own median of the previous 7 days AND slope is rising. Needs >= 3 days of history; otherwise no trend alert. Median, not mean. Defrost cycles are a known false-positive risk. | Fixed threshold alone would not have caught Rishon until too late. No ML. |
| D11 | Status: red = sustained excursion (or currently above); orange = trend or unverifiable short excursion; grey = gap, repeated ERR, no recent data, or no logger; green = otherwise. | "No data" must never look like "fine". |
| D12 | Date format detected per file. ISO is unambiguous. For d/m/y vs m/d/y, if any first part > 12 use DD/MM, otherwise default DD/MM (Israel). | Israeli locale; flagged in preview if ambiguous. |
| D13 | Timestamps kept as local wall-clock, no timezone conversion. | Files carry no timezone; all branches are in Israel. DST change is a known gap in handling. |
| D14 | Duplicates: same logger+time+value dropped and counted; same time with different value kept and flagged `conflict`. Imports are idempotent. | Summer pastes overlapping weekly files. |
| D15 | Stack: Node 24, `node:sqlite` (no native build), Express, React, Vite, Tailwind v4 via npm, Recharts. UI in English. CSV only. | Author's stack; fewest run-time risks on the reviewer's laptop; Summer wrote in English. |
| D16 | Upload is "upload, then confirm" with auto-fill from known loggers; two modes: pasted 5-column sheet and raw 2-column logger file. | Matches how Summer works today. |
| D17 | Dependencies (Stage A). Runtime: `express` (server), `react`, `react-dom`, `recharts` (client). Dev: `typescript`, `tsx`, `vitest`, `@types/*`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `concurrently`. Nothing else. | All named in the fixed stack (INIT section 2). `concurrently` runs server + client from one `npm run dev` on Windows/macOS/Linux without shell tricks. |
| D18 | Pinned `vitest` 4.1.12 (not 3.x, not 5.1.0). Recharts 3.x (not 2.x). | vitest 3.x pulled in `tinypool`/`@vitest/mocker` with critical/moderate advisories; 5.1.0 was under two weeks old. Recharts 2.x is deprecated upstream. `npm audit`: 0 vulnerabilities. |
| D19 | Ports: API 3001, Vite 5173 with `/api` proxied to the API. | Client calls relative `/api/...`; no CORS dependency needed. |

## Open / to decide while building
- Threshold for min temperature (over-cooling) - default off.
- Preview behavior when a file contains several loggers.
- Post-move stabilization period for a moved logger.
