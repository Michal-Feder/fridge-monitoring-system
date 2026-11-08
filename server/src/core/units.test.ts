import { describe, it, expect } from 'vitest';
import { suggestUnit, toCelsius } from './units.ts';

// AI_LOG 2026-11-08: Gemini said the Haifa numbers are "10x higher" and should be divided by 10.
// 38.3 / 10 = 3.83 looks like a normal fridge, which is exactly why the mistake is dangerous.
// These tests pin the correct answer: TL-0231 reports Fahrenheit.
describe('units: Haifa TL-0231 is Fahrenheit, not x10', () => {
  it('converts 38.3 F to 3.5 C', () => {
    expect(toCelsius(38.3, 'F')).toBeCloseTo(3.5, 2);
  });

  it('fails if someone divides by 10 instead', () => {
    const wrong = 38.3 / 10; // 3.83
    expect(Math.abs(toCelsius(38.3, 'F') - wrong)).toBeGreaterThan(0.2);
    expect(toCelsius(39.0, 'F')).toBeCloseTo(3.89, 2); // /10 would give 3.90
  });

  it('suggests F for the Haifa values with high confidence, and says why', () => {
    const s = suggestUnit([38.3, 39.0]);
    expect(s.unit).toBe('F');
    expect(s.confidence).toBe('high');
    expect(s.reason).toMatch(/Fahrenheit/);
  });

  it('suggests C for normal fridge values', () => {
    expect(suggestUnit([3.8, 3.9, 4.0, 9.4]).unit).toBe('C');
  });

  it('only suggests: 38 C in one broken fridge among normal readings stays C', () => {
    // median decides, so a few very hot readings do not flip a Celsius logger
    expect(suggestUnit([3.8, 3.9, 4.1, 38.0]).unit).toBe('C');
  });

  it('keeps Celsius values unchanged', () => {
    expect(toCelsius(4.1, 'C')).toBe(4.1);
  });

  it('uses a header hint (°F in the column name) as the strongest signal', () => {
    expect(suggestUnit([3.0, 3.5], 'F')).toMatchObject({ unit: 'F', confidence: 'low' });
    expect(suggestUnit([38.3, 39.0], 'F')).toMatchObject({ unit: 'F', confidence: 'high' });
  });

  it('returns low confidence when there are no numeric values', () => {
    expect(suggestUnit([])).toMatchObject({ unit: 'C', confidence: 'low', median: null });
  });
});
