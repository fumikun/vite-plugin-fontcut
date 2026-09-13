# Options

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

  // Inject <link rel="preload" as="font" crossorigin> tags. Defaults to true.
  preload: true,

  // Split each subsetted font into per-script @font-face rules. Defaults
  // to false. See "Splitting by Script" for details.
  splitByScript: false,
})
```

## `additionalText`

- Type: `string | string[]`
- Default: `''`

Extra text that should be treated as "used" even though it doesn't appear in
the built HTML — e.g. strings rendered client-side by JS after hydration.

## `alwaysInclude`

- Type: `string`
- Default: `' '` (a single space)

Characters that are always kept in every subsetted font, regardless of
whether they were found in the page.

## `formats`

- Type: `Array<'woff2' | 'woff' | 'ttf' | 'otf'>`
- Default: `['woff2', 'woff', 'ttf', 'otf']`

Which font container formats to subset. Fonts referenced with any other
extension are left untouched.

## `exclude`

- Type: `Array<string | RegExp>`
- Default: `[]`

Skips subsetting for `@font-face` rules whose `font-family` matches any of
these strings/patterns. Useful for icon fonts you don't want touched.

## `addUnicodeRange`

- Type: `boolean`
- Default: `true`

Rewrites the `unicode-range` descriptor of each `@font-face` to reflect the
characters that ended up in the subset.

## `targetFormat`

- Type: `'woff2' | 'woff' | 'sfnt'`
- Default: keeps each font's original container format

Forces all subsetted fonts to be re-encoded to this container format instead
of keeping their original one.

## `verbose`

- Type: `boolean`
- Default: `true`

Logs a summary of the subsetting results after the build.

## `preload`

- Type: `boolean`
- Default: `true`

Injects `<link rel="preload" as="font" crossorigin>` tags for the first
locally-hosted `src` of every used `@font-face` rule. See
[How It Works](./how-it-works#preloading).

## `splitByScript`

- Type: `boolean`
- Default: `false`

Splits each subsetted font into multiple `@font-face` rules by Unicode
block/script instead of one file covering every used script. See
[Splitting by Script](./split-by-script) for the full explanation.
