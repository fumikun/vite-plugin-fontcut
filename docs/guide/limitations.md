# Limitations

- Only fonts referenced via a **local** `url()` in `@font-face` (i.e. files
  Vite copies into your build output) are subsetted. Fonts loaded from a CDN
  (Google Fonts, etc.) are left untouched — self-host them first if you want
  them subsetted.
- The used-character set is computed **globally** across the whole page
  rather than matched per element/selector, so a font is subsetted to every
  character used anywhere on the page, not just where that specific
  `font-family` is applied (aside from the `unicode-range` intersection
  described in [How It Works](./how-it-works)). For most single-font or
  per-language-split setups this is exactly what you want; for pages mixing
  several unrelated fonts you may end up keeping a few extra glyphs in each.
- Content injected purely by client-side JavaScript after the initial HTML
  is not seen automatically — use
  [`additionalText`](./options#additionaltext) for that.
- With [`splitByScript`](./split-by-script), only the first generated block
  is preloaded rather than every split file, to avoid fetching blocks a
  given page may not need.
