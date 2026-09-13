import { describe, expect, it } from 'vitest';
import { findStylesheetHrefs, injectPreloadLinks } from '../src/preload.js';

describe('findStylesheetHrefs', () => {
  it('finds the href of stylesheet links', () => {
    const html = '<head><link rel="stylesheet" href="/assets/style.css"></head>';
    expect(findStylesheetHrefs(html)).toEqual(['/assets/style.css']);
  });

  it('works regardless of attribute order', () => {
    const html = '<link href="/a.css" rel="stylesheet">';
    expect(findStylesheetHrefs(html)).toEqual(['/a.css']);
  });

  it('ignores non-stylesheet links', () => {
    const html = '<link rel="icon" href="/favicon.ico"><link rel="preload" href="/a.woff2">';
    expect(findStylesheetHrefs(html)).toEqual([]);
  });

  it('finds multiple stylesheet links', () => {
    const html = '<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css">';
    expect(findStylesheetHrefs(html)).toEqual(['/a.css', '/b.css']);
  });
});

describe('injectPreloadLinks', () => {
  it('inserts a preload link right after the opening head tag', () => {
    const html = '<head><link rel="stylesheet" href="/a.css"></head>';
    const result = injectPreloadLinks(html, [{ href: '/font.woff2', type: 'font/woff2' }]);
    expect(result).toContain(
      '<head><link rel="preload" as="font" type="font/woff2" href="/font.woff2" crossorigin><link rel="stylesheet"',
    );
  });

  it('falls back to inserting before </head> when there is no opening tag match', () => {
    const html = '<html>no head tag here</head></html>';
    const result = injectPreloadLinks(html, [{ href: '/font.woff2', type: 'font/woff2' }]);
    expect(result).toContain('<link rel="preload"');
    expect(result.indexOf('<link rel="preload"')).toBeLessThan(result.indexOf('</head>'));
  });

  it('returns the input unchanged when there are no candidates', () => {
    const html = '<head></head>';
    expect(injectPreloadLinks(html, [])).toBe(html);
  });

  it('does not duplicate a preload link that already exists', () => {
    const html = '<head><link rel="preload" as="font" type="font/woff2" href="/font.woff2" crossorigin></head>';
    const result = injectPreloadLinks(html, [{ href: '/font.woff2', type: 'font/woff2' }]);
    expect(result.match(/rel="preload"/g)).toHaveLength(1);
  });

  it('adds crossorigin and the correct mime type', () => {
    const html = '<head></head>';
    const result = injectPreloadLinks(html, [{ href: '/font.ttf', type: 'font/ttf' }]);
    expect(result).toContain('type="font/ttf"');
    expect(result).toContain('crossorigin');
  });
});
