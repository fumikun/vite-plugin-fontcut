import postcss, { type AtRule } from 'postcss';
import valueParser from 'postcss-value-parser';
import { parseUnicodeRange, type Range } from './unicodeRange.js';

export interface FontFaceSrc {
  /** The raw url() reference as written in the CSS, e.g. `./assets/foo-abc123.woff2` */
  url: string;
  format?: string;
  node: ReturnType<typeof valueParser>;
}

export interface FontFaceInfo {
  atRule: AtRule;
  family?: string;
  weight?: string;
  style?: string;
  unicodeRanges: Range[] | null;
  srcs: FontFaceSrc[];
}

function isExternalUrl(url: string): boolean {
  return /^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('data:');
}

export function parseFontFaces(css: string): { root: postcss.Root; faces: FontFaceInfo[] } {
  const root = postcss.parse(css);
  const faces: FontFaceInfo[] = [];

  root.walkAtRules('font-face', (atRule) => {
    let family: string | undefined;
    let weight: string | undefined;
    let style: string | undefined;
    let unicodeRangeValue: string | undefined;
    const srcs: FontFaceSrc[] = [];

    atRule.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop === 'font-family') {
        family = valueParser.stringify(valueParser(decl.value).nodes).replace(/^["']|["']$/g, '');
      } else if (prop === 'font-weight') {
        weight = decl.value.trim();
      } else if (prop === 'font-style') {
        style = decl.value.trim();
      } else if (prop === 'unicode-range') {
        unicodeRangeValue = decl.value;
      } else if (prop === 'src') {
        const parsed = valueParser(decl.value);
        // `src` is a comma-separated list of `url(...) format(...)` terms.
        const groups: valueParser.Node[][] = [[]];
        for (const node of parsed.nodes) {
          if (node.type === 'div' && node.value === ',') {
            groups.push([]);
          } else {
            groups[groups.length - 1].push(node);
          }
        }
        for (const group of groups) {
          const urlNode = group.find((n) => n.type === 'function' && n.value.toLowerCase() === 'url');
          const formatNode = group.find(
            (n) => n.type === 'function' && n.value.toLowerCase() === 'format',
          );
          if (urlNode && urlNode.type === 'function') {
            const url = valueParser.stringify(urlNode.nodes).replace(/^["']|["']$/g, '');
            if (!isExternalUrl(url)) {
              const format =
                formatNode && formatNode.type === 'function'
                  ? valueParser.stringify(formatNode.nodes).replace(/^["']|["']$/g, '')
                  : undefined;
              srcs.push({ url, format, node: parsed });
            }
          }
        }
      }
    });

    faces.push({
      atRule,
      family,
      weight,
      style,
      unicodeRanges: unicodeRangeValue ? parseUnicodeRange(unicodeRangeValue) : null,
      srcs,
    });
  });

  return { root, faces };
}

export function setFontFaceSrcUrl(atRule: AtRule, oldUrl: string, newUrl: string): void {
  atRule.walkDecls('src', (decl) => {
    if (decl.value.includes(oldUrl)) {
      decl.value = decl.value.split(oldUrl).join(newUrl);
    }
  });
}

export function setUnicodeRange(atRule: AtRule, value: string): void {
  let found = false;
  atRule.walkDecls('unicode-range', (decl) => {
    decl.value = value;
    found = true;
  });
  if (!found) {
    atRule.append({ prop: 'unicode-range', value });
  }
}

/**
 * Expands a single `@font-face` rule into one rule per entry in
 * `bucketOutputs` — used to split a font that was subsetted into several
 * per-script/unicode-block files. The first entry reuses `atRule` in place;
 * every subsequent entry is a clone inserted immediately after the previous
 * one, so declaration order in the stylesheet matches `bucketOutputs` order.
 */
export function expandFontFaceForBuckets(
  atRule: AtRule,
  oldUrl: string,
  bucketOutputs: Array<{ url: string; unicodeRange: string }>,
): void {
  if (bucketOutputs.length === 0) return;

  const clones = bucketOutputs.slice(1).map(() => atRule.clone());

  setFontFaceSrcUrl(atRule, oldUrl, bucketOutputs[0].url);
  setUnicodeRange(atRule, bucketOutputs[0].unicodeRange);

  let anchor: AtRule = atRule;
  for (let i = 1; i < bucketOutputs.length; i++) {
    const clone = clones[i - 1];
    setFontFaceSrcUrl(clone, oldUrl, bucketOutputs[i].url);
    setUnicodeRange(clone, bucketOutputs[i].unicodeRange);
    anchor.after(clone);
    anchor = clone;
  }
}
