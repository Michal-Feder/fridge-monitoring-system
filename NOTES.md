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
- Do any loggers export tenths of a degree or another unit? Only °C and °F are supported; whole numbers like 38 are suggested as °F with a warning, and values that fit neither unit block the upload (D42).
- Should someone acknowledge an excursion to clear it? Today a finished one stays "Was too warm – check the products" until it leaves the 7-day / 24-hour window (D36).

## Not done / next hour
TODO

## AI tools: what went wrong
See AI_LOG.md. Strongest case: Gemini said Haifa was "10x"; it is Fahrenheit. Test: `server/src/core/units.test.ts`.

## Other
TODO
