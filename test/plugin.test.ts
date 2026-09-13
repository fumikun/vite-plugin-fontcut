import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as fontkit from 'fontkit';
import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fontcut from '../src/index.js';

const FIXTURE_FONT = path.resolve(__dirname, 'fixtures/NotoSansJP-Regular.woff2');
const FIXTURE_OTF = path.resolve(__dirname, 'fixtures/NotoSansJP-Regular.otf');

// Our fixtures are single fonts, never TTC collections, so narrow the union
// `fontkit.create` returns down to the `Font` variant that has glyph lookups.
function openFont(buffer: Buffer): fontkit.Font {
  const font = fontkit.create(buffer);
  if ('fonts' in font) {
    throw new Error('Expected a single font, got a font collection');
  }
  return font;
}

function writeProject(dir: string, { fontFile = FIXTURE_FONT }: { fontFile?: string } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(fontFile, path.join(dir, path.basename(fontFile)));

  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<h1>こんにちは世界</h1>
<p>Hello World</p>
</body>
</html>
`,
  );

  fs.writeFileSync(
    path.join(dir, 'style.css'),
    `@font-face {
  font-family: 'Noto Sans JP Test';
  font-style: normal;
  font-weight: 400;
  src: url('./${path.basename(fontFile)}') format('${fontFile.endsWith('.otf') ? 'opentype' : 'woff2'}');
}
body { font-family: 'Noto Sans JP Test', sans-serif; }
`,
  );
}

function findAsset(distDir: string, pattern: RegExp): string {
  const assetsDir = path.join(distDir, 'assets');
  const match = fs.readdirSync(assetsDir).find((f) => pattern.test(f));
  if (!match) throw new Error(`No asset matching ${pattern} in ${assetsDir}: ${fs.readdirSync(assetsDir)}`);
  return path.join(assetsDir, match);
}

describe('vite-plugin-fontcut (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-plugin-fontcut-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shrinks a real font to only the glyphs used on the page', async () => {
    const root = path.join(tmpDir, 'project');
    writeProject(root);
    const outDir = path.join(tmpDir, 'dist');

    await build({
      root,
      logLevel: 'silent',
      plugins: [fontcut({ verbose: false })],
      build: { outDir, write: true },
    });

    const fontPath = findAsset(outDir, /NotoSansJP-Regular.*\.woff2$/);
    const subsetBuffer = fs.readFileSync(fontPath);
    const originalSize = fs.statSync(FIXTURE_FONT).size;

    // Only a handful of characters are used on the page, so the subset should
    // be dramatically smaller than the ~3.3MB source font.
    expect(subsetBuffer.byteLength).toBeLessThan(originalSize * 0.05);
    expect(subsetBuffer.byteLength).toBeLessThan(50 * 1024);

    const subsetFont = openFont(subsetBuffer);
    const originalFont = openFont(fs.readFileSync(FIXTURE_FONT));

    // Every character actually used on the page must still render.
    for (const char of 'こんにちは世界HelloWorld ') {
      expect(
        subsetFont.hasGlyphForCodePoint(char.codePointAt(0)!),
        `expected subset font to keep a glyph for ${JSON.stringify(char)}`,
      ).toBe(true);
    }

    // A common kanji that never appears on the page should have been dropped.
    expect(subsetFont.hasGlyphForCodePoint('日'.codePointAt(0)!)).toBe(false);
    expect(subsetFont.characterSet.length).toBeLessThan(originalFont.characterSet.length);
  });

  it('rewrites the unicode-range descriptor to match the subset', async () => {
    const root = path.join(tmpDir, 'project');
    writeProject(root);
    const outDir = path.join(tmpDir, 'dist');

    await build({
      root,
      logLevel: 'silent',
      plugins: [fontcut({ verbose: false })],
      build: { outDir, write: true },
    });

    const cssPath = findAsset(outDir, /\.css$/);
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/unicode-range:/);

    // The rewritten range must cover the Japanese characters actually used.
    const rangeMatch = css.match(/unicode-range:\s*([^;}]+)[;}]/);
    expect(rangeMatch).not.toBeNull();
  });

  it('preloads the subsetted font referenced by the page stylesheet', async () => {
    const root = path.join(tmpDir, 'project');
    writeProject(root);
    const outDir = path.join(tmpDir, 'dist');

    await build({
      root,
      logLevel: 'silent',
      plugins: [fontcut({ verbose: false })],
      build: { outDir, write: true },
    });

    const fontPath = findAsset(outDir, /NotoSansJP-Regular.*\.woff2$/);
    const fontHref = '/assets/' + path.basename(fontPath);
    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');

    expect(html).toContain(`<link rel="preload" as="font" type="font/woff2" href="${fontHref}" crossorigin>`);
    // The preload tag should come before the stylesheet link that would
    // otherwise be the first thing to discover the font.
    expect(html.indexOf('rel="preload"')).toBeLessThan(html.indexOf('rel="stylesheet"'));
  });

  it('does not inject a preload link when preload is disabled', async () => {
    const root = path.join(tmpDir, 'project');
    writeProject(root);
    const outDir = path.join(tmpDir, 'dist');

    await build({
      root,
      logLevel: 'silent',
      plugins: [fontcut({ verbose: false, preload: false })],
      build: { outDir, write: true },
    });

    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
    expect(html).not.toContain('rel="preload"');
  });

  it('leaves the font untouched when its family matches the exclude option', async () => {
    const root = path.join(tmpDir, 'project');
    writeProject(root);
    const outDir = path.join(tmpDir, 'dist');

    await build({
      root,
      logLevel: 'silent',
      plugins: [fontcut({ verbose: false, exclude: ['Noto Sans JP Test'] })],
      build: { outDir, write: true },
    });

    const fontPath = findAsset(outDir, /NotoSansJP-Regular.*\.woff2$/);
    const outputBuffer = fs.readFileSync(fontPath);
    const originalBuffer = fs.readFileSync(FIXTURE_FONT);
    expect(outputBuffer.equals(originalBuffer)).toBe(true);
  });

  it('subsets an OTF source font and keeps it in sfnt format', async () => {
    const root = path.join(tmpDir, 'project');
    writeProject(root, { fontFile: FIXTURE_OTF });
    const outDir = path.join(tmpDir, 'dist');

    await build({
      root,
      logLevel: 'silent',
      plugins: [fontcut({ verbose: false })],
      build: { outDir, write: true },
    });

    const fontPath = findAsset(outDir, /NotoSansJP-Regular.*\.otf$/);
    const subsetBuffer = fs.readFileSync(fontPath);
    expect(subsetBuffer.byteLength).toBeLessThan(fs.statSync(FIXTURE_OTF).size * 0.05);

    const subsetFont = openFont(subsetBuffer);
    expect(subsetFont.hasGlyphForCodePoint('世'.codePointAt(0)!)).toBe(true);
    expect(subsetFont.hasGlyphForCodePoint('日'.codePointAt(0)!)).toBe(false);
  });

  it('splits a font into per-script @font-face rules when splitByScript is enabled', async () => {
    const root = path.join(tmpDir, 'project');
    writeProject(root);
    const outDir = path.join(tmpDir, 'dist');

    await build({
      root,
      logLevel: 'silent',
      plugins: [fontcut({ verbose: false, splitByScript: true })],
      build: { outDir, write: true },
    });

    const cssPath = findAsset(outDir, /\.css$/);
    const css = fs.readFileSync(cssPath, 'utf8');
    const faceBlocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];

    // The fixture page uses both Latin ("Hello World") and Japanese
    // ("こんにちは世界") text, so splitting should produce (at least) a
    // "latin" and a "kana"/"cjk" rule instead of a single one.
    expect(faceBlocks.length).toBeGreaterThan(1);

    const ranges = faceBlocks.map((block) => block.match(/unicode-range:\s*([^;}]+)/)?.[1]);
    expect(ranges.every((r) => !!r)).toBe(true);
    // Every rule's unicode-range must be distinct from the others.
    expect(new Set(ranges).size).toBe(ranges.length);

    const assetsDir = path.join(outDir, 'assets');
    const fontFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.woff2'));
    expect(fontFiles.length).toBe(faceBlocks.length);

    // Each split file must still shrink relative to the original font, and
    // each @font-face rule's src must point at one of the split files.
    for (const file of fontFiles) {
      const size = fs.statSync(path.join(assetsDir, file)).size;
      expect(size).toBeLessThan(fs.statSync(FIXTURE_FONT).size * 0.05);
    }
    for (const block of faceBlocks) {
      const src = block.match(/src:\s*url\(['"]?([^'")]+)['"]?\)/)?.[1];
      expect(src).toBeTruthy();
      expect(fontFiles.some((f) => src!.endsWith(f))).toBe(true);
    }
  });

  it('does not split a font whose @font-face already declares a unicode-range', async () => {
    const root = path.join(tmpDir, 'project');
    fs.mkdirSync(root, { recursive: true });
    fs.copyFileSync(FIXTURE_FONT, path.join(root, path.basename(FIXTURE_FONT)));
    fs.writeFileSync(
      path.join(root, 'index.html'),
      `<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><h1>こんにちは世界 Hello</h1></body></html>`,
    );
    fs.writeFileSync(
      path.join(root, 'style.css'),
      `@font-face {
  font-family: 'Noto Sans JP Test';
  src: url('./${path.basename(FIXTURE_FONT)}') format('woff2');
  unicode-range: U+0000-FFFF;
}
body { font-family: 'Noto Sans JP Test', sans-serif; }
`,
    );
    const outDir = path.join(tmpDir, 'dist');

    await build({
      root,
      logLevel: 'silent',
      plugins: [fontcut({ verbose: false, splitByScript: true })],
      build: { outDir, write: true },
    });

    const cssPath = findAsset(outDir, /\.css$/);
    const css = fs.readFileSync(cssPath, 'utf8');
    const faceBlocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faceBlocks.length).toBe(1);
  });
});
