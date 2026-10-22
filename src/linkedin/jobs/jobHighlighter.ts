// Marks useful phrases inside the open job posting with the CSS Custom Highlight API: the page's own
// markup is never touched, so a highlight is only a registry entry that can be cleared or redrawn at
// any time. Colors live in one table so they can be redesigned without touching the logic.
import { compactText } from "../signalRanges";

export type JobHighlightCategory = "salary" | "responsibility" | "required" | "preferred" | "skill" | "education" | "experience" | "authorization" | "location" | "benefit" | "restriction";

export interface JobHighlightTarget {
  category: JobHighlightCategory;
  /** Words of the posting to mark (matched ignoring spacing and case). */
  quote: string;
}

export const JOB_HIGHLIGHT_STYLES: Record<JobHighlightCategory, string> = {
  salary: "rgba(34, 197, 94, 0.30)",
  responsibility: "rgba(59, 130, 246, 0.22)",
  required: "rgba(249, 115, 22, 0.26)",
  preferred: "rgba(234, 179, 8, 0.30)",
  skill: "rgba(168, 85, 247, 0.26)",
  education: "rgba(20, 184, 166, 0.26)",
  experience: "rgba(20, 184, 166, 0.20)",
  authorization: "rgba(239, 68, 68, 0.28)",
  location: "rgba(6, 182, 212, 0.26)",
  benefit: "rgba(132, 204, 22, 0.28)",
  restriction: "rgba(239, 68, 68, 0.22)",
};

const STYLE_ID = "lw-job-highlight-style";
const MAX_QUOTE = 280;
const SKIPPED = "button, svg, script, style, [data-lw-ignore], [aria-hidden='true']";

export const jobHighlightName = (category: JobHighlightCategory) => `linkwise-job-${category}`;

export interface HighlightRegistryLike {
  set(name: string, highlight: Highlight): unknown;
  delete(name: string): boolean;
}

interface TextIndex {
  text: string;
  nodes: { node: Text; offset: number }[];
}

function buildIndex(roots: Element[]): TextIndex {
  let text = "";
  const nodes: TextIndex["nodes"] = [];
  for (const root of roots) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (node.parentElement?.closest(SKIPPED)) continue;
      for (let i = 0; i < node.data.length; i++) {
        const compact = compactText(node.data[i]!);
        if (!compact) continue;
        text += compact;
        nodes.push({ node, offset: i });
      }
    }
  }
  return { text, nodes };
}

export function locateQuote(index: TextIndex, quote: string): Range | null {
  const needle = compactText(quote);
  if (needle.length < 4 || quote.length > MAX_QUOTE) return null;
  const at = index.text.indexOf(needle);
  if (at === -1) return null;
  const first = index.nodes[at]!;
  const last = index.nodes[at + needle.length - 1]!;
  const range = first.node.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

function defaultRegistry(): HighlightRegistryLike | null {
  return typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
}

export class JobHighlighter {
  private applied: { fingerprint: string; ranges: { range: Range; expected: string }[] } | null = null;
  private readonly registered = new Set<string>();

  constructor(
    private readonly doc: Document,
    private readonly registry: HighlightRegistryLike | null = defaultRegistry(),
    private readonly createHighlight: (ranges: Range[]) => Highlight = (ranges) => new Highlight(...ranges),
  ) {}

  /** Draws the targets inside root and returns how many were found. Redrawing an unchanged page does nothing. */
  render(roots: Element | Element[], targets: JobHighlightTarget[]): number {
    if (!this.registry) return 0;
    const fingerprint = JSON.stringify(targets);
    if (this.applied?.fingerprint === fingerprint && this.stillValid()) return this.applied.ranges.length;
    this.clear();
    if (targets.length === 0) return 0;
    const index = buildIndex(Array.isArray(roots) ? roots : [roots]);
    const byCategory = new Map<JobHighlightCategory, Range[]>();
    const placed: { range: Range; expected: string }[] = [];
    for (const target of targets) {
      const range = locateQuote(index, target.quote);
      if (!range) continue;
      byCategory.set(target.category, [...(byCategory.get(target.category) ?? []), range]);
      placed.push({ range, expected: compactText(range.toString()) });
    }
    this.ensureStyles();
    for (const [category, ranges] of byCategory) {
      this.registry.set(jobHighlightName(category), this.createHighlight(ranges));
      this.registered.add(jobHighlightName(category));
    }
    this.applied = { fingerprint, ranges: placed };
    return placed.length;
  }

  /** Whether the drawn ranges still sit on the text they were found on; LinkedIn re-renders swap it out. */
  stillValid(): boolean {
    return !!this.applied && this.applied.ranges.every(({ range, expected }) => range.startContainer.isConnected && range.endContainer.isConnected && compactText(range.toString()) === expected);
  }

  clear(): void {
    for (const name of this.registered) this.registry?.delete(name);
    this.registered.clear();
    this.applied = null;
  }

  private ensureStyles(): void {
    if (this.doc.getElementById(STYLE_ID)) return;
    const style = this.doc.createElement("style");
    style.id = STYLE_ID;
    style.setAttribute("data-lw-ignore", "");
    style.textContent = (Object.keys(JOB_HIGHLIGHT_STYLES) as JobHighlightCategory[]).map((c) => `::highlight(${jobHighlightName(c)}) { background-color: ${JOB_HIGHLIGHT_STYLES[c]}; }`).join("\n");
    (this.doc.head ?? this.doc.documentElement).appendChild(style);
  }
}
