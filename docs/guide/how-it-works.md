# How It Works

The plugin unions:

- All text nodes in every built `.html` file (excluding `<script>` and
  `<style>` contents).
- The values of `alt`, `title`, `placeholder`, `aria-label`, `value`, and
  `label` attributes.
- Any literal characters used in CSS `content:` declarations (icon fonts).
- Anything passed via [`additionalText`](./options#additionaltext).

That combined character set is used to subset **every** locally-hosted font
referenced from your CSS. If a page renders content dynamically after
hydration (a SPA that doesn't SSR its text), pass that text explicitly via
`additionalText` so it isn't stripped from the font.

## Pre-split fonts (`unicode-range`)

If an `@font-face` rule already declares a `unicode-range` (e.g. you're using
a pre-split font family like Google Fonts serves), the plugin intersects the
page's characters with that range before subsetting, so language-specific
splits are preserved.

## Preloading

By default (`preload: true`), the plugin injects
`<link rel="preload" as="font" crossorigin>` tags into `<head>` for the
first locally-hosted `src` of every `@font-face` rule used by a page's
stylesheets, so the browser starts fetching the (now tiny) subsetted font as
soon as possible instead of waiting for the CSS to be parsed.
