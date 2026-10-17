// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { KeyEvidence, KEY_EVIDENCE_SHOWN } from "./KeyEvidence";
import type { SignalAnalysisState } from "../../ai/signalAnalysisController";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

function render(analysis: SignalAnalysisState, exclude: string[] = []) {
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root!.render(<KeyEvidence analysis={analysis} exclude={exclude} />));
}

afterEach(() => act(() => root?.unmount()));

const facts = ["Represented 40,000+ student-athletes", "Selected for a teen academy", "Managed nonprofit volunteers", "Supported energy projects", "Earned an Excel certification", "Co-led a youth council", "Ranked first on a leaderboard"].map((text, i) => ({ text, evidenceId: `experience:${i}` }));
const ready = (list = facts): SignalAnalysisState => ({ status: "ready", profileKey: "jordan", highlights: [], facts: list });

describe("KeyEvidence", () => {
  it("lists the analysis's facts in their ranked order, a few at a time", () => {
    render(ready());
    expect(container.querySelector(".lw-dash__label")!.textContent).toBe("Key evidence");
    expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual(facts.slice(0, KEY_EVIDENCE_SHOWN).map((f) => f.text));
    expect(KEY_EVIDENCE_SHOWN).toBeGreaterThanOrEqual(4);
    expect(KEY_EVIDENCE_SHOWN).toBeLessThanOrEqual(6);
    const more = [...container.querySelectorAll("button")].find((b) => b.textContent === `Show ${facts.length - KEY_EVIDENCE_SHOWN} more`)!;
    act(() => more.click());
    expect(container.querySelectorAll("li")).toHaveLength(facts.length);
    expect(container.textContent).not.toContain("more");
  });

  it("never repeats a sentence already shown under Why they match", () => {
    render(ready(), ["Selected for a teen academy."]);
    expect(container.textContent).not.toContain("Selected for a teen academy");
  });

  it("shows nothing when the profile has no facts, and says so while loading or unavailable", () => {
    render(ready([]));
    expect(container.querySelector('[aria-label="Key evidence"]')).toBeNull();
    render({ status: "loading" });
    expect(container.textContent).toContain("Finding key evidence…");
    render({ status: "unavailable", reason: "not_configured" });
    expect(container.textContent).toContain("Key evidence is unavailable right now");
  });

  it("never uses the old Signal Mode wording", () => {
    render(ready());
    expect(container.textContent).not.toMatch(/High-signal|Signal facts/i);
  });
});
