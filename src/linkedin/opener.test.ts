// @vitest-environment jsdom
// jsdom has no real layout, so getBoundingClientRect/offsetHeight are stubbed with fixed
// values here rather than relying on actual rendering. dragPosition.test.ts already covers
// the clamp/threshold math itself in isolation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OPENER_ID = "finder-linkwise-opener";
const STORAGE_KEY = "finder.openerTopPx.v1";

function installFakeChromeStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const setCalls: Record<string, unknown>[] = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: (keys: string | string[]) =>
          Promise.resolve(
            (Array.isArray(keys) ? keys : [keys]).reduce<Record<string, unknown>>((acc, key) => {
              if (key in data) acc[key] = data[key];
              return acc;
            }, {}),
          ),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, items);
          setCalls.push(items);
          return Promise.resolve();
        },
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  };
  return { data, setCalls };
}

function stubGeometry(button: HTMLButtonElement, top: number, height: number): void {
  button.getBoundingClientRect = () => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) });
  Object.defineProperty(button, "offsetHeight", { value: height, configurable: true });
}

function stubViewportHeight(height: number): void {
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true, writable: true });
}

function getButton(): HTMLButtonElement {
  return document.getElementById(OPENER_ID) as HTMLButtonElement;
}

// Flushes every pending microtask, safer than chaining a guessed number of Promise.resolve()
// calls against the exact depth of the async chain behind chrome.storage.local.get.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function pointerEvent(type: string, opts: { clientY: number; pointerId?: number; button?: number }): PointerEvent {
  return new PointerEvent(type, { clientY: opts.clientY, pointerId: opts.pointerId ?? 1, button: opts.button ?? 0, bubbles: true });
}

