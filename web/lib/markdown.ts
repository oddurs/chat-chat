/**
 * A deliberately small markdown parser, scoped to what these models actually emit:
 * bullets, italics, bold, ordered lists, inline code, tables, blockquotes — measured over the
 * corpus, in that order of frequency. Headings, fences and links are cheap to add so they are
 * here too. Everything else (footnotes, images, reference links, HTML) is left as literal text,
 * which matters: models invent notation like `[TaskID] Act {Target} @Loc` that must survive.
 *
 * Parsing is separated from rendering so it can be tested without a DOM.
 *
 * Known limitation: emphasis nested directly inside emphasis (`**bold *and italic***`) is not
 * resolved the way a full delimiter-run parser would — the inner marker is left as literal text.
 * Zero occurrences in 367 corpus turns, so the delimiter-run machinery is not worth its weight.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; kids: Inline[] }
  | { t: "i"; kids: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; kids: Inline[] };

export type Block =
  | { t: "p"; kids: Inline[] }
  | { t: "h"; level: number; kids: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][]; start: number }
  | { t: "quote"; kids: Inline[] }
  | { t: "code"; v: string; lang?: string }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "hr" };

const BULLET = /^\s{0,3}[-•*]\s+(.*)$/;
const ORDERED = /^\s{0,3}(\d+)[.)]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const FENCE = /^\s*```(\w*)\s*$/;
const RULE = /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/;
const ROW = /^\s*\|(.+)\|\s*$/;
const DIVIDER = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

function cells(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence, or end of input
      out.push({ t: "code", v: body.join("\n"), lang: fence[1] || undefined });
      continue;
    }

    if (RULE.test(line)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      out.push({ t: "h", level: heading[1].length, kids: parseInline(heading[2]) });
      i++;
      continue;
    }

    // A table needs a header row and a |---|---| divider under it; anything else is a paragraph.
    if (ROW.test(line) && i + 1 < lines.length && DIVIDER.test(lines[i + 1]) && lines[i + 1].includes("|")) {
      const head = cells(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && ROW.test(lines[i])) rows.push(cells(lines[i++]).map(parseInline));
      out.push({ t: "table", head, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].match(QUOTE)![1]);
      out.push({ t: "quote", kids: parseInline(body.join("\n")) });
      continue;
    }

    if (BULLET.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        let text = lines[i++].match(BULLET)![1];
        // A wrapped continuation line belongs to the item above it.
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) text += " " + lines[i++].trim();
        items.push(parseInline(text));
      }
      out.push({ t: "ul", items });
      continue;
    }

    if (ORDERED.test(line)) {
      const first = line.match(ORDERED)!;
      const items: Inline[][] = [];
      const start = Number(first[1]);
      while (i < lines.length && ORDERED.test(lines[i])) {
        let text = lines[i++].match(ORDERED)![2];
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) text += " " + lines[i++].trim();
        items.push(parseInline(text));
      }
      out.push({ t: "ol", items, start });
      continue;
    }

    // Always consume the current line first. A line that looks like a block start but was not
    // claimed above (a pipe row with no divider, say) would otherwise advance nothing and spin.
    const para: string[] = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++]);
    out.push({ t: "p", kids: parseInline(para.join("\n")) });
  }

  return out;
}

function isBlockStart(line: string): boolean {
  return (
    BULLET.test(line) ||
    ORDERED.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    FENCE.test(line) ||
    RULE.test(line) ||
    ROW.test(line)
  );
}

// Ordered by precedence. Emphasis requires non-space just inside the delimiters, so a lone
// asterisk, a multiplication sign, or `snake_case` is never mistaken for emphasis.
// Kept as source, not a RegExp: parseInline recurses into the contents of bold and italic
// spans, and a shared /g/ regex would have its lastIndex clobbered by the inner call.
const INLINE_SOURCE = [
  "`([^`\\n]+)`",
  "\\*\\*(?=\\S)([\\s\\S]*?\\S)\\*\\*",
  "__(?=\\S)([\\s\\S]*?\\S)__",
  "(?<![\\w*])\\*(?=[^\\s*])([^*\\n]*?[^\\s*])\\*(?![\\w*])",
  "(?<![\\w_])_(?=[^\\s_])([^_\\n]*?[^\\s_])_(?![\\w_])",
  "\\[([^\\]\\n]+)\\]\\(([^)\\s]+)\\)",
].join("|");

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = new RegExp(INLINE_SOURCE, "g");
  let last = 0;

  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ t: "text", v: src.slice(last, m.index) });
    const [, code, bold1, bold2, ital1, ital2, linkText, href] = m;

    if (code !== undefined) out.push({ t: "code", v: code });
    else if (bold1 ?? bold2) out.push({ t: "b", kids: parseInline(bold1 ?? bold2) });
    else if (ital1 ?? ital2) out.push({ t: "i", kids: parseInline(ital1 ?? ital2) });
    else if (linkText !== undefined) out.push({ t: "link", href, kids: parseInline(linkText) });

    last = m.index + m[0].length;
  }

  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

/** Flatten back to plain text — for copy buttons, search snippets and titles. */
export function toText(nodes: Inline[]): string {
  return nodes
    .map((n) => (n.t === "text" ? n.v : n.t === "code" ? n.v : toText(n.kids)))
    .join("");
}
