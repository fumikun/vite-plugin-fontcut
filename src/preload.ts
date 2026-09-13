const LINK_TAG_RE = /<link\b[^>]*>/gi;
const REL_RE = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/**
 * Finds the `href` of every `<link rel="stylesheet">` tag in a chunk of
 * built HTML, so we know which CSS files (and therefore which fonts) a given
 * page actually loads.
 */
export function findStylesheetHrefs(html: string): string[] {
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;
  LINK_TAG_RE.lastIndex = 0;
  while ((match = LINK_TAG_RE.exec(html))) {
    const tag = match[0];
    const relMatch = REL_RE.exec(tag);
    const rel = relMatch ? relMatch[1] ?? relMatch[2] ?? relMatch[3] ?? '' : '';
    if (!/\bstylesheet\b/i.test(rel)) continue;
    const hrefMatch = HREF_RE.exec(tag);
    const href = hrefMatch ? hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] : undefined;
    if (href) hrefs.push(href);
  }
  return hrefs;
}

export interface PreloadCandidate {
  href: string;
  type: string;
}

/**
 * Inserts `<link rel="preload" as="font">` tags as early as possible in
 * `<head>`, deduplicating by href against tags already present.
 */
export function injectPreloadLinks(html: string, candidates: PreloadCandidate[]): string {
  if (candidates.length === 0) return html;

  const existingHrefs = new Set<string>();
  const preloadHrefRe = /<link\b[^>]*rel\s*=\s*(?:"preload"|'preload'|preload)[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = preloadHrefRe.exec(html))) {
    const hrefMatch = HREF_RE.exec(match[0]);
    const href = hrefMatch ? hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] : undefined;
    if (href) existingHrefs.add(href);
  }

  const fresh = candidates.filter((c) => !existingHrefs.has(c.href));
  if (fresh.length === 0) return html;

  const tags = fresh
    .map((c) => `<link rel="preload" as="font" type="${c.type}" href="${c.href}" crossorigin>`)
    .join('');

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, (m) => `${m}${tags}`);
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${tags}</head>`);
  }
  return tags + html;
}