describe("opener.ts", () => {
  // vi.resetModules() gives each test a fresh module instance (and thus a fresh internal
  // resizeHandler variable), but the real jsdom `window` is shared across every test in this
  // file. Without an explicit teardown, each test's window "resize" listener would outlive the
  // test and stack up on the next one, so every test that creates the opener must remove it.
  let currentModule: typeof import("./opener") | null = null;

  async function importOpener(): Promise<typeof import("./opener")> {
    vi.resetModules();
    currentModule = await import("./opener");
    return currentModule;
  }

  beforeEach(() => {
    stubViewportHeight(800);
  });

  afterEach(() => {
    currentModule?.removeLinkWiseOpener();
    currentModule = null;
    document.body.innerHTML = "";
    document.body.style.userSelect = "";
    vi.unstubAllGlobals();
  });

  it("creates exactly one opener button and stays idempotent across repeated calls", async () => {
    installFakeChromeStorage();
    const { ensureLinkWiseOpener } = await importOpener();
    ensureLinkWiseOpener(() => {});
    ensureLinkWiseOpener(() => {});
    expect(document.querySelectorAll(`#${OPENER_ID}`)).toHaveLength(1);
  });

  it("a plain click with no movement toggles the panel", async () => {
    installFakeChromeStorage();
    const { ensureLinkWiseOpener } = await importOpener();
    const onToggle = vi.fn();
    ensureLinkWiseOpener(onToggle);
    const button = getButton();
    stubGeometry(button, 300, 40);

    button.dispatchEvent(pointerEvent("pointerdown", { clientY: 320 }));
    button.dispatchEvent(pointerEvent("pointerup", { clientY: 320 }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("ensureLinkWiseOpener updates which callback a later click invokes", async () => {
    installFakeChromeStorage();
    const { ensureLinkWiseOpener } = await importOpener();
    const first = vi.fn();
    const second = vi.fn();
    ensureLinkWiseOpener(first);
    ensureLinkWiseOpener(second);
    const button = getButton();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("dragging past the threshold does not toggle the panel and moves only vertically", async () => {
    installFakeChromeStorage();
    const { ensureLinkWiseOpener } = await importOpener();
    const onToggle = vi.fn();
    ensureLinkWiseOpener(onToggle);
    const button = getButton();
    stubGeometry(button, 300, 40);
    button.style.right = "0px";

    button.dispatchEvent(pointerEvent("pointerdown", { clientY: 300 }));
    button.dispatchEvent(pointerEvent("pointermove", { clientY: 340 })); // 40px, past the 5px threshold
    button.dispatchEvent(pointerEvent("pointerup", { clientY: 340 }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true })); // the browser's own post-drag click

    expect(onToggle).not.toHaveBeenCalled();
    expect(button.style.top).toBe("340px"); // 300 start + 40 delta, well within the 800px viewport
    expect(button.style.right).toBe("0px"); // horizontal position never touched by dragging
  });

  it("tiny movement under the threshold still counts as a click", async () => {
    installFakeChromeStorage();
    const { ensureLinkWiseOpener } = await importOpener();
    const onToggle = vi.fn();
    ensureLinkWiseOpener(onToggle);
    const button = getButton();
    stubGeometry(button, 300, 40);

    button.dispatchEvent(pointerEvent("pointerdown", { clientY: 300 }));
    button.dispatchEvent(pointerEvent("pointermove", { clientY: 302 })); // 2px, under the threshold
    button.dispatchEvent(pointerEvent("pointerup", { clientY: 302 }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("clamps a drag so the tab can never move off the bottom of the viewport", async () => {
    installFakeChromeStorage();
    const { ensureLinkWiseOpener } = await importOpener();
    ensureLinkWiseOpener(() => {});
    const button = getButton();
    stubGeometry(button, 700, 40); // near the bottom of an 800px viewport

    button.dispatchEvent(pointerEvent("pointerdown", { clientY: 700 }));
    button.dispatchEvent(pointerEvent("pointermove", { clientY: 900 })); // would push it off-screen
    button.dispatchEvent(pointerEvent("pointerup", { clientY: 900 }));

    expect(button.style.top).toBe("760px"); // clamped to 800 - 40
  });

  it("saves the new position to storage once a drag ends", async () => {
    const { setCalls } = installFakeChromeStorage();
    const { ensureLinkWiseOpener } = await importOpener();
    ensureLinkWiseOpener(() => {});
    const button = getButton();
    stubGeometry(button, 300, 40);

    button.dispatchEvent(pointerEvent("pointerdown", { clientY: 300 }));
    button.dispatchEvent(pointerEvent("pointermove", { clientY: 350 }));
    button.dispatchEvent(pointerEvent("pointerup", { clientY: 350 }));
    await flushMicrotasks();

    expect(setCalls.some((call) => STORAGE_KEY in call)).toBe(true);
  });

  it("restores a previously-saved position on creation", async () => {
    installFakeChromeStorage({ [STORAGE_KEY]: 250 });
    const { ensureLinkWiseOpener } = await importOpener();
    ensureLinkWiseOpener(() => {});
    const button = getButton();
    stubGeometry(button, 0, 40); // pre-restore geometry, irrelevant to the assertion below
    await flushMicrotasks();

    expect(button.style.top).toBe("250px");
  });

  it("uses the default centered position when nothing has been saved yet", async () => {
    installFakeChromeStorage();
    const { ensureLinkWiseOpener } = await importOpener();
    ensureLinkWiseOpener(() => {});
    const button = getButton();
    await flushMicrotasks();

    expect(button.style.top).toBe("50%");
    expect(button.style.transform).toBe("translateY(-50%)");
  });

  it("switches the cursor to grabbing while dragging and back to grab afterward", async () => {
    installFakeChromeStorage();
    const { ensureLinkWiseOpener } = await importOpener();
    ensureLinkWiseOpener(() => {});
    const button = getButton();
    stubGeometry(button, 300, 40);

    expect(button.style.cursor).toBe("grab");
    button.dispatchEvent(pointerEvent("pointerdown", { clientY: 300 }));
    expect(button.style.cursor).toBe("grabbing");
    button.dispatchEvent(pointerEvent("pointerup", { clientY: 300 }));
    expect(button.style.cursor).toBe("grab");
  });

  it("re-clamps and persists the position when the viewport is resized smaller", async () => {
    const { setCalls } = installFakeChromeStorage();
    const { ensureLinkWiseOpener } = await importOpener();
    ensureLinkWiseOpener(() => {});
    const button = getButton();
    stubGeometry(button, 700, 40); // fine in an 800px-tall viewport

    stubViewportHeight(720); // now the tab would hang off the bottom
    window.dispatchEvent(new Event("resize"));

    expect(button.style.top).toBe("680px"); // clamped to 720 - 40
    expect(setCalls.some((call) => STORAGE_KEY in call)).toBe(true);
  });

  it("removeLinkWiseOpener removes the button and stops reacting to resize", async () => {
    const { setCalls } = installFakeChromeStorage();
    const { ensureLinkWiseOpener, removeLinkWiseOpener } = await importOpener();
    ensureLinkWiseOpener(() => {});
    removeLinkWiseOpener();

    expect(document.querySelectorAll(`#${OPENER_ID}`)).toHaveLength(0);

    setCalls.length = 0;
    stubViewportHeight(400);
    window.dispatchEvent(new Event("resize"));
    expect(setCalls).toHaveLength(0); // no stale listener left reacting after teardown
  });
});
