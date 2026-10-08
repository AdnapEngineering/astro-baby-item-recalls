import { describe, expect, it } from 'vitest';
import { formatRecallDate } from './format';

describe('formatRecallDate', () => {
  it('formats a CPSC timestamp in en-US medium style', () => {
    expect(formatRecallDate('2026-07-30T00:00:00')).toBe('Jul 30, 2026');
  });

  it('returns a malformed value unchanged rather than "Invalid Date"', () => {
    expect(formatRecallDate('not a date')).toBe('not a date');
  });
});
