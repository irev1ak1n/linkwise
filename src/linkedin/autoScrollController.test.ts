// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { END_WAIT_MS, STEP_FRACTION, STEP_INTERVAL_MS, createAutoScrollController } from "./autoScrollController";

function harness(height = 5000) {
  let now = 0;
  let queued: (() => void) | null = null;
  const container = { scrollTop: 0, scrollHeight: height, clientHeight: 800 };
  const controller = createAutoScrollController({
    now: () => now,
    requestFrame: (cb) => {
      queued = cb;
      return 1;
    },
    cancelFrame: () => {
      queued = null;
    },
  });
  function run(ms: number, frameMs = 16): void {
    for (let t = 0; t < ms; t += frameMs) {
      now += frameMs;
      const cb = queued;
      queued = null;
      cb?.();
    }
  }
  return { controller, container, run, framesPending: () => queued !== null };
}

describe("createAutoScrollController", () => {
  it("moves most of a screen at a time, pausing between steps for lazy content", () => {
    const { controller, container, run } = harness();
    controller.start("page", () => container);
    run(16);
    const step = Math.round(800 * STEP_FRACTION);
    expect(container.scrollTop).toBe(step);
    run(STEP_INTERVAL_MS - 100);
    expect(container.scrollTop).toBe(step);
    run(200);
    expect(container.scrollTop).toBe(step * 2);
  });

  it("never restarts a page it is already scanning", () => {
    const { controller, container, run } = harness();
    controller.start("page", () => container);
    run(1000);
    const at = container.scrollTop;
    controller.start("page", () => container);
    expect(controller.getState().status).toBe("running");
    expect(container.scrollTop).toBe(at);
  });

  it("reaches the end of a long page quickly, completes once the bottom stops growing, and stays there", () => {
    const { controller, container, run, framesPending } = harness(5000);
    controller.start("page", () => container);
    run(10000);
    expect(container.scrollTop).toBeGreaterThanOrEqual(4199);
    expect(controller.getState().status).toBe("complete");
    expect(framesPending()).toBe(false);
    const bottom = container.scrollTop;
    run(2000);
    expect(container.scrollTop).toBe(bottom);
  });

  it("keeps going when more content loads at the bottom", () => {
    const { controller, container, run } = harness(1000);
    controller.start("page", () => container);
    run(1000);
    container.scrollHeight = 3000;
    run(END_WAIT_MS);
    expect(controller.getState().status).toBe("running");
    expect(container.scrollTop).toBeGreaterThan(200);
  });

  it("starts fresh for a different page", () => {
    const { controller, container, run } = harness();
    controller.start("main", () => container);
    run(500);
    controller.start("details", () => container);
    expect(controller.getState()).toEqual({ status: "running", target: "details" });
  });
});

describe("createAutoScrollController - scroll anchoring", () => {
  it("turns anchoring off only while scanning, and restores it after", () => {
    const { controller, container, run } = harness();
    const el = Object.assign(container, { style: { overflowAnchor: "auto" } });
    controller.start("page", () => el);
    run(100);
    expect(el.style.overflowAnchor).toBe("none");
    controller.reset();
    expect(el.style.overflowAnchor).toBe("auto");
  });

  it("keeps anchoring off on a scrolling element that replaced the original mid-scan", () => {
    const { controller, container, run } = harness();
    const first = Object.assign({ ...container }, { style: { overflowAnchor: "auto" } });
    const second = Object.assign({ ...container }, { style: { overflowAnchor: "auto" } });
    let current = first;
    controller.start("page", () => current);
    run(100);
    current = second;
    run(100);
    expect(second.style.overflowAnchor).toBe("none");
    expect(first.style.overflowAnchor).toBe("auto");
  });
});
