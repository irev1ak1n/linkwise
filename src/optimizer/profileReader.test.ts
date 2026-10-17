// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.linkedin.com/in/jordan-rivera/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readWholeProfile } from "./profileReader";
import { getProfileShell, setProfileShell } from "./profileShellStore";

beforeEach(() => {
  vi.useFakeTimers();
  setProfileShell(null);
  history.replaceState(null, "", "/in/jordan-rivera/");
  document.body.innerHTML = `<main><section><h1>Jordan Rivera</h1></section><section><h2>About</h2><p>Student developer</p></section></main>`;
});

afterEach(() => {
  vi.useRealTimers();
  setProfileShell(null);
});

describe("readWholeProfile", () => {
  it("marks the profile fully read once the page stops growing", async () => {
    const reading = readWholeProfile();
    await vi.runAllTimersAsync();
    await reading;
    expect(getProfileShell()).toMatchObject({ profileKey: "jordan-rivera", complete: true });
  });

  it("stops without recording anything when LinkedIn navigates to another page mid-read", async () => {
    const reading = readWholeProfile();
    history.pushState(null, "", "/in/sam-lee/");
    await vi.runAllTimersAsync();
    await reading;
    expect(getProfileShell()).toBeNull();
  });
});
