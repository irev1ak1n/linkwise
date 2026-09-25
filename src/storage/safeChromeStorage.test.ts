import { afterEach, describe, expect, it, vi } from "vitest";
import { safeStorageGet, safeStorageRemove, safeStorageSet } from "./safeChromeStorage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeStorageGet", () => {
  it("reads normally when the context is valid", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "abc" },
      storage: { local: { get: vi.fn().mockResolvedValue({ foo: "bar" }) } },
    });
    expect(await safeStorageGet("foo")).toEqual({ foo: "bar" });
  });

  it("returns an empty object without calling chrome.storage at all when the context is already invalid", async () => {
    const get = vi.fn();
    vi.stubGlobal("chrome", { runtime: {}, storage: { local: { get } } });
    expect(await safeStorageGet("foo")).toEqual({});
    expect(get).not.toHaveBeenCalled();
  });

  it("returns an empty object rather than throwing when the call itself rejects with context invalidated", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "abc" },
      storage: { local: { get: vi.fn().mockRejectedValue(new Error("Extension context invalidated.")) } },
    });
    await expect(safeStorageGet("foo")).resolves.toEqual({});
  });

  it("still throws a genuine, unrelated error rather than hiding it", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "abc" },
      storage: { local: { get: vi.fn().mockRejectedValue(new Error("QuotaExceededError")) } },
    });
    await expect(safeStorageGet("foo")).rejects.toThrow("QuotaExceededError");
  });
});

describe("safeStorageSet", () => {
  it("writes normally when the context is valid", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { runtime: { id: "abc" }, storage: { local: { set } } });
    await safeStorageSet({ foo: "bar" });
    expect(set).toHaveBeenCalledWith({ foo: "bar" });
  });

  it("does nothing when the context is already invalid, no thrown error either", async () => {
    const set = vi.fn();
    vi.stubGlobal("chrome", { runtime: {}, storage: { local: { set } } });
    await expect(safeStorageSet({ foo: "bar" })).resolves.toBeUndefined();
    expect(set).not.toHaveBeenCalled();
  });

  it("swallows a context-invalidated rejection instead of leaving an unhandled rejection", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "abc" },
      storage: { local: { set: vi.fn().mockRejectedValue(new Error("Extension context invalidated.")) } },
    });
    await expect(safeStorageSet({ foo: "bar" })).resolves.toBeUndefined();
  });

  it("still throws a genuine, unrelated error", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "abc" },
      storage: { local: { set: vi.fn().mockRejectedValue(new Error("Something else broke")) } },
    });
    await expect(safeStorageSet({ foo: "bar" })).rejects.toThrow("Something else broke");
  });
});

describe("safeStorageRemove", () => {
  it("does nothing when the context is already invalid", async () => {
    const remove = vi.fn();
    vi.stubGlobal("chrome", { runtime: {}, storage: { local: { remove } } });
    await safeStorageRemove("foo");
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes normally when the context is valid", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { runtime: { id: "abc" }, storage: { local: { remove } } });
    await safeStorageRemove("foo");
    expect(remove).toHaveBeenCalledWith("foo");
  });
});
