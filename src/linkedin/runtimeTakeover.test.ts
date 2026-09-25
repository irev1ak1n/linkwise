// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { claimRuntime } from "./runtimeTakeover";

describe("claimRuntime", () => {
  it("tears down the previous instance but not the new one", () => {
    const first = vi.fn();
    const second = vi.fn();
    claimRuntime(first);
    const release = claimRuntime(second);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    release();
  });

  it("stops listening once released", () => {
    const onReplaced = vi.fn();
    const release = claimRuntime(onReplaced);
    release();
    claimRuntime(() => {})();
    expect(onReplaced).not.toHaveBeenCalled();
  });
});
