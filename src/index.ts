import path from 'node:path';
import type { OutputAsset, OutputBundle, PluginContext } from 'rollup';
import type { Plugin, ResolvedConfig } from 'vite';
import subsetFont from 'subset-font';
import { parseFontFaces, setFontFaceSrcUrl, setUnicodeRange, type FontFaceInfo } from './fontFace.js';
import { charsOf, extractContentGlyphs, extractTextFromHtml } from './text.js';
import { charsToUnicodeRange, codePointInRanges, type Range } from './unicodeRange.js';

export type SubfontFormat = 'woff2' | 'woff' | 'sfnt';

export interface SubfontOptions {
  /**
   * Extra text that should be treated as "used" even though it doesn't
   * appear in the built HTML â€” e.g. strings rendered client-side by JS
   * after hydration. Accepts a single string or an array of strings.
   */
  additionalText?: string | string[];
  /**
   * Characters that are always kept in every subsetted font, regardless of
   * whether they were found in the page. Defaults to a single space, which
   * keeps most fonts well-behaved.
   */
  alwaysInclude?: string;
  /**
   * Which font container formats to subset. Fonts referenced with any other
   * extension are left untouched. Defaults to all supported formats.
   */
  formats?: Array<'woff2' | 'woff' | 'ttf' | 'otf'>;
  /**
   * Skip subsetting for @font-face rules whose font-family matches any of
   * these strings/patterns.
   */
  exclude?: Array<string | RegExp>;
  /**
   * Rewrite the `unicode-range` descriptor of each @font-face to reflect the
   * characters that ended up in the subset. Defaults to true.
   */
  addUnicodeRange?: boolean;
  /**
   * Force all subsetted fonts to be re-encoded to this container format
   * instead of keeping their original one.
   */
  targetFormat?: SubfontFormat;
  /** Log a summary of the subsetting results. Defaults to true. */
  verbose?: boolean;
}

const EXT_TO_FORMAT: Record<string, SubfontFormat> = {
  '.woff2': 'woff2',
  '.woff': 'woff',
  '.ttf': 'sfnt',
  '.otf': 'sfnt',
};

const FORMAT_TO_EXT: Record<SubfontFormat, string> = {
  woff2: '.woff2',
  woff: '.woff',
  sfnt: '.ttf',
};

interface Occurrence {
  cssFileName: string;
  atRule: FontFaceInfo['atRule'];
  url: string;
  family?: string;
  unicodeRanges: Range[] | null;
}

function isAssetOfInterest(fileName: string, formats: Set<string>): boolean {
  const ext = path.posix.extname(fileName).toLowerCase();
  const kind = ext.replace('.', '');
  return formats.has(kind);
}

