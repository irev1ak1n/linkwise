import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isContextInvalidatedError, isExtensionContextValid, watchForContextInvalidation } from "./extensionContext";

describe("isExtensionContextValid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true when chrome.runtime.id is a real string", () => {
    vi.stubGlobal("chrome", { runtime: { id: "abcdefg" } });
    expect(isExtensionContextValid()).toBe(true);
  });

  it("is false when chrome itself is undefined", () => {
    vi.stubGlobal("chrome", undefined);
    expect(isExtensionContextValid()).toBe(false);
  });

  it("is false when chrome.runtime is undefined (the exact 'reading onChanged of undefined' precondition, one level up)", () => {
    vi.stubGlobal("chrome", {});
    expect(isExtensionContextValid()).toBe(false);
  });

  it("is false when chrome.runtime.id is undefined", () => {
    vi.stubGlobal("chrome", { runtime: {} });
    expect(isExtensionContextValid()).toBe(false);
  });

  it("is false rather than throwing when reading chrome.runtime.id itself throws", () => {
    vi.stubGlobal("chrome", {
      runtime: {
        get id(): string {
          throw new Error("Extension context invalidated.");
        },
      },
    });
    expect(() => isExtensionContextValid()).not.toThrow();
    expect(isExtensionContextValid()).toBe(false);
  });
});

describe("isContextInvalidatedError", () => {
  it("recognizes Chrome's own error message", () => {
    expect(isContextInvalidatedError(new Error("Extension context invalidated."))).toBe(true);
  });

  it("recognizes the message as a plain string too", () => {
    expect(isContextInvalidatedError("Extension context invalidated.")).toBe(true);
  });

  it("does not misclassify an unrelated error, a genuine bug must never be hidden by this", () => {
    expect(isContextInvalidatedError(new Error("Cannot read properties of null (reading 'foo')"))).toBe(false);
  });

  it("handles a non-Error, non-string rejection reason without throwing", () => {
    expect(() => isContextInvalidatedError({ some: "object" })).not.toThrow();
    expect(isContextInvalidatedError({ some: "object" })).toBe(false);
  });
});

describe("watchForContextInvalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not fire while the context stays valid", () => {
    vi.stubGlobal("chrome", { runtime: { id: "abc" } });
    const onInvalidated = vi.fn();
    watchForContextInvalidation(onInvalidated, 1000);
    vi.advanceTimersByTime(5000);
    expect(onInvalidated).not.toHaveBeenCalled();
  });

  it("fires once the context becomes invalid", () => {
    vi.stubGlobal("chrome", { runtime: { id: "abc" } });
    const onInvalidated = vi.fn();
    watchForContextInvalidation(onInvalidated, 1000);
    vi.advanceTimersByTime(1000);
    expect(onInvalidated).not.toHaveBeenCalled();

    vi.stubGlobal("chrome", undefined);
    vi.advanceTimersByTime(1000);
    expect(onInvalidated).toHaveBeenCalledTimes(1);
  });

  it("fires only once even if the context stays invalid for a long time", () => {
    vi.stubGlobal("chrome", undefined);
    const onInvalidated = vi.fn();
    watchForContextInvalidation(onInvalidated, 1000);
    vi.advanceTimersByTime(10000);
    expect(onInvalidated).toHaveBeenCalledTimes(1);
  });

  it("stops checking once unsubscribed", () => {
    vi.stubGlobal("chrome", { runtime: { id: "abc" } });
    const onInvalidated = vi.fn();
    const unsubscribe = watchForContextInvalidation(onInvalidated, 1000);
    unsubscribe();
    vi.stubGlobal("chrome", undefined);
    vi.advanceTimersByTime(10000);
    expect(onInvalidated).not.toHaveBeenCalled();
  });
});
