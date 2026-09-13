# Splitting by Script

By default, fontcut subsets every locally-hosted font down to a **single**
file containing every character used anywhere on the page. That's ideal for
single-script sites, but if a page mixes scripts — for example Latin UI
chrome plus Japanese body text — that one file still carries glyphs for both,
even on visits where only one script is actually rendered.

Enabling `splitByScript: true` splits each subsetted font into multiple
smaller files instead, one per Unicode block/script, each with its own
`@font-face` rule and `unicode-range`:

```ts
fontcut({
  splitByScript: true,
})
```

```css
/* before */
@font-face {
  font-family: 'Example';
  src: url('/assets/example-abcd1234.woff2') format('woff2');
}

/* after */
@font-face {
  font-family: 'Example';
  src: url('/assets/example-abcd1234-latin.woff2') format('woff2');
  unicode-range: U+20-7E;
}
@font-face {
  font-family: 'Example';
  src: url('/assets/example-abcd1234-kana.woff2') format('woff2');
  unicode-range: U+3042-30F3;
}
```

The browser only downloads the block(s) it actually needs to render the
glyphs present in the page/element it's laying out, thanks to
`unicode-range` matching.

## Recognized blocks

Characters are grouped into: `latin`, `greek`, `cyrillic`, `hebrew`,
`arabic`, `devanagari`, `thai`, `hangul`, `kana` (hiragana/katakana), `cjk`
(CJK ideographs and punctuation), `symbols`, `emoji`, and a catch-all
`other`. Only blocks with at least one used character produce a file.

## When a font is *not* split

A font is left as a single subset (not split) when:

- Its `@font-face` rule already declares a `unicode-range` — it's already
  been split upstream (e.g. a pre-split Google Fonts family), so fontcut
  just intersects and subsets within that existing range instead.
- The rule lists more than one locally-hosted `src` (format fallbacks, e.g.
  a `.woff2` + `.ttf` pair) — splitting those independently could produce
  mismatched fallback sets across formats.
- Only a single block ends up populated (nothing to split).

Splitting always sets `unicode-range` on the rules it produces, regardless
of the `addUnicodeRange` option — it's required for the browser to pick the
right file.

## Preloading with `splitByScript`

With [`preload`](./options#preload) enabled (the default), only the
**first** generated block is preloaded rather than every split file, to
avoid fetching blocks a given page may not need.
