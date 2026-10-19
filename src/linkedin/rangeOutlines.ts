// Dashed outlines and left borders for highlighted phrases. The CSS Custom Highlight API draws
// backgrounds, text color, and underlines, but not borders, so these two looks are drawn here: a
// fixed, click-through layer of boxes placed over each range's line boxes. LinkedIn's markup is
// never touched, and nothing here locates text or asks for anything; it only follows ranges the
// highlighters already found as the page scrolls and reflows.
import type { HighlightOutline } from "./highlightPalette";

// Just below the LinkWise panel (2147483646), so outlines never draw over it.
const Z_INDEX = "2147483645";
const REFLOW_CHECK_MS = 400;

interface Layer {
  ranges: Range[];
  outline: HighlightOutline;
}

export class RangeOutlines {
  private readonly layers = new Map<string, Layer>();
  private root: HTMLElement | null = null;
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly schedule = () => {
    if (this.frame) return;
    const win = this.doc.defaultView;
    this.frame = win ? win.requestAnimationFrame(() => this.draw()) : 0;
  };

  constructor(
    private readonly doc: Document,
    private readonly id: string,
  ) {}

  /** The ranges of one style layer and how they are outlined; null outline removes the layer. */
  set(key: string, ranges: Range[], outline: HighlightOutline | null): void {
    if (outline && ranges.length > 0) this.layers.set(key, { ranges, outline });
    else this.layers.delete(key);
    this.sync();
  }

  clear(): void {
    this.layers.clear();
    this.sync();
  }

  private sync(): void {
    const win = this.doc.defaultView;
    if (this.layers.size === 0) {
      this.root?.remove();
      this.root = null;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      win?.removeEventListener("scroll", this.schedule, true);
      win?.removeEventListener("resize", this.schedule);
      return;
    }
    if (!this.root) {
      const root = this.doc.createElement("div");
      root.id = this.id;
      root.setAttribute("aria-hidden", "true");
      root.setAttribute("data-lw-ignore", "");
      Object.assign(root.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: Z_INDEX, overflow: "hidden" });
      this.doc.body.appendChild(root);
      this.root = root;
      // LinkedIn scrolls inside its own containers too, hence capture.
      win?.addEventListener("scroll", this.schedule, { capture: true, passive: true });
      win?.addEventListener("resize", this.schedule);
      // "See more" and lazy sections move text without scrolling anything.
      this.timer = setInterval(this.schedule, REFLOW_CHECK_MS);
    }
    this.schedule();
  }

  private draw(): void {
    this.frame = 0;
    const root = this.root;
    if (!root) return;
    // Outlines stop under LinkedIn's sticky top bar instead of drawing over it.
    const top = this.doc.getElementById("global-nav")?.getBoundingClientRect().bottom ?? 0;
    const boxes: HTMLElement[] = [];
    for (const { ranges, outline } of this.layers.values()) {
      for (const range of ranges) {
        if (!range.startContainer.isConnected || typeof range.getClientRects !== "function") continue;
        const rects = uniqueRects(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0 && r.bottom > top);
        if (outline.kind === "left") {
          const first = rects[0];
          if (first) boxes.push(box(this.doc, { left: first.left - 5, top: first.top + 1, width: 3, height: first.height - 2 }, { background: outline.color, borderRadius: "2px" }));
        } else {
          for (const r of rects) {
            boxes.push(box(this.doc, { left: r.left - 2, top: r.top - 1, width: r.width + 4, height: r.height + 2 }, { border: `1.5px dashed ${outline.color}`, borderRadius: "4px" }));
          }
        }
      }
    }
    root.replaceChildren(...boxes);
  }
}

function box(doc: Document, at: { left: number; top: number; width: number; height: number }, look: Partial<CSSStyleDeclaration>): HTMLElement {
  const el = doc.createElement("div");
  Object.assign(el.style, { position: "absolute", boxSizing: "border-box", left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, height: `${at.height}px`, ...look });
  return el;
}

// A range across nested inline elements reports the same line box more than once.
function uniqueRects(list: DOMRectList): DOMRect[] {
  const seen = new Set<string>();
  return [...list].filter((r) => {
    const key = `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
