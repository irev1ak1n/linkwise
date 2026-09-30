import { compactText, locateSignals, type SignalTarget } from "./signalRanges";
import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_SHADES, type HighlightColor } from "./highlightPalette";

export const QUOTE_HIGHLIGHT = "linkwise-signal";
export const METRIC_HIGHLIGHT = "linkwise-signal-metric";
const STYLE_ID = "lw-signal-style";

// The metric layer sits on top of its phrase, so the same fill twice reads as a deeper shade.
function stylesFor(color: HighlightColor): string {
  const { fill, mark } = HIGHLIGHT_SHADES[color];
  return `
  ::highlight(${QUOTE_HIGHLIGHT}) { background-color: ${fill}; }
  ::highlight(${METRIC_HIGHLIGHT}) {
    background-color: ${fill};
    text-decoration: underline 2px ${mark};
    text-underline-offset: 3px;
  }
`;
}

export interface HighlightRegistryLike {
  set(name: string, highlight: Highlight): unknown;
  delete(name: string): boolean;
}

type HighlightFactory = (ranges: Range[], priority: number) => Highlight;

function defaultRegistry(): HighlightRegistryLike | null {
  return typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
}

function defaultFactory(ranges: Range[], priority: number): Highlight {
  const highlight = new Highlight(...ranges);
  highlight.priority = priority;
  return highlight;
}

interface Applied {
  fingerprint: string;
  ranges: { range: Range; expected: string }[];
  complete: boolean;
  count: number;
}

export class SignalHighlighter {
  private applied: Applied | null = null;
  private color: HighlightColor = DEFAULT_HIGHLIGHT_COLOR;

  constructor(
    private readonly doc: Document,
    private readonly registry: HighlightRegistryLike | null = defaultRegistry(),
    private readonly createHighlight: HighlightFactory = defaultFactory,
  ) {}

  render(targets: SignalTarget[]): number {
    if (!this.registry) return 0;
    if (targets.length === 0) {
      this.clear();
      return 0;
    }

    const fingerprint = JSON.stringify(targets);
    if (this.applied?.fingerprint === fingerprint && this.applied.complete && this.stillValid(this.applied)) return this.applied.count;

    const located = locateSignals(this.doc, targets);
    const quoteRanges = [...located.values()].map((l) => l.quote);
    const metricRanges = [...located.values()].flatMap((l) => l.metrics);
    this.ensureStyles();
    this.registry.set(QUOTE_HIGHLIGHT, this.createHighlight(quoteRanges, 0));
    this.registry.set(METRIC_HIGHLIGHT, this.createHighlight(metricRanges, 1));

    this.applied = {
      fingerprint,
      ranges: [...quoteRanges, ...metricRanges].map((range) => ({ range, expected: compactText(range.toString()) })),
      complete: located.size === targets.length,
      count: located.size,
    };
    return located.size;
  }

  // Only restyles the existing highlights: nothing is located, requested, or re-rendered.
  setColor(color: HighlightColor): void {
    if (color === this.color) return;
    this.color = color;
    const style = this.doc.getElementById(STYLE_ID);
    if (style) style.textContent = stylesFor(color);
  }

  clear(): void {
    this.registry?.delete(QUOTE_HIGHLIGHT);
    this.registry?.delete(METRIC_HIGHLIGHT);
    this.applied = null;
  }

  private stillValid(applied: Applied): boolean {
    return applied.ranges.every(
      ({ range, expected }) => range.startContainer.isConnected && range.endContainer.isConnected && compactText(range.toString()) === expected,
    );
  }

  private ensureStyles(): void {
    if (this.doc.getElementById(STYLE_ID)) return;
    const style = this.doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = stylesFor(this.color);
    this.doc.head.appendChild(style);
  }
}
