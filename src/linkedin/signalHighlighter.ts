import { compactText, locateSignals, type SignalTarget } from "./signalRanges";
import { highlightCss, highlightDeclarations } from "./highlightPalette";
import { DEFAULT_HIGHLIGHT_PREFERENCES, GENERAL_STYLE, STYLE_LAYERS, type HighlightPreferences, type StyleLayer } from "../signals/highlightCategories";

export const QUOTE_HIGHLIGHT = "linkwise-signal";
const STYLE_ID = "lw-signal-style";
const DEFAULT_LAYER: StyleLayer = "general";

/** One CSS highlight per style layer, so each can be restyled alone and nothing is ever nested. */
export function highlightName(category: StyleLayer): string {
  return `${QUOTE_HIGHLIGHT}-${category}`;
}

// Numbers and skills mark words inside a phrase, so they sit on top of it: their own fill over the
// phrase's reads as their color, and an underline (when on) keeps them legible either way.
export function signalStyles(prefs: HighlightPreferences): string {
  return STYLE_LAYERS.map((category) => {
    const style = category === "general" ? GENERAL_STYLE : prefs.categories[category];
    return `::highlight(${highlightName(category)}) { ${highlightCss(highlightDeclarations(style))} }`;
  }).join("\n");
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

const toCategory = (layer: string | undefined): StyleLayer => STYLE_LAYERS.find((c) => c === layer) ?? DEFAULT_LAYER;

export class SignalHighlighter {
  private applied: Applied | null = null;
  private prefs: HighlightPreferences = DEFAULT_HIGHLIGHT_PREFERENCES;
  private readonly registered = new Set<string>();

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
    const layers = new Map<StyleLayer, Range[]>();
    const add = (category: StyleLayer, ranges: Range[]) => {
      if (ranges.length > 0) layers.set(category, [...(layers.get(category) ?? []), ...ranges]);
    };
    for (const target of targets) {
      const found = located.get(target.key);
      if (!found) continue;
      add(toCategory(target.layer), [found.quote]);
      add("numbers", found.metrics);
      add("skills", found.skills);
    }
    this.ensureStyles();
    for (const name of this.registered) if (![...layers.keys()].some((c) => highlightName(c) === name)) this.registry.delete(name);
    this.registered.clear();
    for (const [category, ranges] of layers) {
      const mark = category === "numbers" || category === "skills";
      this.registry.set(highlightName(category), this.createHighlight(ranges, mark ? 1 : 0));
      this.registered.add(highlightName(category));
    }

    // The count is of signals, not of drawn ranges: a claim's supporting clause or a number marked
    // inside it is part of that one signal.
    const count = targets.filter((t) => t.counted !== false && located.has(t.key)).length;
    this.applied = {
      fingerprint,
      ranges: [...layers.values()].flat().map((range) => ({ range, expected: compactText(range.toString()) })),
      complete: located.size === targets.length,
      count,
    };
    return count;
  }

  // Only restyles the existing highlights: nothing is located, requested, or re-rendered.
  setPreferences(prefs: HighlightPreferences): void {
    this.prefs = prefs;
    const style = this.doc.getElementById(STYLE_ID);
    if (style) style.textContent = signalStyles(prefs);
  }

  clear(): void {
    for (const name of this.registered) this.registry?.delete(name);
    this.registered.clear();
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
    style.textContent = signalStyles(this.prefs);
    this.doc.head.appendChild(style);
  }
}
