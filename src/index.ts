import path from 'node:path';
import type { OutputAsset, OutputBundle, PluginContext } from 'rollup';
import type { Plugin, ResolvedConfig } from 'vite';
import subsetFont from 'subset-font';
import {
  expandFontFaceForBuckets,
  parseFontFaces,
  setFontFaceSrcUrl,
  setUnicodeRange,
  type FontFaceInfo,
} from './fontFace.js';
import { findStylesheetHrefs, injectPreloadLinks, type PreloadCandidate } from './preload.js';
import { splitCharsByBlock } from './scriptBlocks.js';
import { charsOf, extractContentGlyphs, extractTextFromHtml } from './text.js';
import { charsToUnicodeRange, codePointInRanges, type Range } from './unicodeRange.js';

export type FontcutFormat = 'woff2' | 'woff' | 'sfnt';

export interface FontcutOptions {
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
  targetFormat?: FontcutFormat;
  /** Log a summary of the subsetting results. Defaults to true. */
  verbose?: boolean;
  /**
   * Inject `<link rel="preload" as="font" crossorigin>` tags into `<head>`
   * for the first locally-hosted `src` of every @font-face rule used by a
   * page's stylesheets, so the browser starts fetching the (now tiny)
   * subsetted font as soon as possible instead of waiting for the CSS to be
   * parsed. Defaults to true.
   */
  preload?: boolean;
  /**
   * Split each subsetted font into multiple `@font-face` rules by Unicode
   * block/script (Latin, Kana, CJK ideographs, Cyrillic, ...), each with its
   * own `unicode-range` and its own (much smaller) font file, instead of one
   * file covering every used script. This lets the browser fetch only the
   * block(s) actually needed to render a given page.
   *
   * A rule is left as a single subset (not split) when it already declares
   * a `unicode-range` (it's already been split upstream, e.g. a pre-split
   * Google Fonts family) or when it lists more than one locally-hosted
   * `src` (format fallbacks), since splitting those could produce
   * mismatched fallback sets. Implies `addUnicodeRange` for the rules it
   * does split, regardless of that option's value. Defaults to false.
   */
  splitByScript?: boolean;
}

const FONT_MIME: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const EXT_TO_FORMAT: Record<string, FontcutFormat> = {
  '.woff2': 'woff2',
  '.woff': 'woff',
  '.ttf': 'sfnt',
  '.otf': 'sfnt',
};

