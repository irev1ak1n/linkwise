// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { AboutGenerator } from "./AboutGenerator";
import { SectionPage, type SectionContext } from "./SectionPages";
import { getOptimizerPage, openOptimizerPage } from "./optimizerNav";
import { EMPTY_PROFILE } from "../models/profile";
import type { AboutGenerationRequestBody, OptimizeProfileRequestBody } from "./optimizerClient";
import type { AboutOption, AboutOptionsOutcome } from "./optimizerTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const body: OptimizeProfileRequestBody = { profile: { identity: "me", evidence: [{ id: "about:0", section: "about", text: "I build school websites.", evidenceType: "about" }] }, sections: [], userContext: "" };
const options = (tag: string): AboutOption[] => [
  { label: "Balanced", text: `${tag} one` },
  { label: "Impact", text: `${tag} two` },
];

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  openOptimizerPage({ name: "home" });
});

const button = () => container.querySelector<HTMLButtonElement>(".lw-primary-button")!;

describe("About generator", () => {
  it("generates, then generates again: every click is its own request with a new variation", async () => {
    const calls: AboutGenerationRequestBody[] = [];
    const resolvers: ((outcome: AboutOptionsOutcome) => void)[] = [];
    const request = vi.fn((payload: AboutGenerationRequestBody) => {
      calls.push(payload);
      return { requestId: `req_${calls.length}`, promise: new Promise<AboutOptionsOutcome>((resolve) => resolvers.push(resolve)), cancel: () => {} };
    });
    act(() => root.render(<AboutGenerator body={body} currentAbout="I build school websites." request={request} />));
    expect(container.textContent).toContain("I build school websites.");
    expect(container.textContent).not.toMatch(/Target role|Language|Additional context/);
    expect(button().textContent).toBe("Generate About");

    act(() => button().click());
    expect(button().textContent).toBe("Generating...");
    expect(button().disabled).toBe(true);
    // A second click while one is running does nothing.
    act(() => button().click());
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => resolvers[0]!({ status: "ok", options: options("First") }));
    expect(button().textContent).toBe("Generate again");
    expect(button().disabled).toBe(false);
    expect(container.textContent).toContain("First one");

    // Change an input and generate again: a new request, a new variation, and new options on screen.
    const include = container.querySelector<HTMLTextAreaElement>("textarea")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(include, "TSA leadership");
      include.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => Array.from(container.querySelectorAll<HTMLButtonElement>(".lw-gen-chip")).find((c) => c.textContent === "Impact-focused")!.click());
    act(() => button().click());
    expect(request).toHaveBeenCalledTimes(2);
    expect(calls[1]!.variation).toBe(calls[0]!.variation + 1);
    expect(calls[1]!.include).toBe("TSA leadership");
    expect(calls[1]!.style).toBe("impact");
    await act(async () => resolvers[1]!({ status: "ok", options: options("Second") }));
    expect(container.textContent).toContain("Second one");
    expect(container.textContent).not.toContain("First one");
    expect(button().disabled).toBe(false);

    // Even an unchanged third click asks again, and a failure leaves the button clickable.
    act(() => button().click());
    expect(request).toHaveBeenCalledTimes(3);
    expect(calls[2]!.variation).toBe(calls[1]!.variation + 1);
    await act(async () => resolvers[2]!({ status: "unavailable", reason: "timeout" }));
    expect(container.textContent).toContain("About options unavailable (timeout)");
    expect(button().disabled).toBe(false);
  });
});

describe("About style selector", () => {
  const chips = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".lw-gen-chip"));
  const active = () => chips().filter((c) => c.getAttribute("aria-checked") === "true").map((c) => c.textContent);

  it("is single-select, and one click on Generate sends one request carrying only the last style chosen", async () => {
    const calls: AboutGenerationRequestBody[] = [];
    const request = vi.fn((payload: AboutGenerationRequestBody) => {
      calls.push(payload);
      return { requestId: "r", promise: Promise.resolve<AboutOptionsOutcome>({ status: "ok", options: options("Only") }), cancel: () => {} };
    });
    act(() => root.render(<AboutGenerator body={body} currentAbout="" request={request} />));
    expect(active()).toHaveLength(1);
    const pick = (label: string) => act(() => chips().find((c) => c.textContent === label)!.click());
    pick("Balanced");
    expect(active()).toEqual(["Balanced"]);
    pick("Impact-focused");
    pick("Story");
    pick("Technical");
    expect(active()).toEqual(["Technical"]);
    expect(request).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>(".lw-primary-button")!.click());
    expect(request).toHaveBeenCalledTimes(1);
    expect(calls[0]!.style).toBe("technical");
  });

  it("sends each style as chosen, and uses the shared steering box wording and placeholder", async () => {
    const styles: Record<string, string> = { Mix: "all", Balanced: "balanced", "Impact-focused": "impact", Story: "story", Technical: "technical" };
    const sent: string[] = [];
    const request = vi.fn((payload: AboutGenerationRequestBody) => {
      sent.push(payload.style);
      return { requestId: "r", promise: Promise.resolve<AboutOptionsOutcome>({ status: "ok", options: options("x") }), cancel: () => {} };
    });
    act(() => root.render(<AboutGenerator body={body} currentAbout="" request={request} />));
    expect(container.textContent).toContain("Add anything you want the AI to consider when writing your About section.");
    expect(container.querySelector("textarea")!.placeholder).toBe("Achievements, experience, projects, leadership, goals, personality, or anything you want highlighted...");
    for (const [label, style] of Object.entries(styles)) {
      act(() => chips().find((c) => c.textContent === label)!.click());
      await act(async () => container.querySelector<HTMLButtonElement>(".lw-primary-button")!.click());
      expect(sent.at(-1)).toBe(style);
    }
    expect(sent).toHaveLength(5);
  });
});

describe("About section page", () => {
  const context = (): SectionContext => ({
    profileKey: "me",
    shell: { isOwnProfile: true, hasPhoto: true, hasBanner: true, sections: {} },
    profile: { ...EMPTY_PROFILE, headline: "Student", about: "I build school websites.", extracted: true },
    body: null,
    overall: [{ section: "about", state: "improve", impact: "high", reason: "", sourceType: "linkedin_profile", evidenceIds: [], suggestions: [] }],
  });

  it("opens the generator on its own page instead of drafting inline", () => {
    const html = renderToStaticMarkup(<SectionPage section="about" context={context()} />);
    expect(html).toContain("AI About writer");
    expect(html).toContain("Generate using AI");
    expect(html).not.toMatch(/Generate improved draft|AI draft/);
    act(() => root.render(<SectionPage section="about" context={context()} />));
    act(() => Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Generate using AI"))!.click());
    expect(getOptimizerPage()).toEqual({ name: "generate", section: "about" });
  });
});
