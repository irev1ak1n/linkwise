// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { METRIC_HIGHLIGHT, QUOTE_HIGHLIGHT, SignalHighlighter, type HighlightRegistryLike } from "./signalHighlighter";
import type { SignalTarget } from "./signalRanges";

interface FakeHighlight {
  ranges: Range[];
  priority: number;
}

function fakeRegistry() {
  const entries = new Map<string, FakeHighlight>();
  const registry: HighlightRegistryLike = {
    set: vi.fn((name: string, h: Highlight) => entries.set(name, h as unknown as FakeHighlight)),
    delete: vi.fn((name: string) => entries.delete(name)),
  };
  return { registry, entries };
}

const factory = (ranges: Range[], priority: number) => ({ ranges, priority }) as unknown as Highlight;

const EXPERIENCE = `<section><h2>Experience</h2><p><span>• Led a 4-person web team<br>• Reached 300+ visitors</span></p></section>`;

function setPage(experience = EXPERIENCE): void {
  document.head.innerHTML = "";
  document.body.innerHTML = `<main role="main"><section><h1>Jordan</h1></section>${experience}</main>`;
}

const targets: SignalTarget[] = [
  { key: "a", section: "experience", quote: "Led a 4-person web team", metrics: ["4-person"] },
  { key: "b", section: "experience", quote: "Reached 300+ visitors", metrics: ["300+"] },
];

describe("SignalHighlighter", () => {
  beforeEach(() => setPage());

  it("registers quote and metric highlights without touching profile markup", () => {
    const { registry, entries } = fakeRegistry();
    const before = document.querySelector("main")!.innerHTML;
    expect(new SignalHighlighter(document, registry, factory).render(targets)).toBe(2);
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges.map((r) => r.toString())).toEqual(["Led a 4-person web team", "Reached 300+ visitors"]);
    expect(entries.get(METRIC_HIGHLIGHT)!.ranges.map((r) => r.toString())).toEqual(["4-person", "300+"]);
    expect(entries.get(METRIC_HIGHLIGHT)!.priority).toBeGreaterThan(entries.get(QUOTE_HIGHLIGHT)!.priority);
    expect(document.querySelector("main")!.innerHTML).toBe(before);
  });

  it("does not re-register or duplicate on repeated renders", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    for (let i = 0; i < 5; i++) highlighter.render(targets);
    expect(registry.set).toHaveBeenCalledTimes(2);
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges).toHaveLength(2);
    expect(document.querySelectorAll("#lw-signal-style")).toHaveLength(1);
  });

  it("removes every highlight when cleared", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    highlighter.render(targets);
    highlighter.clear();
    expect(entries.size).toBe(0);
  });

  it("reapplies when LinkedIn replaces the section nodes", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    highlighter.render(targets);
    setPage();
    highlighter.render(targets);
    const range = entries.get(QUOTE_HIGHLIGHT)!.ranges[0]!;
    expect(range.startContainer.isConnected).toBe(true);
    expect(range.toString()).toBe("Led a 4-person web team");
  });

  it("keeps looking for targets whose section has not rendered yet", () => {
    setPage("");
    const { registry } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    expect(highlighter.render(targets)).toBe(0);
    setPage();
    expect(highlighter.render(targets)).toBe(2);
  });

  it("does nothing when the browser has no highlight registry", () => {
    expect(new SignalHighlighter(document, null, factory).render(targets)).toBe(0);
  });
});
