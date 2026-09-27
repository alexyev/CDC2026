// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

/**
 * A small Markdown parser for the authored content in src/content/ (the About page, SPEC.md 15).
 * It covers only what that content uses: headings, paragraphs (one sentence per line, joined with spaces),
 * unordered lists with indented continuation lines, `<!-- name -->` component directives,
 * and inline links, strong, emphasis, and code.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; depth: 1 | 2 | 3; id: string; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; items: Inline[][] }
  | { type: "directive"; name: string };

/** "Known gaps" -> "known-gaps". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HEADING = /^(#{1,3})\s+(.+)$/;
const DIRECTIVE = /^<!--\s*([a-z0-9-]+)\s*-->$/;
const LIST_ITEM = /^-\s+(.*)$/;
const CONTINUATION = /^\s{2,}(\S.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let items: string[][] | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
    if (items) blocks.push({ type: "list", items: items.map((lines) => parseInline(lines.join(" "))) });
    paragraph = [];
    items = null;
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    const directive = DIRECTIVE.exec(line);
    const item = LIST_ITEM.exec(line);
    const continuation = CONTINUATION.exec(line);
    if (heading) {
      flush();
      const children = parseInline(heading[2].trim());
      blocks.push({
        type: "heading",
        depth: heading[1].length as 1 | 2 | 3,
        id: slugify(plainText(children)),
        children,
      });
    } else if (directive) {
      flush();
      blocks.push({ type: "directive", name: directive[1] });
    } else if (item) {
      if (paragraph.length) flush();
      items ??= [];
      items.push([item[1]]);
    } else if (continuation && items) {
      items[items.length - 1].push(continuation[1]);
    } else {
      if (items) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ type: "text", value: text.slice(last, index) });
    if (m[1] !== undefined) out.push({ type: "link", href: m[2], children: parseInline(m[1]) });
    else if (m[3] !== undefined) out.push({ type: "strong", children: parseInline(m[3]) });
    else if (m[4] !== undefined) out.push({ type: "em", children: parseInline(m[4]) });
    else out.push({ type: "code", value: m[5] });
    last = index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

/** The inline content as plain text, for ids and accessible names. */
export function plainText(nodes: Inline[]): string {
  return nodes.map((n) => ("children" in n ? plainText(n.children) : n.value)).join("");
}
