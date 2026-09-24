import { describe, expect, it, vi } from "vitest";
import { isPanelVisible, setPanelVisible, subscribePanelVisibility } from "./panelVisibilityStore";

describe("panelVisibilityStore", () => {
  it("starts false and reflects the last value set", () => {
    setPanelVisible(true);
    expect(isPanelVisible()).toBe(true);
    setPanelVisible(false);
    expect(isPanelVisible()).toBe(false);
  });

  it("notifies subscribers only when the value actually changes", () => {
    setPanelVisible(false);
    const listener = vi.fn();
    const unsubscribe = subscribePanelVisibility(listener);

    setPanelVisible(false); // no change
    expect(listener).not.toHaveBeenCalled();

    setPanelVisible(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setPanelVisible(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
