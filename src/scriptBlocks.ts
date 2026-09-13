export interface ScriptBlock {
  id: string;
  ranges: Array<[number, number]>;
}

/**
 * Coarse Unicode block groupings used to split a subsetted font into several
 * smaller `@font-face` rules (one per populated group), each scoped with its
 * own `unicode-range`. Order matters: a codepoint is assigned to the first
 * block whose range contains it, so more specific/rare blocks that overlap
 * with a broader one should come first.
 */
const BLOCKS: ScriptBlock[] = [
  {
    id: 'latin',
    ranges: [
      [0x0000, 0x02af], // Basic Latin, Latin-1 Supplement, Latin Extended A/B, IPA
      [0x1e00, 0x1eff], // Latin Extended Additional
      [0x2c60, 0x2c7f], // Latin Extended C
      [0xa720, 0xa7ff], // Latin Extended D
    ],
  },
  {
    id: 'greek',
    ranges: [
      [0x0370, 0x03ff],
      [0x1f00, 0x1fff],
    ],
  },
  {
    id: 'cyrillic',
    ranges: [
      [0x0400, 0x04ff],
      [0x0500, 0x052f],
    ],
  },
  { id: 'hebrew', ranges: [[0x0590, 0x05ff]] },
  {
    id: 'arabic',
    ranges: [
      [0x0600, 0x06ff],
      [0x0750, 0x077f],
    ],
  },
  { id: 'devanagari', ranges: [[0x0900, 0x097f]] },
  { id: 'thai', ranges: [[0x0e00, 0x0e7f]] },
  {
    id: 'hangul',
    ranges: [
      [0x1100, 0x11ff],
      [0x3130, 0x318f],
      [0xac00, 0xd7a3],
    ],
  },
  {
    id: 'kana',
    ranges: [
      [0x3040, 0x30ff], // Hiragana, Katakana
      [0x31f0, 0x31ff], // Katakana Phonetic Extensions
      [0xff65, 0xff9f], // Halfwidth Katakana
    ],
  },
  {
    id: 'cjk',
    ranges: [
      [0x2e80, 0x2eff], // CJK Radicals Supplement
      [0x3000, 0x303f], // CJK Symbols and Punctuation
      [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
      [0x4e00, 0x9fff], // CJK Unified Ideographs
      [0xf900, 0xfaff], // CJK Compatibility Ideographs
      [0x20000, 0x2ebef], // CJK Unified Ideographs Extension B and beyond
    ],
  },
  {
    id: 'symbols',
    ranges: [
      [0x2000, 0x206f], // General Punctuation
      [0x2100, 0x27bf], // Letterlike Symbols, Arrows, Math, Misc Symbols, Dingbats
      [0x2e00, 0x2e7f], // Supplemental Punctuation
    ],
  },
  { id: 'emoji', ranges: [[0x1f300, 0x1fbff]] },
];

export function blockIdForCodePoint(codePoint: number): string {
  for (const block of BLOCKS) {
    for (const [start, end] of block.ranges) {
      if (codePoint >= start && codePoint <= end) return block.id;
    }
  }
  return 'other';
}

/**
 * Groups a set of characters by Unicode block/script. The returned map is
 * ordered: populated blocks appear in the same order as `BLOCKS`, with an
 * `other` bucket (if non-empty) last — this keeps output deterministic and
 * puts the most broadly useful block (Latin) first.
 */
export function splitCharsByBlock(chars: Iterable<string>): Map<string, Set<string>> {
  const raw = new Map<string, Set<string>>();
  for (const char of chars) {
    const id = blockIdForCodePoint(char.codePointAt(0)!);
    const bucket = raw.get(id) ?? new Set<string>();
    bucket.add(char);
    raw.set(id, bucket);
  }

  const ordered = new Map<string, Set<string>>();
  for (const block of BLOCKS) {
    const bucket = raw.get(block.id);
    if (bucket) ordered.set(block.id, bucket);
  }
  const other = raw.get('other');
  if (other) ordered.set('other', other);

  return ordered;
}
