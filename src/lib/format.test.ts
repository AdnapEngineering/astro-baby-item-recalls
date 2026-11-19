import { describe, expect, it } from 'vitest';
import { formatRecallDate, summarizeProducts } from './format';

describe('formatRecallDate', () => {
  it('formats a CPSC timestamp in en-US medium style', () => {
    expect(formatRecallDate('2026-07-30T00:00:00')).toBe('Jul 30, 2026');
  });

  it('returns a malformed value unchanged rather than "Invalid Date"', () => {
    expect(formatRecallDate('not a date')).toBe('not a date');
  });
});

describe('summarizeProducts', () => {
  const product = (n: number) => ({ name: `Crib ${n}`, model: `C-${n}` });

  it('names every product when there are few', () => {
    expect(summarizeProducts([product(1), { name: null, model: 'X' }])).toEqual({
      text: 'Crib 1 · Model C-1; Model X',
      more: 0,
    });
  });

  it('names the first three and counts the rest', () => {
    expect(summarizeProducts([1, 2, 3, 4, 5].map(product))).toEqual({
      text: 'Crib 1 · Model C-1; Crib 2 · Model C-2; Crib 3 · Model C-3',
      more: 2,
    });
  });

  it('skips products with neither a name nor a model before counting', () => {
    expect(summarizeProducts([{ name: null, model: null }, product(1)], 1)).toEqual({
      text: 'Crib 1 · Model C-1',
      more: 0,
    });
  });
});
