// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignalHighlighter, highlightName, signalStyles, type HighlightRegistryLike } from "./signalHighlighter";
import type { SignalTarget } from "./signalRanges";
import { HIGHLIGHT_SHADES } from "./highlightPalette";
import { DEFAULT_HIGHLIGHT_PREFERENCES, type HighlightPreferences } from "../signals/highlightCategories";

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

const EXPERIENCE = `<section><h2>Experience</h2><p><span>• Led a 4-person web team in React<br>• Reached 300+ visitors</span></p></section>`;

function setPage(experience = EXPERIENCE): void {
  document.head.innerHTML = "";
  document.body.innerHTML = `<main role="main"><section><h1>Jordan</h1></section>${experience}</main>`;
}

const targets: SignalTarget[] = [
  { key: "a", section: "experience", quote: "Led a 4-person web team in React", metrics: ["4-person"], skills: ["React"], layer: "leadership" },
  { key: "b", section: "experience", quote: "Reached 300+ visitors", metrics: ["300+"], layer: "impact" },
];
const texts = (h: FakeHighlight | undefined) => (h?.ranges ?? []).map((r) => r.toString());
const withStyle = (patch: Partial<HighlightPreferences["categories"]>): HighlightPreferences => ({ ...DEFAULT_HIGHLIGHT_PREFERENCES, categories: { ...DEFAULT_HIGHLIGHT_PREFERENCES.categories, ...patch } });

describe("SignalHighlighter", () => {
  beforeEach(() => setPage());

  it("registers one highlight per category, marks on top of phrases, without touching profile markup", () => {
    const { registry, entries } = fakeRegistry();
    const before = document.querySelector("main")!.innerHTML;
    expect(new SignalHighlighter(document, registry, factory).render(targets)).toBe(2);
    expect(texts(entries.get(highlightName("leadership")))).toEqual(["Led a 4-person web team in React"]);
    expect(texts(entries.get(highlightName("impact")))).toEqual(["Reached 300+ visitors"]);
    expect(texts(entries.get(highlightName("numbers")))).toEqual(["4-person", "300+"]);
    expect(texts(entries.get(highlightName("skills")))).toEqual(["React"]);
    expect(entries.get(highlightName("numbers"))!.priority).toBeGreaterThan(entries.get(highlightName("impact"))!.priority);
    // Ranges, not wrapper elements: nothing is ever nested in LinkedIn's markup.
    expect(document.querySelector("main")!.innerHTML).toBe(before);
  });

  it("does not re-register or duplicate on repeated renders", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    for (let i = 0; i < 5; i++) highlighter.render(targets);
    expect(registry.set).toHaveBeenCalledTimes(4);
    expect(entries.get(highlightName("numbers"))!.ranges).toHaveLength(2);
    expect(document.querySelectorAll("#lw-signal-style")).toHaveLength(1);
  });

  it("drops a category's highlight when it no longer has targets, and everything when cleared", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    highlighter.render(targets);
    highlighter.render([targets[1]!]);
    expect(entries.has(highlightName("leadership"))).toBe(false);
    expect(entries.has(highlightName("skills"))).toBe(false);
    expect(texts(entries.get(highlightName("numbers")))).toEqual(["300+"]);
    highlighter.clear();
    expect(entries.size).toBe(0);
  });

  it("reapplies when LinkedIn replaces the section nodes", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    highlighter.render(targets);
    setPage();
    highlighter.render(targets);
    const range = entries.get(highlightName("leadership"))!.ranges[0]!;
    expect(range.startContainer.isConnected).toBe(true);
    expect(range.toString()).toBe("Led a 4-person web team in React");
  });

  it("keeps looking for targets whose section has not rendered yet", () => {
    setPage("");
    const { registry } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    expect(highlighter.render(targets)).toBe(0);
    setPage();
    expect(highlighter.render(targets)).toBe(2);
  });

  it("restyles colors and underlines in place, without locating or registering anything again", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    highlighter.render(targets);
    const ranges = entries.get(highlightName("leadership"))!.ranges;
    const before = document.querySelector("main")!.innerHTML;
    const style = () => document.getElementById("lw-signal-style")!.textContent!;
    expect(style()).toContain(`::highlight(linkwise-signal-leadership) { background-color: ${HIGHLIGHT_SHADES.purple.fill}; text-decoration: none; }`);

    highlighter.setPreferences(withStyle({ leadership: { enabled: true, color: "yellow", underline: true } }));
    expect(style()).toContain(`::highlight(linkwise-signal-leadership) { background-color: ${HIGHLIGHT_SHADES.yellow.fill}; text-decoration: underline 2px ${HIGHLIGHT_SHADES.yellow.mark};`);
    highlighter.render(targets);
    expect(registry.set).toHaveBeenCalledTimes(4);
    expect(entries.get(highlightName("leadership"))!.ranges).toBe(ranges);
    expect(document.querySelector("main")!.innerHTML).toBe(before);
  });

  it("uses the chosen styles for highlights drawn after a change", () => {
    const { registry } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    highlighter.setPreferences(withStyle({ impact: { enabled: true, color: "pink", underline: false } }));
    highlighter.render(targets);
    expect(document.getElementById("lw-signal-style")!.textContent).toContain(HIGHLIGHT_SHADES.pink.fill);
  });

  it("restyles drawn highlights in place with a custom color and opacity, locating nothing again", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    highlighter.render(targets);
    const before = [...entries.values()].map((e) => e.ranges);
    highlighter.setPreferences(withStyle({ impact: { enabled: true, color: "green", underline: false, custom: { hex: "#FACC15", opacity: 0.35 } } }));
    const css = document.getElementById("lw-signal-style")!.textContent!;
    expect(css).toContain("linkwise-signal-impact) { background-color: rgba(250, 204, 21, 0.35);");
    expect([...entries.values()].map((e) => e.ranges)).toEqual(before);
  });

  it("styles every category, underlined only where asked", () => {
    const css = signalStyles(DEFAULT_HIGHLIGHT_PREFERENCES);
    expect(css.match(/::highlight\(/g)).toHaveLength(9);
    expect(css).toMatch(/linkwise-signal-numbers\) \{ background-color: [^;]+; text-decoration: underline/);
    expect(css).toMatch(/linkwise-signal-roles\) \{ background-color: [^;]+; text-decoration: none/);
  });

  it("does nothing when the browser has no highlight registry", () => {
    expect(new SignalHighlighter(document, null, factory).render(targets)).toBe(0);
  });
});
