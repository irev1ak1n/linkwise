// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { BASE_SCROLL_PX_PER_SECOND, END_WAIT_MS, STEP_FRACTION, STEP_INTERVAL_MS, createAutoScrollController, isUserScrollIntent } from "./autoScrollController";

function harness(speed = 1, height = 5000) {
  let now = 0;
  let queued: (() => void) | null = null;
  const settings = { speed };
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
    getSpeed: () => settings.speed,
  });
  function run(ms: number, frameMs = 16): void {
    for (let t = 0; t < ms; t += frameMs) {
      now += frameMs;
      const cb = queued;
      queued = null;
      cb?.();
    }
  }
  return { controller, container, settings, run, framesPending: () => queued !== null };
}

describe("createAutoScrollController", () => {
  it("moves the page gradually at the base speed", () => {
    const { controller, container, run } = harness();
    controller.start("page", () => container, "smooth");
    run(1000);
    expect(container.scrollTop).toBeGreaterThan(BASE_SCROLL_PX_PER_SECOND * 0.9);
    expect(container.scrollTop).toBeLessThanOrEqual(BASE_SCROLL_PX_PER_SECOND);
  });

  it("scales movement with the chosen speed", () => {
    const distances = [0.5, 1, 2].map((speed) => {
      const { controller, container, run } = harness(speed);
      controller.start("page", () => container, "smooth");
      run(2000);
      return container.scrollTop;
    });
    expect(distances[0]! * 2).toBeCloseTo(distances[1]!, -1);
    expect(distances[1]! * 2).toBeCloseTo(distances[2]!, -1);
  });

  it("applies a new speed mid-scan without restarting or jumping", () => {
    const { controller, container, settings, run } = harness(1);
    controller.start("page", () => container, "smooth");
    run(1000);
    const before = container.scrollTop;
    settings.speed = 2;
    run(16);
    expect(container.scrollTop - before).toBeLessThan(10);
    run(1000);
    expect(container.scrollTop - before).toBeGreaterThan(BASE_SCROLL_PX_PER_SECOND * 1.8);
    expect(controller.getState()).toEqual({ status: "running", target: "page", strategy: "smooth", pausedBy: null });
  });

  it("stops moving when paused and continues from the same place on resume", () => {
    const { controller, container, run, framesPending } = harness();
    controller.start("page", () => container, "smooth");
    run(1000);
    controller.pause();
    const at = container.scrollTop;
    run(2000);
    expect(container.scrollTop).toBe(at);
    expect(framesPending()).toBe(false);
    expect(controller.getState().status).toBe("paused");

    controller.resume();
    run(500);
    expect(container.scrollTop).toBeGreaterThan(at);
    expect(container.scrollTop - at).toBeLessThan(BASE_SCROLL_PX_PER_SECOND);
  });

  it("remembers whether the reader or the Pause button stopped it, and forgets on resume", () => {
    const { controller, container } = harness();
    controller.start("page", () => container, "smooth");
    controller.pause("user");
    expect(controller.getState()).toMatchObject({ status: "paused", pausedBy: "user" });
    controller.resume();
    expect(controller.getState()).toMatchObject({ status: "running", pausedBy: null });
    controller.pause();
    expect(controller.getState().pausedBy).toBe("button");
  });

  it("never restarts a page it is already reading", () => {
    const { controller, container, run } = harness();
    controller.start("page", () => container, "smooth");
    run(1000);
    controller.pause();
    controller.start("page", () => container, "smooth");
    expect(controller.getState().status).toBe("paused");
  });

  it("completes once the bottom stops growing, and stays there", () => {
    const { controller, container, run, framesPending } = harness(2, 1000);
    controller.start("page", () => container, "smooth");
    run(3000);
    const bottom = container.scrollTop;
    expect(bottom).toBeGreaterThanOrEqual(199);
    expect(controller.getState().status).toBe("running");
    run(END_WAIT_MS);
    expect(controller.getState().status).toBe("complete");
    expect(framesPending()).toBe(false);
    run(2000);
    expect(container.scrollTop).toBe(bottom);
  });

  it("keeps going when more content loads at the bottom", () => {
    const { controller, container, run } = harness(2, 1000);
    controller.start("page", () => container, "smooth");
    run(3000);
    container.scrollHeight = 2000;
    run(END_WAIT_MS);
    expect(controller.getState().status).toBe("running");
    expect(container.scrollTop).toBeGreaterThan(200);
  });

  it("starts fresh for a different page", () => {
    const { controller, container, run } = harness();
    controller.start("main", () => container, "smooth");
    run(500);
    controller.pause();
    controller.start("details", () => container, "smooth");
    expect(controller.getState()).toEqual({ status: "running", target: "details", strategy: "smooth", pausedBy: null });
  });
});

