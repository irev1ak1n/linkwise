import { describe, expect, it } from "vitest";
import { createAutoScrollDriver } from "./autoScroll";

function fakeClock(startAt = 0) {
  let t = startAt;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createAutoScrollDriver - scan mode gate", () => {
  it("never scrolls in 'scroll' mode, no matter how favorable everything else is", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now });
    expect(driver.shouldScrollNow("scroll", "profile:1", true, false)).toBe(false);
  });

  it("scrolls in 'auto' mode under the same otherwise-favorable conditions", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now });
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(true);
  });

  it("stops scrolling the instant mode flips from 'auto' to 'scroll' mid-scan", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, minIntervalMs: 100 });
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(true);
    clock.advance(200);
    expect(driver.shouldScrollNow("scroll", "profile:1", true, false)).toBe(false);
  });

  it("resumes from where it left off when switching back to 'auto'", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, maxDurationMs: 8000, minIntervalMs: 100 });
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(true);
    clock.advance(200);
    expect(driver.shouldScrollNow("scroll", "profile:1", true, false)).toBe(false);
    clock.advance(200);
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(true);
  });
});

describe("createAutoScrollDriver - shouldScrollNow", () => {
  it("does nothing when there is no profile", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now });
    expect(driver.shouldScrollNow("auto", null, true, false)).toBe(false);
  });

  it("does nothing when no goal is active, even mid-profile", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now });
    expect(driver.shouldScrollNow("auto", "profile:1", false, false)).toBe(false);
  });

  it("does nothing once the real document end is already reached", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now });
    expect(driver.shouldScrollNow("auto", "profile:1", true, true)).toBe(false);
  });

  it("scrolls on the first call for a fresh profile with an active goal, not yet at the end", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, minIntervalMs: 500 });
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(true);
  });

  it("does not scroll again before minIntervalMs has passed", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, minIntervalMs: 500 });
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(true);
    clock.advance(200);
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(false);
  });

  it("scrolls again once minIntervalMs has passed", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, minIntervalMs: 500 });
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(true);
    clock.advance(600);
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(true);
  });

  it("stops scrolling once maxDurationMs has elapsed since the profile was first seen", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, maxDurationMs: 8000, minIntervalMs: 100 });
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(true);
    clock.advance(8500);
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(false);
  });

  it("resets its timing when the profile key changes (a real navigation)", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, maxDurationMs: 8000, minIntervalMs: 100 });
    driver.shouldScrollNow("auto", "profile:1", true, false);
    clock.advance(8500); // profile:1 has now timed out
    expect(driver.shouldScrollNow("auto", "profile:1", true, false)).toBe(false);

    // Navigating to a different profile gets its own fresh time budget.
    expect(driver.shouldScrollNow("auto", "profile:2", true, false)).toBe(true);
  });
});

describe("createAutoScrollDriver - hasTimedOut", () => {
  it("is false for a profile just seen", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, maxDurationMs: 8000 });
    expect(driver.hasTimedOut("profile:1")).toBe(false);
  });

  it("becomes true once maxDurationMs has elapsed", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, maxDurationMs: 8000 });
    driver.hasTimedOut("profile:1"); // starts tracking
    clock.advance(8000);
    expect(driver.hasTimedOut("profile:1")).toBe(true);
  });

  it("is independent of whether a goal is active — it only tracks elapsed time for the profile", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, maxDurationMs: 8000 });
    driver.shouldScrollNow("auto", "profile:1", false, false); // no goal active, never actually scrolls
    clock.advance(8000);
    expect(driver.hasTimedOut("profile:1")).toBe(true);
  });

  it("is false for null profileKey", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now });
    expect(driver.hasTimedOut(null)).toBe(false);
  });

  it("resets when the profile changes", () => {
    const clock = fakeClock();
    const driver = createAutoScrollDriver({ now: clock.now, maxDurationMs: 8000 });
    driver.hasTimedOut("profile:1");
    clock.advance(8000);
    expect(driver.hasTimedOut("profile:1")).toBe(true);
    expect(driver.hasTimedOut("profile:2")).toBe(false);
  });
});
