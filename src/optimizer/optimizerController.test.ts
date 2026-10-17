import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { createPersistentCache } from "../ai/persistentCache";
import { OptimizerController, buildOptimizerRequest, optimizerCacheKey, type OptimizerViewState } from "./optimizerController";
import type { OptimizeProfileRequestBody } from "./optimizerClient";
import type { OptimizerOutcome, OptimizerResultDTO } from "./optimizerTypes";
import type { ProfileShell } from "../linkedin/profileAdapter";

const shell: ProfileShell = { isOwnProfile: true, hasPhoto: true, hasBanner: false, sections: { about: null, experience: 1 } };

function profile(about: string): LinkedInProfile {
  return { ...EMPTY_PROFILE, name: "Jordan", headline: "Student developer", about, experience: [{ title: "Web Lead", company: "Robotics Club" }], extracted: true };
}

const ok: OptimizerOutcome = {
  status: "ok",
  result: { summary: "", sections: [{ section: "about", state: "strong", impact: "low", reason: "Clear.", sourceType: "linkedin_profile", evidenceIds: ["about:0"], suggestions: [] }] },
};

function harness() {
  const states: OptimizerViewState[] = [];
  const bodies: OptimizeProfileRequestBody[] = [];
  const request = vi.fn((body: OptimizeProfileRequestBody) => {
    bodies.push(body);
    return { requestId: "r", promise: Promise.resolve(ok), cancel: vi.fn() };
  });
  const cache = createPersistentCache<{ result: OptimizerResultDTO }>("test.optimizer", 60000, 10);
  const make = () => new OptimizerController({ onChange: (s) => states.push(s), request, cache, debounceMs: 10 });
  return { controller: make(), make, request, states, bodies };
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(20);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("optimizerCacheKey", () => {
  it("changes with evidence or user context, not with whitespace around the context", () => {
    const base = { profileKey: "jordan", profile: profile("Builds websites."), shell, userContext: "" };
    const key = optimizerCacheKey(buildOptimizerRequest(base));
    expect(key).toMatch(/^optimizer-v4:jordan:/);
    expect(optimizerCacheKey(buildOptimizerRequest({ ...base, profile: profile("Builds apps.") }))).not.toBe(key);
    expect(optimizerCacheKey(buildOptimizerRequest({ ...base, userContext: "AWS certified" }))).not.toBe(key);
    expect(optimizerCacheKey(buildOptimizerRequest({ ...base, userContext: "  " }))).toBe(key);
  });
});

describe("OptimizerController", () => {
  it("requests once, then reuses the cached result for an unchanged profile", async () => {
    const { controller, make, request, states } = harness();
    const input = { profileKey: "jordan", profile: profile("Builds websites."), shell, userContext: "" };
    controller.update(input);
    expect(states.at(-1)).toEqual({ status: "loading" });
    await settle();
    expect(states.at(-1)).toMatchObject({ status: "ready", score: expect.any(Number) });

    controller.update({ ...input, profile: profile("Builds websites.") });
    const reopened = make();
    reopened.update(input);
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(reopened.getState()).toMatchObject({ status: "ready" });
  });

  it("sends the user context and asks again when it changes", async () => {
    const { controller, request, bodies } = harness();
    const input = { profileKey: "jordan", profile: profile("Builds websites."), shell, userContext: "" };
    controller.update(input);
    await settle();
    controller.update({ ...input, userContext: "I have an AWS certification that is not on LinkedIn." });
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    expect(bodies[1].userContext).toBe("I have an AWS certification that is not on LinkedIn.");
    controller.update(input);
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("includes section presence from the page in the request", () => {
    const body = buildOptimizerRequest({ profileKey: "jordan", profile: profile("x"), shell, userContext: "" });
    expect(body.sections.find((s) => s.section === "photo")?.present).toBe(true);
    expect(body.sections.find((s) => s.section === "projects")?.present).toBe(false);
  });

  it("goes idle when the input disappears", () => {
    const { controller, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("x"), shell, userContext: "" });
    controller.update(null);
    expect(states.at(-1)).toEqual({ status: "idle" });
  });
});
