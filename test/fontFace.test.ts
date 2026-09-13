import { describe, expect, it } from 'vitest';
import { parseFontFaces, setFontFaceSrcUrl, setUnicodeRange } from '../src/fontFace.js';

describe('parseFontFaces', () => {
  it('extracts family, weight, style and local src urls', () => {
    const css = `
      @font-face {
        font-family: 'Noto Sans JP';
        font-style: normal;
        font-weight: 400;
        src: url(./assets/NotoSansJP-abc123.woff2) format('woff2');
      }
    `;
    const { faces } = parseFontFaces(css);
    expect(faces).toHaveLength(1);
    expect(faces[0].family).toBe('Noto Sans JP');
    expect(faces[0].weight).toBe('400');
    expect(faces[0].style).toBe('normal');
    expect(faces[0].srcs).toEqual([
      { url: './assets/NotoSansJP-abc123.woff2', format: 'woff2', node: expect.anything() },
    ]);
  });

  it('parses multiple comma separated src entries', () => {
    const css = `
      @font-face {
        font-family: 'Foo';
        src: url(./foo.woff2) format('woff2'), url(./foo.woff) format('woff');
      }
    `;
    const { faces } = parseFontFaces(css);
    expect(faces[0].srcs.map((s) => s.url)).toEqual(['./foo.woff2', './foo.woff']);
    expect(faces[0].srcs.map((s) => s.format)).toEqual(['woff2', 'woff']);
  });

  it('skips external and data: urls', () => {
    const css = `
      @font-face {
        font-family: 'Foo';
        src: url(https://example.com/foo.woff2) format('woff2'), url(./local.woff2) format('woff2');
      }
    `;
    const { faces } = parseFontFaces(css);
    expect(faces[0].srcs).toHaveLength(1);
    expect(faces[0].srcs[0].url).toBe('./local.woff2');
  });

  it('parses an existing unicode-range descriptor', () => {
    const css = `
      @font-face {
        font-family: 'Foo';
        src: url(./foo.woff2);
        unicode-range: U+0000-00FF, U+0131;
      }
    `;
    const { faces } = parseFontFaces(css);
    expect(faces[0].unicodeRanges).toEqual([
      [0, 255],
      [0x131, 0x131],
    ]);
  });

  it('returns null unicodeRanges when the descriptor is absent', () => {
    const css = `@font-face { font-family: 'Foo'; src: url(./foo.woff2); }`;
    const { faces } = parseFontFaces(css);
    expect(faces[0].unicodeRanges).toBeNull();
  });

  it('ignores rules other than @font-face', () => {
    const css = `.a { color: red; } @font-face { font-family: 'Foo'; src: url(./foo.woff2); }`;
    const { faces } = parseFontFaces(css);
    expect(faces).toHaveLength(1);
  });
});

describe('setFontFaceSrcUrl', () => {
  it('replaces the url within the src declaration', () => {
    const css = `@font-face { font-family: 'Foo'; src: url(./foo-abc.woff2) format('woff2'); }`;
    const { root, faces } = parseFontFaces(css);
    setFontFaceSrcUrl(faces[0].atRule, './foo-abc.woff2', './foo-def.woff2');
    expect(root.toString()).toContain('./foo-def.woff2');
    expect(root.toString()).not.toContain('foo-abc');
  });
});

describe('setUnicodeRange', () => {
  it('adds a unicode-range declaration when none exists', () => {
    const css = `@font-face { font-family: 'Foo'; src: url(./foo.woff2); }`;
    const { root, faces } = parseFontFaces(css);
    setUnicodeRange(faces[0].atRule, 'U+61-7A');
    expect(root.toString()).toContain('unicode-range: U+61-7A');
  });

  it('overwrites an existing unicode-range declaration', () => {
    const css = `@font-face { font-family: 'Foo'; src: url(./foo.woff2); unicode-range: U+0000-00FF; }`;
    const { root, faces } = parseFontFaces(css);
    setUnicodeRange(faces[0].atRule, 'U+61-7A');
    const output = root.toString();
    expect(output).toContain('U+61-7A');
    expect(output).not.toContain('U+0000-00FF');
  });
});
