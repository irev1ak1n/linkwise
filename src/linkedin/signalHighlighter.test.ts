// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignalHighlighter, highlightName, signalStyles, type HighlightRegistryLike } from "./signalHighlighter";
import type { SignalTarget } from "./signalRanges";
import { HIGHLIGHT_LOOKS, HIGHLIGHT_SHADES, type HighlightLook } from "./highlightPalette";
import type { RangeOutlines } from "./rangeOutlines";
import { HIGHLIGHT_CATEGORIES, DEFAULT_HIGHLIGHT_PREFERENCES, type HighlightPreferences } from "../signals/highlightCategories";

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

  it("restyles colors and looks in place, without locating or registering anything again", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    highlighter.render(targets);
    const ranges = entries.get(highlightName("leadership"))!.ranges;
    const before = document.querySelector("main")!.innerHTML;
    const style = () => document.getElementById("lw-signal-style")!.textContent!;
    expect(style()).toContain(`::highlight(linkwise-signal-leadership) { background-color: ${HIGHLIGHT_SHADES.purple.fill}; text-decoration: none; }`);

    highlighter.setPreferences(withStyle({ leadership: { enabled: true, color: "yellow", look: "underline" } }));
    expect(style()).toMatch(/::highlight\(linkwise-signal-leadership\) \{ background-color: transparent; text-decoration: underline 2px rgba\(/);
    highlighter.render(targets);
    expect(registry.set).toHaveBeenCalledTimes(4);
    expect(entries.get(highlightName("leadership"))!.ranges).toBe(ranges);
    expect(document.querySelector("main")!.innerHTML).toBe(before);
  });

  it("uses the chosen styles for highlights drawn after a change", () => {
    const { registry } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    highlighter.setPreferences(withStyle({ impact: { enabled: true, color: "pink", look: "solid" } }));
    highlighter.render(targets);
    expect(document.getElementById("lw-signal-style")!.textContent).toContain(HIGHLIGHT_SHADES.pink.fill);
  });

  it("restyles drawn highlights in place with a custom color and opacity, locating nothing again", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new SignalHighlighter(document, registry, factory);
    highlighter.render(targets);
    const before = [...entries.values()].map((e) => e.ranges);
    highlighter.setPreferences(withStyle({ impact: { enabled: true, color: "green", look: "solid", custom: { hex: "#FACC15", opacity: 0.35 } } }));
    const css = document.getElementById("lw-signal-style")!.textContent!;
    expect(css).toContain("linkwise-signal-impact) { background-color: rgba(250, 204, 21, 0.35);");
    expect([...entries.values()].map((e) => e.ranges)).toEqual(before);
  });

  it.each(HIGHLIGHT_CATEGORIES)("restyles %s on the page from its own custom color only", (category) => {
    const css = signalStyles(withStyle({ [category]: { ...DEFAULT_HIGHLIGHT_PREFERENCES.categories[category], custom: { hex: "#A855F7", opacity: 0.45 } } }));
    const rules = css.split("\n");
    expect(rules.filter((r) => r.includes("rgba(168, 85, 247, 0.45)"))).toEqual([expect.stringContaining(`linkwise-signal-${category})`)]);
  });

  it("styles every category, all Solid by default", () => {
    const css = signalStyles(DEFAULT_HIGHLIGHT_PREFERENCES);
    expect(css.match(/::highlight\(/g)).toHaveLength(9);
    expect(css).toMatch(/linkwise-signal-numbers\) \{ background-color: rgba\(0, 191, 165, 0\.22\); text-decoration: none/);
    expect(css).toMatch(/linkwise-signal-roles\) \{ background-color: rgba\(10, 102, 194, 0\.14\); text-decoration: none/);
  });

  it("draws each look with ::highlight() where it can, and borders with the overlay", () => {
    const custom = { hex: "#F59AC1", opacity: 0.5 };
    const rule = (look: HighlightLook) => signalStyles(withStyle({ skills: { enabled: true, color: "sky", look, custom } })).split("\n").find((r) => r.includes("signal-skills)"))!;
    expect(rule("solid")).toContain("background-color: rgba(245, 154, 193, 0.5); text-decoration: none;");
    expect(rule("soft")).toContain("background-color: rgba(245, 154, 193, 0.2); text-decoration: none;");
    expect(rule("underline")).toMatch(/background-color: transparent; text-decoration: underline 2px rgba\(\d+, \d+, \d+, 0\.8\); text-underline-offset: 1px;/);
    // Text Color darkens a light color until it reads on white.
    expect(rule("text")).toMatch(/background-color: transparent; color: #[0-9A-F]{6}; text-decoration: none;/);
    expect(rule("dashed")).toContain("background-color: rgba(245, 154, 193, 0.08);");
    expect(rule("left-border")).toContain("background-color: transparent; text-decoration: none;");
    // Never CSS opacity: that would fade the text too.
    for (const look of HIGHLIGHT_LOOKS) expect(rule(look)).not.toMatch(/(^|[ ;{])opacity:/);
  });

  it("outlines Dashed and Left Border ranges in an overlay, and removes it when the look changes back", () => {
    const { registry } = fakeRegistry();
    const set = vi.fn();
    const clear = vi.fn();
    const outlines = { set, clear } as unknown as RangeOutlines;
    const highlighter = new SignalHighlighter(document, registry, factory, outlines);
    highlighter.setPreferences(withStyle({ leadership: { enabled: true, color: "purple", look: "dashed" } }));
    highlighter.render(targets);
    const last = (layer: string) => set.mock.calls.filter((c) => c[0] === layer).at(-1)!;
    expect(last("leadership")[1].length).toBeGreaterThan(0);
    expect(last("leadership")[2]).toMatchObject({ kind: "dashed" });
    expect(last("roles")[2]).toBeNull();
    highlighter.setPreferences(withStyle({ leadership: { enabled: true, color: "purple", look: "left-border" } }));
    expect(last("leadership")[2]).toMatchObject({ kind: "left" });
    highlighter.setPreferences(withStyle({ leadership: { enabled: true, color: "purple", look: "soft" } }));
    expect(last("leadership")[2]).toBeNull();
    highlighter.clear();
    expect(clear).toHaveBeenCalled();
  });

  it("does nothing when the browser has no highlight registry", () => {
    expect(new SignalHighlighter(document, null, factory).render(targets)).toBe(0);
  });
});
