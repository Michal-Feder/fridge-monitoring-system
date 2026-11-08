# AI_LOG
Format: date | tool | what it proposed | what I did | how I caught it | where in repo

2026-11-08 | Gemini | Said Haifa numbers are "10x higher", normalize by /10 | Rejected: it is Fahrenheit (38.3 F ~ 3.5 C). /10 gives 3.83, plausible but wrong | Converted by hand and compared with other branches | test `units.test.ts` (Fahrenheit), D3
2026-11-08 | Claude | Auto-detect and convert Fahrenheit silently | Changed to suggest + one-time human confirm per logger (GPT review) | 38.3 C is possible in a broken fridge | D3, preview/confirm flow
2026-11-08 | GPT | Four layers API/Service/Repository/Import | Rejected as premature for 48h; kept only pure core vs rest | Time budget, "few decisions made well" | CLAUDE.md, D15
2026-11-08 | Claude | Too many features | Cut scope, ordered by priority | Assignment text | INIT.md section 6
2026-11-08 | Claude | Claimed offline/no-CDN was a requirement | Corrected: only "no accounts, no paid services" | Re-read assignment | NOTES.md
