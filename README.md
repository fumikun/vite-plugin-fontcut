# vite-plugin-fontcut

A Vite plugin that subsets self-hosted webfonts down to only the glyphs
actually used in your built site, using [HarfBuzz](https://harfbuzz.github.io/)
via [`subset-font`](https://github.com/papandreou/subset-font) (no Python /
`fonttools` install required).

It runs once, at the end of `vite build`:

1. Scans every generated HTML file for visible text (and a handful of
   text-bearing attributes like `alt`, `title`, `placeholder`).
2. Scans every generated CSS file for `@font-face` rules and for `content:`
   values used by icon fonts.
3. For each locally-hosted font referenced by an `@font-face` rule, produces a
   subset containing only the characters that were actually found, and
   replaces the font asset in the build output with the subset.
4. Optionally rewrites the `unicode-range` descriptor to match the subset.

On a typical page this turns a multi-megabyte CJK webfont into a few
kilobytes.

## Install

```sh
npm install --save-dev vite-plugin-fontcut
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import fontcut from 'vite-plugin-fontcut';

export default defineConfig({
  plugins: [fontcut()],
});
```

That's it — the plugin only runs during `vite build` and is a no-op in dev
(`vite`/`vite serve`).

## How it decides which characters to keep

The plugin unions:

- All text nodes in every built `.html` file (excluding `<script>` and
  `<style>` contents).
- The values of `alt`, `title`, `placeholder`, `aria-label`, `value`, and
  `label` attributes.
- Any literal characters used in CSS `content:` declarations (icon fonts).
- Anything passed via `additionalText`.

That combined character set is used to subset **every** locally-hosted font
referenced from your CSS. If a page renders content dynamically after
hydration (a SPA that doesn't SSR its text), pass that text explicitly via
`additionalText` so it isn't stripped from the font.

If an `@font-face` rule already declares a `unicode-range` (e.g. you're using
a pre-split font family like Google Fonts serves), the plugin intersects the
page's characters with that range before subsetting, so language-specific
splits are preserved.

## Options

```ts
fontcut({
  // Extra text to keep glyphs for, e.g. client-rendered strings.
  additionalText: 'Loading… ',

  // Characters always kept, even if unused. Defaults to a single space.
  alwaysInclude: ' ',

  // Only subset fonts with these container formats. Defaults to all four.
  formats: ['woff2', 'woff', 'ttf', 'otf'],

  // Skip specific font families (exact string or RegExp).
  exclude: ['Font Awesome', /Icon/],

  // Rewrite `unicode-range` to match the subset. Defaults to true.
  addUnicodeRange: true,

  // Force re-encoding every subset to a specific container format
  // instead of keeping each font's original one.
  targetFormat: 'woff2',

  // Log a size-reduction summary after the build. Defaults to true.
  verbose: true,

  // Split each subsetted font into multiple @font-face rules by Unicode
  // block/script (Latin, Kana, CJK ideographs, Cyrillic, ...), each scoped
  // with its own unicode-range and its own (smaller) font file, instead of
  // one file covering every used script. Useful for pages that mix scripts
  // (e.g. Latin UI chrome + CJK body text), so the browser only fetches the
  // block(s) it actually needs. A rule that already declares a
  // unicode-range, or that has more than one local src (format fallbacks),
  // is left as a single subset. Defaults to false.
  splitByScript: false,
})
```

## Limitations

- Only fonts referenced via a **local** `url()` in `@font-face` (i.e. files
  Vite copies into your build output) are subsetted. Fonts loaded from a CDN
  (Google Fonts, etc.) are left untouched — self-host them first if you want
  them subsetted.
- The used-character set is computed **globally** across the whole page
  rather than matched per element/selector, so a font is subsetted to every
  character used anywhere on the page, not just where that specific
  `font-family` is applied (aside from the `unicode-range` intersection
  described above). For most single-font or per-language-split setups this
  is exactly what you want; for pages mixing several unrelated fonts you may
  end up keeping a few extra glyphs in each.
- Content injected purely by client-side JavaScript after the initial HTML is
  not seen automatically — use `additionalText` for that.
- With `splitByScript`, only the first generated block is preloaded (see
  `preload`) rather than every split file, to avoid fetching blocks a given
  page may not need.

## Example

See [`example/`](./example) for a minimal project (`npm run build` after
installing dependencies at the repo root, then `cd example && npx vite
build`) that subsets a full ~3.2MB Noto Sans JP font down to a few
kilobytes based on the text in `index.html`.

## Development

```sh
npm install
npm run build       # bundle the plugin with tsup
npm run typecheck
npm test            # vitest, including an end-to-end test that runs
                     # a real `vite build` against a bundled Noto Sans JP
                     # font fixture in test/fixtures/
```

## License

MIT for the plugin code. The bundled test fixture
(`test/fixtures/NotoSansJP-Regular.{otf,woff2}`) is Noto Sans JP by Google,
licensed under the SIL Open Font License 1.1 — see
[`test/fixtures/NotoSansJP-LICENSE.txt`](./test/fixtures/NotoSansJP-LICENSE.txt).
