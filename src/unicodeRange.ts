export type Range = [number, number];

/**
 * Parses a CSS `unicode-range` descriptor value (e.g. `U+0000-00FF, U+0131`)
 * into a list of inclusive [start, end] codepoint ranges. Wildcard forms like
 * `U+00??` are expanded to their equivalent range.
 */
export function parseUnicodeRange(value: string): Range[] {
  const ranges: Range[] = [];
  for (const rawToken of value.split(',')) {
    const token = rawToken.trim();
    const wildcard = /^[Uu]\+([0-9A-Fa-f?]{1,6})$/.exec(token);
    const bounded = /^[Uu]\+([0-9A-Fa-f]{1,6})-([0-9A-Fa-f]{1,6})$/.exec(token);
    if (bounded) {
      ranges.push([parseInt(bounded[1], 16), parseInt(bounded[2], 16)]);
    } else if (wildcard) {
      const hex = wildcard[1];
      if (hex.includes('?')) {
        const start = parseInt(hex.replace(/\?/g, '0'), 16);
        const end = parseInt(hex.replace(/\?/g, 'f'), 16);
        ranges.push([start, end]);
      } else {
        const codePoint = parseInt(hex, 16);
        ranges.push([codePoint, codePoint]);
      }
    }
  }
  return ranges;
}

export function codePointInRanges(codePoint: number, ranges: Range[]): boolean {
  return ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/**
 * Builds a compact `unicode-range` descriptor value from a set of characters
 * by sorting their codepoints and merging consecutive/adjacent ones into
 * runs.
 */
export function charsToUnicodeRange(chars: Iterable<string>): string {
  const codePoints = Array.from(new Set(Array.from(chars, (c) => c.codePointAt(0)!))).sort(
    (a, b) => a - b,
  );

  const ranges: Range[] = [];
  for (const codePoint of codePoints) {
    const last = ranges[ranges.length - 1];
    if (last && codePoint === last[1] + 1) {
      last[1] = codePoint;
    } else {
      ranges.push([codePoint, codePoint]);
    }
  }

  return ranges
    .map(([start, end]) =>
      start === end
        ? `U+${start.toString(16).toUpperCase()}`
        : `U+${start.toString(16).toUpperCase()}-${end.toString(16).toUpperCase()}`,
    )
    .join(',');
}
