import { describe, expect, it, vi } from "vitest";
import { createPersistentCache } from "../ai/persistentCache";
import { buildSectionRequest, loadSectionAnalysis, sectionCacheKey } from "./sectionAnalysis";
import type { OptimizeProfileRequestBody } from "./optimizerClient";
import type { SectionAnalysisDTO, SectionAnalysisOutcome } from "./optimizerTypes";

const body = (headline: string, userContext = ""): OptimizeProfileRequestBody => ({
  profile: { identity: "me", evidence: [{ id: "headline:0", section: "headline", text: headline, evidenceType: "headline" }] },
  sections: [
    { section: "headline", present: true, itemCount: null, evidenceIds: ["headline:0"] },
    { section: "banner", present: false, itemCount: null, evidenceIds: [] },
  ],
  userContext,
});

const analysis: SectionAnalysisDTO = { state: "improve", summary: "Your headline is short.", findings: [], ideas: [] };

function harness() {
  const cache = createPersistentCache<SectionAnalysisDTO>(`test.section.${Math.random()}`, 60000, 10);
  const send = vi.fn(() => ({ requestId: "r", promise: Promise.resolve<SectionAnalysisOutcome>({ status: "ok", analysis }), cancel: vi.fn() }));
  return { cache, send };
}

describe("section analysis cache", () => {
  it("takes presence from the section map", () => {
    expect(buildSectionRequest("banner", body("x")).present).toBe(false);
    expect(buildSectionRequest("headline", body("x")).present).toBe(true);
  });

  it("asks once for an unchanged profile, even when opened repeatedly", async () => {
    const { cache, send } = harness();
    const request = buildSectionRequest("headline", body("Student developer"));
    const [first, second] = await Promise.all([loadSectionAnalysis(request, send, cache), loadSectionAnalysis(request, send, cache)]);
    await loadSectionAnalysis(request, send, cache);
    expect(send).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ status: "ok", analysis });
    expect(second).toEqual(first);
  });

  it("asks again when the evidence or the user's context changes", async () => {
    const { cache, send } = harness();
    await loadSectionAnalysis(buildSectionRequest("headline", body("Student developer")), send, cache);
    await loadSectionAnalysis(buildSectionRequest("headline", body("Web developer")), send, cache);
    await loadSectionAnalysis(buildSectionRequest("headline", body("Web developer", "I know Rust")), send, cache);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("keys sections apart", () => {
    expect(sectionCacheKey(buildSectionRequest("headline", body("x")))).not.toBe(sectionCacheKey(buildSectionRequest("banner", body("x"))));
  });

  it("doesn't cache failures", async () => {
    const { cache } = harness();
    const failing = vi.fn(() => ({ requestId: "r", promise: Promise.resolve<SectionAnalysisOutcome>({ status: "unavailable", reason: "timeout" }), cancel: vi.fn() }));
    const request = buildSectionRequest("headline", body("x"));
    await loadSectionAnalysis(request, failing, cache);
    await loadSectionAnalysis(request, failing, cache);
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
