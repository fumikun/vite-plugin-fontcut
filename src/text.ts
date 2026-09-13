const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const codePoint =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      if (!Number.isNaN(codePoint)) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

// Attributes whose value is text that gets rendered/announced to the user and
// therefore may require glyphs from a webfont.
const TEXT_ATTRIBUTES = ['alt', 'title', 'placeholder', 'aria-label', 'value', 'label'];

/**
 * Extracts every character that is likely to be rendered on the page from a
 * chunk of built HTML: text nodes (outside of <script>/<style>/<template>)
 * plus a handful of attributes that commonly hold user-visible text.
 *
 * This is a lightweight, regex-based approximation rather than a full HTML
 * parser/DOM â€“ it only needs to be precise enough to gather the set of
 * characters actually used, not to reconstruct document structure.
 */
export function extractTextFromHtml(html: string): string {
  let text = html;

  // Drop content that never renders as visible glyphs.
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  const chunks: string[] = [];

  // Pull out attribute values that hold user-visible text before stripping tags.
  const attrPattern = new RegExp(
    `\\b(?:${TEXT_ATTRIBUTES.join('|')})\\s*=\\s*("([^"]*)"|'([^']*)')`,
    'gi',
  );
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(text))) {
    chunks.push(match[2] ?? match[3] ?? '');
  }

  // Remaining text nodes: strip every tag, keep what's left.
  chunks.push(text.replace(/<[^>]*>/g, ' '));

  return decodeEntities(chunks.join(' '));
}

/**
 * Pulls the string literals out of CSS `content:` declarations, which is how
 * icon fonts render glyphs (e.g. `content: "\f101";`) without them ever
 * appearing in the DOM as text.
 */
export function extractContentGlyphs(css: string): string {
  const chunks: string[] = [];
  const contentPattern = /content\s*:\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\s*,?\s*)+)/gi;
  let match: RegExpExecArray | null;
  while ((match = contentPattern.exec(css))) {
    const value = match[1];
    const stringPattern = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
    let stringMatch: RegExpExecArray | null;
    while ((stringMatch = stringPattern.exec(value))) {
      const raw = stringMatch[1] ?? stringMatch[2] ?? '';
      chunks.push(unescapeCssString(raw));
    }
  }
  return chunks.join('');
}

function unescapeCssString(raw: string): string {
  return raw.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (_m, esc: string) => {
    if (/^[0-9a-fA-F]/.test(esc)) {
      const codePoint = parseInt(esc.trim(), 16);
      if (!Number.isNaN(codePoint)) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return '';
        }
      }
    }
    return esc;
  });
}

export function charsOf(text: string): Set<string> {
  const set = new Set<string>();
  for (const char of text) {
    if (char.trim() === '' && char !== ' ') continue;
    set.add(char);
  }
  return set;
}
