export type Unit = 'C' | 'F';

export interface UnitSuggestion {
  unit: Unit;
  confidence: 'high' | 'low';
  reason: string;
  median: number | null;
}

// STUB: implemented in the next commit. The test below must fail first.
export function toCelsius(_value: number, _unit: Unit): number {
  throw new Error('not implemented');
}

export function suggestUnit(_values: number[], _headerHint?: Unit | null): UnitSuggestion {
  throw new Error('not implemented');
}
