# NOTES

## Time spent
TODO

## Decisions Summer did not ask for (and why)
See DECISIONS.md. Highlights: per-fridge threshold; duration as min/max range; grey "no data" status; unit confirmation; logger assignment history; threshold search screen; keep original values.

## Questions for Summer before go-live
- Any freezers or products with other limits? Is "above 5" strictly above 5.0?
- Does Walk-in in Tel Aviv have a new logger after TL-0417 moved?
- Can a gap be explained (battery vs not saved)? Does the logger file record it?
- Do file names contain the logger number?
- Who should be alerted and what counts as urgent? Defrost cycles?
- Which timezone/DST handling matters?

## Not done / next hour
TODO

## AI tools: what went wrong
See AI_LOG.md. Strongest case: Gemini said Haifa was "10x"; it is Fahrenheit. Test: `server/src/core/units.test.ts`.

## Other
TODO
