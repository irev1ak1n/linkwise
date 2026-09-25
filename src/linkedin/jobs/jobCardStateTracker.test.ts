import { beforeEach, describe, expect, it } from "vitest";
import { clearTrackedStates, getTrackedState, setTrackedState } from "./jobCardStateTracker";

describe("jobCardStateTracker", () => {
  beforeEach(() => {
    clearTrackedStates();
  });

  it("defaults to none for an unseen job id", () => {
    expect(getTrackedState("1")).toBe("none");
  });

  it("remembers a state set for a job id", () => {
    setTrackedState("1", "hide");
    expect(getTrackedState("1")).toBe("hide");
  });

  it("keeps states for different job ids independent", () => {
    setTrackedState("1", "hide");
    setTrackedState("2", "highlight");
    expect(getTrackedState("1")).toBe("hide");
    expect(getTrackedState("2")).toBe("highlight");
  });

  it("clears all tracked states", () => {
    setTrackedState("1", "hide");
    clearTrackedStates();
    expect(getTrackedState("1")).toBe("none");
  });
});
