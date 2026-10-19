// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScanModeToggle } from "./ScanModeToggle";
import type { ScanMode } from "./scanModeStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function render(mode: ScanMode, onChange = vi.fn()) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<ScanModeToggle mode={mode} onChange={onChange} />));
  return onChange;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const options = () => [...container.querySelectorAll<HTMLButtonElement>('[role="radiogroup"] [role="radio"]')];

describe("ScanModeToggle", () => {
  it("offers only Analyze as I scroll and Auto scan profile, as real text over the art", async () => {
    await render("auto");
    expect(options().map((b) => b.textContent)).toEqual(["Analyze as I scroll", "Auto scan profile"]);
    expect(container.querySelector(".lw-sm__title")!.textContent).toBe("Scan mode");
    expect(container.querySelector(".lw-sm__subtitle")!.textContent).toBe("Choose how LinkWise analyzes the profile.");
    expect(container.querySelector("img.lw-sm__art")!.getAttribute("alt")).toBe("");
    expect(container.textContent).not.toContain("Auto scroll");
  });

  it.each([
    ["scroll", 0],
    ["auto", 1],
  ] as const)("marks only the %s card selected, with the check on it", async (mode, index) => {
    await render(mode);
    expect(options().map((b) => b.getAttribute("aria-checked"))).toEqual(index === 0 ? ["true", "false"] : ["false", "true"]);
    expect(container.querySelectorAll(".lw-sm__check")).toHaveLength(1);
    expect(options()[index]!.querySelector(".lw-sm__check")).not.toBeNull();
    expect(options()[index]!.classList.contains("is-selected")).toBe(true);
  });

  it("switches mode from either card", async () => {
    const onChange = await render("auto");
    await act(async () => options()[0]!.click());
    expect(onChange).toHaveBeenLastCalledWith("scroll");
    await act(async () => options()[1]!.click());
    expect(onChange).toHaveBeenLastCalledWith("auto");
  });
});
