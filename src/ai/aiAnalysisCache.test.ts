import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCacheKey, clearAiAnalysisCache, getCachedAnalysis, getOrStartInFlight, hashString, setCachedAnalysis } from "./aiAnalysisCache";
import type { AiAnalysisOutcome } from "./apiTypes";

beforeEach(() => {
  clearAiAnalysisCache();
});

function readyOutcome(overrides: Partial<Extract<AiAnalysisOutcome, { status: "ok" }>> = {}): Extract<AiAnalysisOutcome, { status: "ok" }> {
  return {
    status: "ok",
    model: "test-model",
    result: { scorePercent: 80, disqualified: false, reasons: [], missing: [], complete: true, profileExtracted: true, confidence: 1 },
    narrative: { strengths: [], gaps: [], experienceAssessment: "relevant", recommendationReason: "x" },
    ...overrides,
  };
}

describe("hashString", () => {
  it("is deterministic for the same input", () => {
    expect(hashString("hello world")).toBe(hashString("hello world"));
  });

  it("differs for different inputs", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

describe("buildCacheKey - evidence change invalidates the cache", () => {
  it("produces a different key when the evidence hash changes, naturally missing the old cache entry", () => {
    const keyBefore = buildCacheKey({ profileIdentity: "Jordan Rivera", evidenceHash: hashString("headline only"), goalHash: "g1" });
    setCachedAnalysis(keyBefore, readyOutcome());
    expect(getCachedAnalysis(keyBefore)).toBeDefined();

    const keyAfter = buildCacheKey({ profileIdentity: "Jordan Rivera", evidenceHash: hashString("headline + experience now loaded"), goalHash: "g1" });
    expect(getCachedAnalysis(keyAfter)).toBeUndefined();
  });

  it("produces a different key when the goal hash changes", () => {
    const keyA = buildCacheKey({ profileIdentity: "x", evidenceHash: "e1", goalHash: hashString("goal A") });
    const keyB = buildCacheKey({ profileIdentity: "x", evidenceHash: "e1", goalHash: hashString("goal B") });
    expect(keyA).not.toBe(keyB);
  });

  it("produces the same key for identical inputs", () => {
    const keyA = buildCacheKey({ profileIdentity: "x", evidenceHash: "e1", goalHash: "g1" });
    const keyB = buildCacheKey({ profileIdentity: "x", evidenceHash: "e1", goalHash: "g1" });
    expect(keyA).toBe(keyB);
  });
});

describe("getOrStartInFlight - request deduplication", () => {
  it("returns the same promise for concurrent calls with the same key, calling start() only once", () => {
    const start = vi.fn(() => Promise.resolve(readyOutcome()));
    const key = "dedup-key";

    const first = getOrStartInFlight(key, start);
    const second = getOrStartInFlight(key, start);

    expect(first).toBe(second);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh request once the previous one has resolved", async () => {
    const start = vi.fn(() => Promise.resolve(readyOutcome()));
    const key = "dedup-key-2";

    await getOrStartInFlight(key, start);
    await getOrStartInFlight(key, start);

    expect(start).toHaveBeenCalledTimes(2);
  });

  it("cleans up the in-flight entry even when the request fails", async () => {
    const failing = () => Promise.reject(new Error("network error"));
    const key = "dedup-key-3";

    await expect(getOrStartInFlight(key, failing)).rejects.toThrow("network error");

    const start = vi.fn(() => Promise.resolve(readyOutcome()));
    await getOrStartInFlight(key, start);
    expect(start).toHaveBeenCalledTimes(1); // proves the failed entry didn't linger and block a retry
  });
});
