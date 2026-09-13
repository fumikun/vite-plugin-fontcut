import { describe, expect, it } from 'vitest';
import { charsOf, extractContentGlyphs, extractTextFromHtml } from '../src/text.js';

describe('extractTextFromHtml', () => {
  it('extracts visible text nodes', () => {
    const html = '<html><body><h1>Hello</h1><p>World</p></body></html>';
    const text = extractTextFromHtml(html);
    expect(text).toContain('Hello');
    expect(text).toContain('World');
  });

  it('ignores script and style contents', () => {
    const html = `
      <html>
        <head><style>.a::before { content: "\\f101"; }</style></head>
        <body>
          <script>const secret = "shouldNotAppear";</script>
          <p>Visible</p>
        </body>
      </html>`;
    const text = extractTextFromHtml(html);
    expect(text).toContain('Visible');
    expect(text).not.toContain('shouldNotAppear');
    expect(text).not.toContain('f101');
  });

  it('ignores HTML comments', () => {
    const html = '<p>Real<!-- Hidden --></p>';
    const text = extractTextFromHtml(html);
    expect(text).toContain('Real');
    expect(text).not.toContain('Hidden');
  });

  it('pulls text out of common user-visible attributes', () => {
    const html =
      '<img src="a.png" alt="A cat"><input placeholder="Type here" title="Tooltip" aria-label="Label text">';
    const text = extractTextFromHtml(html);
    expect(text).toContain('A cat');
    expect(text).toContain('Type here');
    expect(text).toContain('Tooltip');
    expect(text).toContain('Label text');
  });

  it('decodes HTML entities, including numeric and Japanese named references', () => {
    const html = '<p>Tom &amp; Jerry &mdash; caf&#233; &#x65e5;&#x672c;&#x8a9e;</p>';
    // &mdash; isn't in our small named-entity table, so it should survive verbatim
    // rather than crash; the important part is the numeric/hex entities decode.
    const text = extractTextFromHtml(html);
    expect(text).toContain('Tom & Jerry');
    expect(text).toContain('café');
    expect(text).toContain('日本語');
  });

  it('handles Japanese text end to end', () => {
    const html = '<html><body><h1>こんにちは、世界</h1></body></html>';
    const text = extractTextFromHtml(html);
    expect(text).toContain('こんにちは');
    expect(text).toContain('世界');
  });
});

describe('extractContentGlyphs', () => {
  it('extracts literal characters from content declarations', () => {
    const css = '.icon-star::before { content: "★"; }';
    expect(extractContentGlyphs(css)).toBe('★');
  });

  it('decodes CSS unicode escapes used by icon fonts', () => {
    const css = '.icon::before { content: "\\f101"; }';
    expect(extractContentGlyphs(css)).toBe(String.fromCodePoint(0xf101));
  });

  it('collects glyphs across multiple rules', () => {
    const css = `
      .a::before { content: "\\e901"; }
      .b::after { content: "\\e902"; }
    `;
    const glyphs = extractContentGlyphs(css);
    expect(glyphs).toContain(String.fromCodePoint(0xe901));
    expect(glyphs).toContain(String.fromCodePoint(0xe902));
  });
});

describe('charsOf', () => {
  it('deduplicates characters and keeps spaces but drops other whitespace', () => {
    const set = charsOf('aab b\n\tc');
    expect(set).toEqual(new Set(['a', 'b', ' ', 'c']));
  });

  it('splits by code point so surrogate pairs are not corrupted', () => {
    // U+1F600 GRINNING FACE is outside the BMP and needs a surrogate pair in UTF-16.
    const set = charsOf('a\u{1F600}b');
    expect(set.has('\u{1F600}')).toBe(true);
    expect(set.size).toBe(3);
  });
});
