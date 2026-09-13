import { describe, expect, it } from 'vitest';
import { charsToUnicodeRange, codePointInRanges, parseUnicodeRange } from '../src/unicodeRange.js';

describe('parseUnicodeRange', () => {
  it('parses simple bounded ranges', () => {
    expect(parseUnicodeRange('U+0000-00FF')).toEqual([[0, 255]]);
  });

  it('parses single codepoints', () => {
    expect(parseUnicodeRange('U+0131')).toEqual([[0x131, 0x131]]);
  });

  it('parses comma-separated lists', () => {
    expect(parseUnicodeRange('U+0000-00FF, U+0131, U+0152-0153')).toEqual([
      [0, 255],
      [0x131, 0x131],
      [0x152, 0x153],
    ]);
  });

  it('expands wildcard ranges', () => {
    expect(parseUnicodeRange('U+00??')).toEqual([[0x0000, 0x00ff]]);
  });

  it('handles the real Noto Sans JP kana unicode-range', () => {
    const value =
      'U+20, U+2027, U+3001-3002, U+3041-307f, U+3081-308f, U+3091-3093, U+3099-309a, U+309d-309e, U+30a1-30e1, U+30e3-30ed, U+30ef-30f0, U+30f2-30f4, U+30fb-30fe, U+ff0c, U+ff0e';
    const ranges = parseUnicodeRange(value);
    expect(codePointInRanges('あ'.codePointAt(0)!, ranges)).toBe(true);
    expect(codePointInRanges('ア'.codePointAt(0)!, ranges)).toBe(true);
    expect(codePointInRanges('A'.codePointAt(0)!, ranges)).toBe(false);
  });
});

describe('charsToUnicodeRange', () => {
  it('merges consecutive codepoints into a single range', () => {
    expect(charsToUnicodeRange(['a', 'b', 'c'])).toBe('U+61-63');
  });

  it('keeps non-adjacent codepoints separate', () => {
    expect(charsToUnicodeRange(['a', 'c'])).toBe('U+61,U+63');
  });

  it('deduplicates repeated characters', () => {
    expect(charsToUnicodeRange(['a', 'a', 'a'])).toBe('U+61');
  });

  it('sorts characters regardless of input order', () => {
    expect(charsToUnicodeRange(['c', 'a', 'b'])).toBe('U+61-63');
  });

  it('round-trips through parseUnicodeRange for Japanese text', () => {
    const chars = Array.from('こんにちは世界');
    const range = charsToUnicodeRange(chars);
    const parsed = parseUnicodeRange(range);
    for (const char of chars) {
      expect(codePointInRanges(char.codePointAt(0)!, parsed)).toBe(true);
    }
  });
});
