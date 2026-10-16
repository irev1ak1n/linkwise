// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextPair } from "./profileDiff";

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
  vi.resetModules();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test" },
    storage: {
      local: {
        get: (key: string) => Promise.resolve(key in data ? { [key]: structuredClone(data[key]) } : {}),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, structuredClone(items));
          return Promise.resolve();
        },
      },
    },
  };
});

const paraphrase: TextPair = { id: "experience:text_changed:a", section: "experience", context: "Web Developer at Acme", previous: "Built a website serving 300+ students", current: "Designed a website used by more than 300 students" };
const dashboard: TextPair = { id: "experience:text_changed:b", section: "experience", context: "Developer at School", previous: "Built a staff dashboard", current: "Built a staff dashboard allowing advisers to manage student content" };

describe("resolveTextPairs", () => {
  it("asks once per pair of texts, then answers from the cache", async () => {
    const { resolveTextPairs } = await import("./semanticCompareClient");
    const request = vi.fn(async (pairs: TextPair[]) => ({
      status: "ok" as const,
      results: pairs.map((pair) =>
        pair.id === paraphrase.id
          ? { id: pair.id, meaningful: false as const }
          : { id: pair.id, meaningful: true as const, significance: "meaningful" as const, direction: "improved" as const, title: "New responsibility", explanation: "Advisers can now manage content.", previousValue: "", currentValue: "allowing advisers to manage student content" },
      ),
    }));
    const first = await resolveTextPairs([paraphrase, dashboard], request);
    expect(first.get(paraphrase.id)).toBeNull();
    expect(first.get(dashboard.id)).toMatchObject({ kind: "text_changed", title: "New responsibility", subject: "Developer at School", current: "allowing advisers to manage student content" });
    const second = await resolveTextPairs([paraphrase, dashboard], request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(second.get(dashboard.id)).toMatchObject({ title: "New responsibility" });
  });

  it("leaves pairs unresolved when the backend is unavailable", async () => {
    const { resolveTextPairs } = await import("./semanticCompareClient");
    const results = await resolveTextPairs([paraphrase], async () => ({ status: "unavailable" as const }));
    expect(results.has(paraphrase.id)).toBe(false);
  });
});
