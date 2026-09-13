---
layout: home

hero:
  name: vite-plugin-fontcut
  text: Ship only the glyphs your site uses
  tagline: Subsets self-hosted webfonts with HarfBuzz at build time — no Python or fonttools required.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/fumikun/vite-plugin-subfont

features:
  - title: Automatic
    details: Scans every generated HTML and CSS file after vite build and subsets each locally-hosted @font-face font to just the characters actually used.
  - title: No native toolchain
    details: Uses HarfBuzz via subset-font, so there's nothing extra to install — it's just an npm dependency.
  - title: unicode-range aware
    details: Rewrites unicode-range to match each subset, and can split a font into per-script files (Latin, Kana, CJK, ...) with splitByScript.
  - title: Preloads the result
    details: Injects <link rel="preload" as="font"> tags so the browser fetches the now-tiny font as soon as possible.
---
