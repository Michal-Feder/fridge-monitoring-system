// D3: the system SUGGESTS a unit per logger; a human confirms it once. Nothing here converts silently.
export type Unit = 'C' | 'F';

export interface UnitSuggestion {
  unit: Unit;
  confidence: 'high' | 'low';
  reason: string;
  median: number | null;
}

/** Fahrenheit to Celsius, rounded to 2 decimals. Celsius values are returned unchanged. */
export function toCelsius(value: number, unit: Unit): number {
  if (unit === 'C') return value;
  return Math.round(((value - 32) * 5) / 9 * 100) / 100;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// A fridge in °C reads roughly -2..10. The same fridge in °F reads roughly 28..50.
// A median above 20 cannot be a working fridge in °C, but it is normal in °F.
const F_MEDIAN_MIN = 20;
const F_TYPICAL_RANGE: [number, number] = [25, 60];

/**
 * Suggest the unit of a logger from its readings. The median is used so that a few hot readings
 * (a broken fridge really can reach 38 °C) do not flip a Celsius logger to Fahrenheit.
 * `headerHint` comes from a column header such as "Temp (°F)".
 */
export function suggestUnit(values: number[], headerHint?: Unit | null): UnitSuggestion {
  const m = median(values.filter((v) => Number.isFinite(v)));
  const fmt = (n: number) => n.toFixed(1);

  if (m === null) {
    if (headerHint) return { unit: headerHint, confidence: 'low', reason: `Column header says °${headerHint}; no numeric readings to check it against.`, median: null };
    return { unit: 'C', confidence: 'low', reason: 'No numeric readings; assuming Celsius.', median: null };
  }

  const looksF = m > F_MEDIAN_MIN;
  const inFRange = m >= F_TYPICAL_RANGE[0] && m <= F_TYPICAL_RANGE[1];

  if (headerHint === 'F') {
    return looksF
      ? { unit: 'F', confidence: 'high', reason: `Column header says °F and the median ${fmt(m)} fits a fridge in Fahrenheit (≈ ${fmt(toCelsius(m, 'F'))} °C).`, median: m }
      : { unit: 'F', confidence: 'low', reason: `Column header says °F, but the median ${fmt(m)} looks like Celsius. Please check.`, median: m };
  }
  if (headerHint === 'C' && looksF) {
    return { unit: 'C', confidence: 'low', reason: `Column header says °C, but the median ${fmt(m)} looks like Fahrenheit (≈ ${fmt(toCelsius(m, 'F'))} °C). Please check.`, median: m };
  }

  if (looksF) {
    return {
      unit: 'F',
      confidence: inFRange ? 'high' : 'low',
      reason: `Median reading ${fmt(m)} is too warm for a working fridge in Celsius but normal in Fahrenheit (≈ ${fmt(toCelsius(m, 'F'))} °C).`,
      median: m,
    };
  }
  return { unit: 'C', confidence: 'high', reason: `Median reading ${fmt(m)} fits a fridge in Celsius.`, median: m };
}