describe("createAutoScrollController - fast steps", () => {
  it("moves most of a screen at a time, pausing between steps for lazy content", () => {
    const { controller, container, run } = harness();
    controller.start("page", () => container, "steps");
    run(16);
    const step = Math.round(800 * STEP_FRACTION);
    expect(container.scrollTop).toBe(step);
    run(STEP_INTERVAL_MS - 100);
    expect(container.scrollTop).toBe(step);
    run(200);
    expect(container.scrollTop).toBe(step * 2);
  });

  it("ignores the reading speed", () => {
    const distances = [0.5, 2].map((speed) => {
      const { controller, container, run } = harness(speed);
      controller.start("page", () => container, "steps");
      run(3000);
      return container.scrollTop;
    });
    expect(distances[0]).toBe(distances[1]);
  });

  it("reaches the end of a long page quickly and completes", () => {
    const { controller, container, run } = harness(1, 5000);
    controller.start("page", () => container, "steps");
    run(10000);
    expect(container.scrollTop).toBeGreaterThanOrEqual(4199);
    expect(controller.getState().status).toBe("complete");
  });

  it("switching strategy on the same page starts over with the new one", () => {
    const { controller, container } = harness();
    controller.start("page", () => container, "steps");
    controller.start("page", () => container, "smooth");
    expect(controller.getState()).toEqual({ status: "running", target: "page", strategy: "smooth", pausedBy: null });
  });
});

describe("createAutoScrollController - scroll anchoring", () => {
  it("turns anchoring off only while reading, and restores it after", () => {
    const { controller, container, run } = harness();
    const el = Object.assign(container, { style: { overflowAnchor: "auto" } });
    controller.start("page", () => el, "smooth");
    run(100);
    expect(el.style.overflowAnchor).toBe("none");
    controller.pause();
    expect(el.style.overflowAnchor).toBe("auto");
    controller.resume();
    expect(el.style.overflowAnchor).toBe("none");
    controller.reset();
    expect(el.style.overflowAnchor).toBe("auto");
  });

  it("keeps anchoring off on a scrolling element that replaced the original mid-scan", () => {
    const { controller, container, run } = harness();
    const first = Object.assign({ ...container }, { style: { overflowAnchor: "auto" } });
    const second = Object.assign({ ...container }, { style: { overflowAnchor: "auto" } });
    let current = first;
    controller.start("page", () => current, "steps");
    run(100);
    current = second;
    run(100);
    expect(second.style.overflowAnchor).toBe("none");
    expect(first.style.overflowAnchor).toBe("auto");
  });
});

describe("isUserScrollIntent", () => {
  const main = document.createElement("main");
  const host = document.createElement("div");
  document.body.append(main, host);

  // composedPath() is only populated while the event is being dispatched.
  function intent(target: EventTarget, event: Event): boolean {
    let result = false;
    const listener = (e: Event) => (result = isUserScrollIntent(e, host, main));
    window.addEventListener(event.type, listener, { capture: true });
    target.dispatchEvent(event);
    window.removeEventListener(event.type, listener, { capture: true });
    return result;
  }

  it("treats wheel, touch and scroll keys on the page as the user taking over", () => {
    expect(intent(main, new WheelEvent("wheel", { bubbles: true }))).toBe(true);
    expect(intent(main, new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }))).toBe(true);
    expect(intent(main, new KeyboardEvent("keydown", { key: "End", bubbles: true }))).toBe(true);
  });

  it("treats a press on the scrollbar as the user taking over, but not a click on content", () => {
    expect(intent(main, new MouseEvent("mousedown", { bubbles: true }))).toBe(true);
    const link = document.createElement("a");
    main.append(link);
    expect(intent(link, new MouseEvent("mousedown", { bubbles: true }))).toBe(false);
  });

  it("ignores the LinkWise panel, typing, and pointer movement", () => {
    expect(intent(host, new WheelEvent("wheel", { bubbles: true }))).toBe(false);
    const input = document.createElement("input");
    main.append(input);
    expect(intent(input, new KeyboardEvent("keydown", { key: " ", bubbles: true }))).toBe(false);
    expect(intent(main, new MouseEvent("mousemove", { bubbles: true }))).toBe(false);
    expect(intent(main, new KeyboardEvent("keydown", { key: "a", bubbles: true }))).toBe(false);
  });

  it("never treats the page's own scroll events as user input", () => {
    expect(intent(main, new Event("scroll", { bubbles: true }))).toBe(false);
  });
});
