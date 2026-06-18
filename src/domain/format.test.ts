import { describe, expect, it } from 'vitest';

import { formatFlightTime } from './format';

describe('formatFlightTime', () => {
  it('formats elapsed flight time as HH:mm', () => {
    expect(formatFlightTime(0)).toBe('00:00');
    expect(formatFlightTime(3_661)).toBe('01:01');
    expect(formatFlightTime(36_000)).toBe('10:00');
  });
});
