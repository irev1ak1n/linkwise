// Highlights the words and phrases the user typed, entirely locally. Unlike Signal Mode this may
// match titles and organization names too, since the user asked for them by name.
import type { HighlightRegistryLike } from "./signalHighlighter";
import { findProfileContentRoots } from "./profileAdapter";
import { DEFAULT_KEYWORD_HIGHLIGHT_COLOR, HIGHLIGHT_SHADES, type HighlightColor } from "./highlightPalette";

export const KEYWORD_HIGHLIGHT = "linkwise-keyword";
const STYLE_ID = "lw-keyword-style";
// The dotted underline keeps keywords distinct from Signal highlights even in the same color.
function stylesFor(color: HighlightColor): string {
  const { fill, mark } = HIGHLIGHT_SHADES[color];
  return `::highlight(${KEYWORD_HIGHLIGHT}) {
  background-color: ${fill};
  text-decoration: underline dotted 2px ${mark};
  text-underline-offset: 3px;
}`;
}
const SKIPPED_ANCESTORS = "button, svg, script, style, nav, header, aside, footer, .visually-hidden, [data-lw-ignore]";

export function parseKeywords(input: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const part of input.split(/[,\n]/)) {
    const keyword = part.trim().replace(/\s+/g, " ");
    const key = normalize(keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }
  return keywords;
}

function normalizeChar(ch: string): string {
  if (/[‐-―−]/.test(ch)) return "-";
  if (/[‘’‛]/.test(ch)) return "'";
  if (/[“”]/.test(ch)) return '"';
  return ch.toLowerCase();
}

function normalize(text: string): string {
  return Array.from(text.trim().replace(/\s+/g, " "), normalizeChar).join("");
}

interface TextIndex {
  text: string;
  positions: ({ node: Text; offset: number } | null)[];
}

// Page text with whitespace collapsed to single spaces, and a space between separate text nodes
// so words in neighboring elements never run together.
function buildIndex(root: Element): TextIndex {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  const positions: TextIndex["positions"] = [];
  const space = () => {
    if (text.length > 0 && !text.endsWith(" ")) {
      text += " ";
      positions.push(null);
    }
  };
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!node.parentElement || node.parentElement.closest(SKIPPED_ANCESTORS)) continue;
    space();
    const data = node.data;
    for (let i = 0; i < data.length; i++) {
      if (/\s/.test(data[i]!)) {
        space();
        continue;
      }
      text += normalizeChar(data[i]!);
      positions.push({ node, offset: i });
    }
  }
  return { text, positions };
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

function matchesIn(index: TextIndex, keyword: string): Range[] {
  const needle = normalize(keyword);
  const ranges: Range[] = [];
  for (let at = index.text.indexOf(needle); at !== -1; at = index.text.indexOf(needle, at + 1)) {
    const end = at + needle.length;
    if (isWordChar(needle[0]) && isWordChar(index.text[at - 1])) continue;
    if (isWordChar(needle[needle.length - 1]) && isWordChar(index.text[end])) continue;
    const first = index.positions[at];
    const last = index.positions[end - 1];
    if (!first || !last) continue;
    const range = first.node.ownerDocument.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset + 1);
    ranges.push(range);
  }
  return ranges;
}

export function locateKeywords(doc: Document, keywords: string[]): Range[] {
  if (keywords.length === 0) return [];
  const indexes = findProfileContentRoots(doc).map(buildIndex);
  return keywords.flatMap((keyword) => indexes.flatMap((index) => matchesIn(index, keyword)));
}

function defaultRegistry(): HighlightRegistryLike | null {
  return typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
}

function defaultFactory(ranges: Range[]): Highlight {
  const highlight = new Highlight(...ranges);
  highlight.priority = 2;
  return highlight;
}

// Uses the CSS Custom Highlight API like Signal Mode, so overlapping highlights layer on the same
// text without wrapping or changing any of LinkedIn's markup.
export class KeywordHighlighter {
  private color: HighlightColor = DEFAULT_KEYWORD_HIGHLIGHT_COLOR;

  constructor(
    private readonly doc: Document,
    private readonly registry: HighlightRegistryLike | null = defaultRegistry(),
    private readonly createHighlight: (ranges: Range[]) => Highlight = defaultFactory,
  ) {}

  render(keywords: string[]): number {
    if (!this.registry) return 0;
    const ranges = locateKeywords(this.doc, keywords);
    if (ranges.length === 0) {
      this.registry.delete(KEYWORD_HIGHLIGHT);
      return 0;
    }
    this.ensureStyles();
    this.registry.set(KEYWORD_HIGHLIGHT, this.createHighlight(ranges));
    return ranges.length;
  }

  clear(): void {
    this.registry?.delete(KEYWORD_HIGHLIGHT);
  }

  // Restyles existing matches in place; nothing is located again.
  setColor(color: HighlightColor): void {
    if (color === this.color) return;
    this.color = color;
    const style = this.doc.getElementById(STYLE_ID);
    if (style) style.textContent = stylesFor(color);
  }

  private ensureStyles(): void {
    if (this.doc.getElementById(STYLE_ID)) return;
    const style = this.doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = stylesFor(this.color);
    this.doc.head.appendChild(style);
  }
}
