import { describe, expect, test } from 'vitest';

import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatPrice,
} from '@/lib/formatter';

describe('formatPrice', () => {
  test('converts cents to a currency string', () => {
    expect(formatPrice(19900, 'USD')).toBe('$199');
  });

  test('drops fractional digits below a whole unit', () => {
    expect(formatPrice(990, 'USD')).toBe('$9.9');
  });

  test('formats zero', () => {
    expect(formatPrice(0, 'USD')).toBe('$0');
  });

  test('honours the currency code', () => {
    expect(formatPrice(1000, 'EUR')).toBe('€10');
  });
});

describe('formatBytes', () => {
  test.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.0 MB'],
    [1024 * 1024 * 2.5, '2.5 MB'],
  ])('formatBytes(%j) === %j', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatDate', () => {
  test('renders year/month/day with zero padding', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026/01/05');
  });

  test('does not pad a two-digit month or day', () => {
    expect(formatDate(new Date(2026, 10, 25))).toBe('2026/11/25');
  });
});

describe('formatDateTime', () => {
  test('renders date and time with zero padding', () => {
    expect(formatDateTime(new Date(2026, 0, 5, 7, 8, 9))).toBe(
      '2026/01/05 07:08:09'
    );
  });

  test('renders midnight and late hours correctly', () => {
    expect(formatDateTime(new Date(2026, 11, 31, 0, 0, 0))).toBe(
      '2026/12/31 00:00:00'
    );
    expect(formatDateTime(new Date(2026, 11, 31, 23, 59, 59))).toBe(
      '2026/12/31 23:59:59'
    );
  });
});
