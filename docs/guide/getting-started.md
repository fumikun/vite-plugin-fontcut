# Getting Started

`vite-plugin-fontcut` is a Vite plugin that subsets self-hosted webfonts down
to only the glyphs actually used in your built site, using
[HarfBuzz](https://harfbuzz.github.io/) via
[`subset-font`](https://github.com/papandreou/subset-font) (no Python /
`fonttools` install required).

It runs once, at the end of `vite build`:

1. Scans every generated HTML file for visible text (and a handful of
   text-bearing attributes like `alt`, `title`, `placeholder`).
2. Scans every generated CSS file for `@font-face` rules and for `content:`
   values used by icon fonts.
3. For each locally-hosted font referenced by an `@font-face` rule, produces
   a subset containing only the characters that were actually found, and
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

## Next steps

- Read [How It Works](./how-it-works) to understand exactly which
  characters get kept.
- See the full [Options](./options) reference for `additionalText`,
  `exclude`, `targetFormat`, and more.
- If your site mixes scripts (e.g. Latin UI chrome + CJK body text), check
  out [Splitting by Script](./split-by-script).
