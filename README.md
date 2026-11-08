# Fridge Watch (Squanchy Bakery)

Upload logger files, see every fridge's status on one screen (phone friendly), and answer the Ministry of Health: "when did this fridge go above 5 C, and for how long?"

## Requirements
Node.js 22.13 or newer (developed on 24.12). No accounts, no external services, no database to install (uses Node's built-in SQLite).

## Run
```bash
git clone <repo-url>
cd fridge-watch
npm install
npm run seed      # creates demo data for 12 branches + sample CSVs in sample-data/
npm run dev       # server + client, open http://localhost:5173
```
Node may print an "ExperimentalWarning: SQLite" message. This is expected.

## Tests
```bash
npm test
```

## Try it
1. Open the dashboard: Rishon LeZion / Cream cakes shows the slow warm-up, Tel Aviv shows door-open spikes, Haifa is Fahrenheit and converted after confirmation.
2. Upload files from `sample-data/` (messy: shifted columns, two date formats, ERR, duplicates).
3. Open a fridge -> "Inspector report" -> pick a date range.

## Docs
See DECISIONS.md (every rule and why), NOTES.md (assignment notes), AI_LOG.md (AI work log), INIT.md (build spec).