const FORMAT_TO_EXT: Record<FontcutFormat, string> = {
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

export default function fontcut(options: FontcutOptions = {}): Plugin {
  const {
    additionalText = '',
    alwaysInclude = ' ',
    formats = ['woff2', 'woff', 'ttf', 'otf'],
    exclude = [],
    addUnicodeRange = true,
    targetFormat,
    verbose = true,
    preload = true,
    splitByScript = false,
  } = options;

  const formatSet = new Set(formats);
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'vite-plugin-fontcut',
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
        this.warn('vite-plugin-fontcut: no text found in the built HTML/CSS; skipping font subsetting.');
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

      // Track how many distinct locally-hosted font assets back each
      // @font-face rule, so splitByScript can skip rules with format
      // fallbacks (splitting those independently could produce mismatched
      // fallback sets across formats).
      const atRuleAssetCounts = new Map<Occurrence['atRule'], Set<string>>();
      for (const [assetFileName, occurrences] of occurrencesByAsset) {
        for (const occurrence of occurrences) {
          const set = atRuleAssetCounts.get(occurrence.atRule) ?? new Set<string>();
          set.add(assetFileName);
          atRuleAssetCounts.set(occurrence.atRule, set);
        }
      }

      // 4. Subset each unique font asset.
      const stats: Array<{ family: string; file: string; before: number; after: number }> = [];
      const finalFileNameByOriginal = new Map<string, string>();

      for (const [assetFileName, occurrences] of occurrencesByAsset) {
        finalFileNameByOriginal.set(assetFileName, assetFileName);
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
          if (verbose) this.warn(`vite-plugin-fontcut: no used characters match ${assetFileName}, skipping.`);
          continue;
        }

        const ext = path.posix.extname(assetFileName).toLowerCase();
        const nativeFormat = EXT_TO_FORMAT[ext];
        const outputFormat = targetFormat ?? nativeFormat;

        const canSplit =
          splitByScript &&
          !declaredRanges &&
          occurrences.every((o) => (atRuleAssetCounts.get(o.atRule)?.size ?? 1) === 1);
        const scriptBuckets = canSplit ? splitCharsByBlock(charsForFont) : null;

        if (!scriptBuckets || scriptBuckets.size <= 1) {
          // Single-subset path.
          let subsetBuffer: Buffer;
          try {
            subsetBuffer = await subsetFont(originalBuffer, Array.from(charsForFont).join(''), {
              targetFormat: outputFormat,
            });
          } catch (error) {
            this.warn(
              `vite-plugin-fontcut: failed to subset ${assetFileName}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            continue;
          }

          if (subsetBuffer.byteLength >= originalBuffer.byteLength) {
            if (verbose) {
              this.warn(
                `vite-plugin-fontcut: subset of ${assetFileName} was not smaller than the original, keeping the original.`,
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
            finalFileNameByOriginal.set(assetFileName, finalFileName);
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
          continue;
        }

        // Split-subset path: one subset file + one @font-face rule per
        // populated Unicode block, each scoped with its own unicode-range so
        // the browser only fetches the block(s) it actually needs.
        const finalExt = outputFormat === nativeFormat ? ext : FORMAT_TO_EXT[outputFormat];
        const oldBaseName = path.posix.basename(assetFileName);
        const stem = oldBaseName.slice(0, -ext.length);
        const dir = path.posix.dirname(assetFileName);

        const bucketOutputs: Array<{ id: string; fileName: string; buffer: Buffer; chars: Set<string> }> = [];
        for (const [bucketId, bucketChars] of scriptBuckets) {
          let subsetBuffer: Buffer;
          try {
            subsetBuffer = await subsetFont(originalBuffer, Array.from(bucketChars).join(''), {
              targetFormat: outputFormat,
            });
          } catch (error) {
            this.warn(
              `vite-plugin-fontcut: failed to subset ${assetFileName} (${bucketId}): ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            continue;
          }
          if (subsetBuffer.byteLength >= originalBuffer.byteLength) continue;

          const bucketFileName = (dir === '.' ? '' : `${dir}/`) + `${stem}-${bucketId}${finalExt}`;
          bucketOutputs.push({ id: bucketId, fileName: bucketFileName, buffer: subsetBuffer, chars: bucketChars });
        }

        if (bucketOutputs.length === 0) {
          if (verbose) {
            this.warn(
              `vite-plugin-fontcut: no split subset of ${assetFileName} was smaller than the original, keeping the original.`,
            );
          }
          continue;
        }

        delete bundle[assetFileName];
        for (const bucket of bucketOutputs) {
          bundle[bucket.fileName] = {
            type: 'asset',
            fileName: bucket.fileName,
            name: bundleAsset.name,
            source: bucket.buffer,
          } as unknown as OutputAsset;
        }
        // Only the first (and usually most broadly useful) block is
        // preloaded — see the preload step below.
        finalFileNameByOriginal.set(assetFileName, bucketOutputs[0].fileName);

        for (const occurrence of occurrences) {
          expandFontFaceForBuckets(
            occurrence.atRule,
            occurrence.url,
            bucketOutputs.map((b) => ({
              url: occurrence.url.replace(oldBaseName, path.posix.basename(b.fileName)),
              unicodeRange: charsToUnicodeRange(b.chars),
            })),
          );
        }

        for (const bucket of bucketOutputs) {
          stats.push({
            family: `${occurrences[0]?.family ?? assetFileName} [${bucket.id}]`,
            file: bucket.fileName,
            before: originalBuffer.byteLength,
            after: bucket.buffer.byteLength,
          });
        }
      }

      // 5. Write the mutated CSS ASTs back to the bundle.
      for (const { asset, root, faces } of parsedCss) {
        if (faces.length === 0) continue;
        asset.source = root.toString();
      }

      // 6. Preload the first locally-hosted src of every @font-face rule, so
      // the browser fetches the (now tiny) font without waiting on the CSS.
      if (preload) {
        const base = resolvedConfig?.base ?? '/';
        const preloadCandidatesByCss = new Map<string, PreloadCandidate[]>();

        for (const { asset, faces } of parsedCss) {
          const seen = new Set<string>();
          const candidates: PreloadCandidate[] = [];
          for (const face of faces) {
            const firstLocalSrc = face.srcs[0];
            if (!firstLocalSrc) continue;
            const resolved = resolveBundleFileName(asset.fileName, firstLocalSrc.url, base, bundleKeys);
            if (!resolved) continue;
            const finalFileName = finalFileNameByOriginal.get(resolved) ?? resolved;
            if (seen.has(finalFileName)) continue;
            seen.add(finalFileName);
            const ext = path.posix.extname(finalFileName).toLowerCase();
            const type = FONT_MIME[ext];
            if (!type) continue;
            const href = base.replace(/\/+$/, '') + '/' + finalFileName;
            candidates.push({ href, type });
          }
          if (candidates.length > 0) preloadCandidatesByCss.set(asset.fileName, candidates);
        }

        for (const html of htmlAssets) {
          const source =
            typeof html.source === 'string' ? html.source : Buffer.from(html.source).toString('utf8');
          const cssHrefs = findStylesheetHrefs(source);
          const candidates: PreloadCandidate[] = [];
          const seenHrefs = new Set<string>();
          for (const cssHref of cssHrefs) {
            const resolvedCss = resolveBundleFileName(html.fileName, cssHref, base, bundleKeys);
            if (!resolvedCss) continue;
            for (const candidate of preloadCandidatesByCss.get(resolvedCss) ?? []) {
              if (seenHrefs.has(candidate.href)) continue;
              seenHrefs.add(candidate.href);
              candidates.push(candidate);
            }
          }
          if (candidates.length > 0) {
            html.source = injectPreloadLinks(source, candidates);
          }
        }
      }

      if (verbose && stats.length > 0) {
        const totalBefore = stats.reduce((sum, s) => sum + s.before, 0);
        const totalAfter = stats.reduce((sum, s) => sum + s.after, 0);
        this.warn(
          `vite-plugin-fontcut: subsetted ${stats.length} font(s), ${formatBytes(totalBefore)} -> ${formatBytes(
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
