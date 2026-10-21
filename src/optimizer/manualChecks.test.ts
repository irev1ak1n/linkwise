// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileShell } from "../linkedin/profileAdapter";
import { imageAssetId } from "../linkedin/profileAdapter";
import { MANUAL_CHECKS_STORAGE_KEY, currentAnswers, manualChecksPreference, setManualAnswer } from "./manualChecks";

const stored: Record<string, unknown> = {};
const set = vi.fn((items: Record<string, unknown>) => {
  Object.assign(stored, items);
  return Promise.resolve();
});

beforeEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
  set.mockClear();
  vi.stubGlobal("chrome", {
    runtime: { id: "test" },
    storage: { local: { get: (key: string) => Promise.resolve(key in stored ? { [key]: stored[key] } : {}), set }, onChanged: { addListener: () => {} } },
  });
  manualChecksPreference.set({});
  set.mockClear();
});

const shell = (photoId: string | null, bannerId: string | null = "BANNER1"): ProfileShell => ({ isOwnProfile: true, hasPhoto: true, hasBanner: true, sections: {}, photoId, bannerId });
const answers = (s: ProfileShell, key = "me") => currentAnswers(manualChecksPreference.getState().value, key, s);

describe("manual checks", () => {
  it("records, changes, and withdraws an answer, saving each change locally", () => {
    setManualAnswer("me", "photo-lighting", true, shell("PHOTO1"));
    expect(answers(shell("PHOTO1"))).toEqual({ "photo-lighting": true });
    setManualAnswer("me", "photo-lighting", false, shell("PHOTO1"));
    expect(answers(shell("PHOTO1"))).toEqual({ "photo-lighting": false });
    setManualAnswer("me", "photo-lighting", null, shell("PHOTO1"));
    expect(answers(shell("PHOTO1"))).toEqual({});
    expect(set).toHaveBeenCalledTimes(3);
    expect(set.mock.calls[0]![0]).toEqual({ [MANUAL_CHECKS_STORAGE_KEY]: { me: { "photo-lighting": { value: true, fingerprint: "PHOTO1" } } } });
  });

  it("keeps answers per profile", () => {
    setManualAnswer("me", "photo-face", true, shell("PHOTO1"));
    expect(answers(shell("PHOTO1"), "someone-else")).toEqual({});
  });

  it("asks again about a new photo, keeping the banner's answers", () => {
    setManualAnswer("me", "photo-face", true, shell("PHOTO1"));
    setManualAnswer("me", "banner-text", true, shell("PHOTO1"));
    expect(answers(shell("PHOTO2"))).toEqual({ "banner-text": true });
    // An unreadable image ID isn't evidence of a new photo.
    expect(answers(shell(null))).toEqual({ "photo-face": true, "banner-text": true });
  });

  it("accepts an answer for any checklist item, and ignores ids that aren't one", () => {
    setManualAnswer("me", "photo-present", true, shell("PHOTO1"));
    setManualAnswer("me", "not-a-check", true, shell("PHOTO1"));
    expect(answers(shell("PHOTO1"))).toEqual({ "photo-present": true });
  });
});

describe("imageAssetId", () => {
  it("reads the upload's ID, the same for every size and token", () => {
    const a = "https://media.licdn.com/dms/image/v2/D4E03AQGabc123XYZ/profile-displayphoto-shrink_200_200/profile-displayphoto-shrink_200_200/0/1700000000000?e=1&v=beta&t=AAA";
    const b = "https://media.licdn.com/dms/image/v2/D4E03AQGabc123XYZ/profile-displayphoto-shrink_400_400/profile-displayphoto-shrink_400_400/0/1700000000000?e=2&v=beta&t=BBB";
    expect(imageAssetId(a)).toBe("D4E03AQGabc123XYZ");
    expect(imageAssetId(b)).toBe(imageAssetId(a));
    expect(imageAssetId("https://static.licdn.com/aero-v1/sc/h/default-avatar.svg")).toBeNull();
    expect(imageAssetId(null)).toBeNull();
  });
});