function resolveBundleFileName(
  cssFileName: string,
  url: string,
  base: string,
  bundleKeys: Set<string>,
): string | null {
  const pathname = url.split(/[?#]/)[0];
  let candidate: string;
  if (pathname.startsWith('/')) {
    let rel = pathname.slice(1);
    const normalizedBase = base.replace(/^\/+|\/+$/g, '');
    if (normalizedBase && rel.startsWith(normalizedBase)) {
      rel = rel.slice(normalizedBase.length).replace(/^\/+/, '');
    }
    candidate = rel;
  } else {
    candidate = path.posix.normalize(path.posix.join(path.posix.dirname(cssFileName), pathname));
  }

  if (bundleKeys.has(candidate)) return candidate;

  const baseName = path.posix.basename(candidate);
  for (const key of bundleKeys) {
    if (path.posix.basename(key) === baseName) return key;
  }
  return null;
}

function isExcluded(family: string | undefined, patterns: Array<string | RegExp>): boolean {
  if (!family) return false;
  return patterns.some((pattern) =>
    typeof pattern === 'string' ? pattern === family : pattern.test(family),
  );
}

export default function subfont(options: SubfontOptions = {}): Plugin {
  const {
    additionalText = '',
    alwaysInclude = ' ',
    formats = ['woff2', 'woff', 'ttf', 'otf'],
    exclude = [],
    addUnicodeRange = true,
    targetFormat,
    verbose = true,
  } = options;

  const formatSet = new Set(formats);
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'vite-plugin-subfont',
    apply: 'build',
    enforce: 'post',

    configResolved(config) {
      resolvedConfig = config;
    },

    async generateBundle(_outputOptions, bundle: OutputBundle) {
      const bundleKeys = new Set(Object.keys(bundle));

      const htmlAssets: OutputAsset[] = [];
      const cssAssets: OutputAsset[] = [];
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset') continue;
        if (asset.fileName.endsWith('.html')) htmlAssets.push(asset);
        else if (asset.fileName.endsWith('.css')) cssAssets.push(asset);
      }

      if (cssAssets.length === 0) return;

      // 1. Collect every character that is known to be used on the site.
      const usedChars = new Set<string>();
      for (const html of htmlAssets) {
        const source = typeof html.source === 'string' ? html.source : Buffer.from(html.source).toString('utf8');
        for (const char of charsOf(extractTextFromHtml(source))) usedChars.add(char);
      }
      const extraText = Array.isArray(additionalText) ? additionalText.join('') : additionalText;
      for (const char of charsOf(extraText)) usedChars.add(char);

      // 2. Parse every CSS asset's @font-face rules up front.
      const parsedCss = cssAssets.map((asset) => {
        const source = typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString('utf8');
        for (const char of charsOf(extractContentGlyphs(source))) usedChars.add(char);
        const { root, faces } = parseFontFaces(source);
        return { asset, root, faces };
      });

      if (usedChars.size === 0) {
        this.warn('vite-plugin-subfont: no text found in the built HTML/CSS; skipping font subsetting.');
        return;
      }
      for (const char of alwaysInclude) usedChars.add(char);

      // 3. Resolve @font-face src urls to bundle entries and group by the
      // underlying font asset so a font referenced from multiple CSS files
      // is only subsetted once.
      const occurrencesByAsset = new Map<string, Occurrence[]>();
      for (const { asset, faces } of parsedCss) {
        for (const face of faces) {
          if (isExcluded(face.family, exclude)) continue;
          for (const src of face.srcs) {
            if (!isAssetOfInterest(src.url, formatSet)) continue;
            const resolved = resolveBundleFileName(
              asset.fileName,
              src.url,
              resolvedConfig?.base ?? '/',
              bundleKeys,
            );
            const bundleAsset = resolved ? bundle[resolved] : undefined;
            if (!resolved || !bundleAsset || bundleAsset.type !== 'asset') continue;

            const list = occurrencesByAsset.get(resolved) ?? [];
            list.push({
              cssFileName: asset.fileName,
              atRule: face.atRule,
              url: src.url,
              family: face.family,
              unicodeRanges: face.unicodeRanges,
            });
            occurrencesByAsset.set(resolved, list);
          }
        }
      }

      // 4. Subset each unique font asset.
      const stats: Array<{ family: string; file: string; before: number; after: number }> = [];

      for (const [assetFileName, occurrences] of occurrencesByAsset) {
        const bundleAsset = bundle[assetFileName] as OutputAsset;
        const originalBuffer = Buffer.from(
          typeof bundleAsset.source === 'string' ? Buffer.from(bundleAsset.source) : bundleAsset.source,
        );

        const declaredRanges = occurrences.find((o) => o.unicodeRanges)?.unicodeRanges ?? null;
        let charsForFont = usedChars;
        if (declaredRanges) {
          charsForFont = new Set(
            Array.from(usedChars).filter((c) => codePointInRanges(c.codePointAt(0)!, declaredRanges as Range[])),
          );
          for (const char of alwaysInclude) charsForFont.add(char);
        }

        if (charsForFont.size === 0) {
          if (verbose) this.warn(`vite-plugin-subfont: no used characters match ${assetFileName}, skipping.`);
          continue;
        }

        const ext = path.posix.extname(assetFileName).toLowerCase();
        const nativeFormat = EXT_TO_FORMAT[ext];
        const outputFormat = targetFormat ?? nativeFormat;

        let subsetBuffer: Buffer;
        try {
          subsetBuffer = await subsetFont(originalBuffer, Array.from(charsForFont).join(''), {
            targetFormat: outputFormat,
          });
        } catch (error) {
          this.warn(
            `vite-plugin-subfont: failed to subset ${assetFileName}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }

        if (subsetBuffer.byteLength >= originalBuffer.byteLength) {
          if (verbose) {
            this.warn(
              `vite-plugin-subfont: subset of ${assetFileName} was not smaller than the original, keeping the original.`,
            );
          }
          continue;
        }

        let finalFileName = assetFileName;
        if (outputFormat !== nativeFormat) {
          const newExt = FORMAT_TO_EXT[outputFormat];
          finalFileName = assetFileName.slice(0, -ext.length) + newExt;
        }

        if (finalFileName === assetFileName) {
          bundleAsset.source = subsetBuffer;
        } else {
          delete bundle[assetFileName];
          bundle[finalFileName] = {
            type: 'asset',
            fileName: finalFileName,
            name: bundleAsset.name,
            source: subsetBuffer,
          } as unknown as OutputAsset;

          const oldBaseName = path.posix.basename(assetFileName);
          const newBaseName = path.posix.basename(finalFileName);
          for (const occurrence of occurrences) {
            const newUrl = occurrence.url.replace(oldBaseName, newBaseName);
            setFontFaceSrcUrl(occurrence.atRule, occurrence.url, newUrl);
          }
        }

        if (addUnicodeRange) {
          const rangeValue = charsToUnicodeRange(charsForFont);
          for (const occurrence of occurrences) {
            setUnicodeRange(occurrence.atRule, rangeValue);
          }
        }

        stats.push({
          family: occurrences[0]?.family ?? assetFileName,
          file: assetFileName,
          before: originalBuffer.byteLength,
          after: subsetBuffer.byteLength,
        });
      }

      // 5. Write the mutated CSS ASTs back to the bundle.
      for (const { asset, root, faces } of parsedCss) {
        if (faces.length === 0) continue;
        asset.source = root.toString();
      }

      if (verbose && stats.length > 0) {
        const totalBefore = stats.reduce((sum, s) => sum + s.before, 0);
        const totalAfter = stats.reduce((sum, s) => sum + s.after, 0);
        this.warn(
          `vite-plugin-subfont: subsetted ${stats.length} font(s), ${formatBytes(totalBefore)} -> ${formatBytes(
            totalAfter,
          )} (${((1 - totalAfter / totalBefore) * 100).toFixed(1)}% smaller).\n` +
            stats
              .map((s) => `  - ${s.family} (${s.file}): ${formatBytes(s.before)} -> ${formatBytes(s.after)}`)
              .join('\n'),
        );
      }
    },
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
