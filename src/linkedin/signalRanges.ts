import { ALL_PROFILE_SECTIONS, type ProfileSectionName } from "../models/profile";
import { findProfileSectionRoot } from "./profileAdapter";

export interface SignalTarget {
  key: string;
  section: string;
  quote: string;
  metrics: string[];
}

export interface LocatedSignal {
  quote: Range;
  metrics: Range[];
}

const SKIPPED_ANCESTORS = "button, svg, script, style, .visually-hidden, [data-lw-ignore]";

function normalizeChar(ch: string): string {
  if (/[‐-―−]/.test(ch)) return "-";
  if (/[‘’‛]/.test(ch)) return "'";
  if (/[“”]/.test(ch)) return '"';
  return ch.toLowerCase();
}

export function compactText(text: string): string {
  let out = "";
  for (const ch of text) if (!/\s/.test(ch)) out += normalizeChar(ch);
  return out;
}

interface TextIndex {
  text: string;
  positions: { node: Text; offset: number }[];
}

function buildIndex(root: Element): TextIndex {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  const positions: TextIndex["positions"] = [];
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (node.parentElement?.closest(SKIPPED_ANCESTORS)) continue;
    const data = node.data;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]!;
      if (/\s/.test(ch)) continue;
      text += normalizeChar(ch);
      positions.push({ node, offset: i });
    }
  }
  return { text, positions };
}

function rangeFor(index: TextIndex, start: number, length: number): Range {
  const first = index.positions[start]!;
  const last = index.positions[start + length - 1]!;
  const range = first.node.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

function locateInIndex(index: TextIndex, target: SignalTarget): LocatedSignal | null {
  const quote = compactText(target.quote);
  if (quote.length === 0) return null;
  const start = index.text.indexOf(quote);
  if (start === -1) return null;

  const scope = index.text.slice(start, start + quote.length);
  const metrics: Range[] = [];
  for (const metric of target.metrics) {
    const needle = compactText(metric);
    const offset = needle ? scope.indexOf(needle) : -1;
    if (offset !== -1) metrics.push(rangeFor(index, start + offset, needle.length));
  }
  return { quote: rangeFor(index, start, quote.length), metrics };
}

export function locateSignals(doc: Document, targets: SignalTarget[]): Map<string, LocatedSignal> {
  const located = new Map<string, LocatedSignal>();
  const indexes = new Map<string, TextIndex | null>();
  for (const target of targets) {
    if (!indexes.has(target.section)) {
      const known = ALL_PROFILE_SECTIONS.includes(target.section as ProfileSectionName);
      const root = known ? findProfileSectionRoot(doc, target.section as ProfileSectionName) : null;
      indexes.set(target.section, root ? buildIndex(root) : null);
    }
    const index = indexes.get(target.section);
    const result = index ? locateInIndex(index, target) : null;
    if (result) located.set(target.key, result);
  }
  return located;
}
