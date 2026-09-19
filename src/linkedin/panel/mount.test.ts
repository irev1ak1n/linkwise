// @vitest-environment jsdom
// Regression coverage for the opener positioning: closing must reset it to the right edge,
// opening must hug the panel's left edge. React is mocked out since this is about the
// open/close wiring, not panel content.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }),
}));
vi.mock("./PanelApp", () => ({ PanelApp: () => null }));

function addOpenerButton(): void {
  const button = document.createElement("button");
  button.id = "finder-linkwise-opener";
  document.body.appendChild(button);
}

function openerRight(): string {
  return (document.getElementById("finder-linkwise-opener") as HTMLButtonElement).style.right;
}

describe("mount.ts - opener offset stays in sync with panel state", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.resetModules();
  });

  it("opening the panel offsets the opener to the panel's own width", async () => {
    addOpenerButton();
    const { openPanel, PANEL_WIDTH_PX } = await import("./mount");

    openPanel();
    expect(openerRight()).toBe(`${PANEL_WIDTH_PX}px`);
  });

  it("closing via closePanel() resets the opener to the viewport's right edge — the same function the panel's own '✕' button calls", async () => {
    addOpenerButton();
    const { openPanel, closePanel } = await import("./mount");

    openPanel();
    closePanel();
    expect(openerRight()).toBe("0px");
  });

  it("toggling closed also resets the offset — the opener button's own click path", async () => {
    addOpenerButton();
    const { togglePanel } = await import("./mount");

    togglePanel(); // opens
    togglePanel(); // closes
    expect(openerRight()).toBe("0px");
  });

  it("reopening after a close re-applies the open offset", async () => {
    addOpenerButton();
    const { openPanel, closePanel, PANEL_WIDTH_PX } = await import("./mount");

    openPanel();
    closePanel();
    openPanel();
    expect(openerRight()).toBe(`${PANEL_WIDTH_PX}px`);
  });
});
