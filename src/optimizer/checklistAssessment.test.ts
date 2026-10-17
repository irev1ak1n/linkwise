import { describe, expect, it, vi } from "vitest";
import { createPersistentCache } from "../ai/persistentCache";
import { buildChecklistRequest, checklistCacheKey, loadChecklist, partialList, type ChecklistOutcome } from "./checklistAssessment";
import { semanticCriteria, type SemanticResult } from "./checklist";
import type { OptimizeProfileRequestBody } from "./optimizerClient";

const body = (about: string, userContext = "", experience = "Website Developer — School — Built the yearbook site"): OptimizeProfileRequestBody => ({
  profile: {
    identity: "me",
    evidence: [
      { id: "headline:0", section: "headline", text: "Aspiring Software Engineer", evidenceType: "headline" },
      { id: "about:0", section: "about", text: about, evidenceType: "about" },
      { id: "experience:0", section: "experience", text: experience, evidenceType: "experience" },
    ],
  },
  sections: [],
  userContext,
});

const results: SemanticResult[] = [{ criterionId: "about-who", status: "pass", explanation: "Your About section names software engineering.", evidenceIds: ["about:0"] }];

function harness() {
  const cache = createPersistentCache<SemanticResult[]>(`test.checklist.${Math.random()}`, 60000, 10);
  const send = vi.fn(() => ({ requestId: "r", promise: Promise.resolve<ChecklistOutcome>({ status: "ok", results }), cancel: vi.fn() }));
  return { cache, send };
}

describe("checklist requests", () => {
  it("asks about every semantic criterion of a section in one request", () => {
    const request = buildChecklistRequest("about", body("I study software."))!;
    expect(request.criteria.map((c) => c.id)).toEqual(semanticCriteria("about").map((c) => c.id));
    expect(request.criteria.length).toBeGreaterThan(1);
  });

  it("sends only the section's own evidence and what shows the person's direction", () => {
    const request = buildChecklistRequest("about", body("I study software."))!;
    expect(request.profile.evidence.map((e) => e.section)).toEqual(["headline", "about"]);
  });

  it("asks nothing for sections without AI criteria or without text", () => {
    expect(buildChecklistRequest("photo", body("x"))).toBeNull();
    expect(buildChecklistRequest("projects", body("x"))).toBeNull();
  });
});

describe("checklist cache", () => {
  it("makes no new request while the section's evidence is unchanged", async () => {
    const { cache, send } = harness();
    const request = buildChecklistRequest("about", body("I study software."))!;
    await Promise.all([loadChecklist(request, send, cache), loadChecklist(request, send, cache)]);
    await loadChecklist(buildChecklistRequest("about", body("I study software."))!, send, cache);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("makes no new request when moving Next, then Prev, between already checked sections", async () => {
    const { cache, send } = harness();
    const about = buildChecklistRequest("about", body("I study software."))!;
    const experience = buildChecklistRequest("experience", body("I study software."))!;
    await Promise.all([loadChecklist(about, send, cache), loadChecklist(experience, send, cache)]);
    for (const request of [experience, about, experience, about]) await loadChecklist(request, send, cache);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("ignores changes to sections the assessment doesn't read", () => {
    const before = checklistCacheKey(buildChecklistRequest("about", body("I study software."))!);
    const after = checklistCacheKey(buildChecklistRequest("about", body("I study software.", "", "Something else entirely"))!);
    expect(after).toBe(before);
  });

  it("never reuses a verdict once the evidence or the user's context changes", async () => {
    const { cache, send } = harness();
    await loadChecklist(buildChecklistRequest("about", body("I study software."))!, send, cache);
    await loadChecklist(buildChecklistRequest("about", body("I build websites."))!, send, cache);
    await loadChecklist(buildChecklistRequest("about", body("I build websites.", "I also know Rust"))!, send, cache);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("doesn't cache failures", async () => {
    const { cache } = harness();
    const failing = vi.fn(() => ({ requestId: "r", promise: Promise.resolve<ChecklistOutcome>({ status: "unavailable", reason: "timeout" }), cancel: vi.fn() }));
    const request = buildChecklistRequest("about", body("x"))!;
    await loadChecklist(request, failing, cache);
    await loadChecklist(request, failing, cache);
    expect(failing).toHaveBeenCalledTimes(2);
  });
});

describe("partly read lists", () => {
  const skills = (text: string, itemCount: number): OptimizeProfileRequestBody => ({
    profile: { identity: "me", evidence: [{ id: "skills:0", section: "skills", text, evidenceType: "skills" }] },
    sections: [{ section: "skills", present: true, itemCount, evidenceIds: ["skills:0"] }],
    userContext: "",
  });

  it("asks nothing when the page showed only some of the entries", () => {
    expect(partialList("skills", skills("Customer Service, Tutoring", 50))).toEqual({ read: 2, total: 50 });
    expect(buildChecklistRequest("skills", skills("Customer Service, Tutoring", 50))).toBeNull();
  });

  it("checks a list that was read in full", () => {
    expect(partialList("skills", skills("Python, React", 2))).toBeNull();
    expect(buildChecklistRequest("skills", skills("Python, React", 2))).not.toBeNull();
  });
});
