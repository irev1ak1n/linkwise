import { describe, expect, it, vi } from "vitest";
import { getSignalModeState, publishSignalAnalysis, subscribeSignalModeStore } from "./signalModeStore";

describe("signalModeStore", () => {
  it("publishes analysis state and skips unchanged updates", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSignalModeStore(listener);
    const analysis = { status: "loading" } as const;
    publishSignalAnalysis(analysis, 0);
    publishSignalAnalysis(analysis, 0);
    expect(listener).toHaveBeenCalledTimes(1);
    publishSignalAnalysis(analysis, 3);
    expect(getSignalModeState().highlighted).toBe(3);
    unsubscribe();
  });
});
