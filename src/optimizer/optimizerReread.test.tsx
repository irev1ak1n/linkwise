// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { OptimizerView } from "./OptimizerView";
import { setProfileShell } from "./profileShellStore";
import { readWholeProfile } from "./profileReader";
import { EMPTY_PROFILE } from "../models/profile";

vi.mock("./profileReader", () => ({ readWholeProfile: vi.fn(() => Promise.resolve()) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const own = (complete: boolean) => ({ profileKey: "me", complete, shell: { isOwnProfile: true, hasPhoto: true, hasBanner: true, sections: {} } });

afterEach(() => setProfileShell(null));

describe("reading your own profile", () => {
  it("reads it again after another profile's reading replaced it", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const view = (profileKey: string | null) => <OptimizerView profileKey={profileKey} profile={{ ...EMPTY_PROFILE, extracted: true }} isFinal onAnalyzeNow={() => {}} />;

    setProfileShell(own(false));
    await act(async () => root.render(view("me")));
    expect(readWholeProfile).toHaveBeenCalledTimes(1);

    setProfileShell(own(true));
    setProfileShell({ profileKey: "someone", complete: true, shell: { isOwnProfile: false, hasPhoto: true, hasBanner: true, sections: {} } });
    await act(async () => root.render(view("someone")));

    setProfileShell(own(false));
    await act(async () => root.render(view("me")));
    expect(readWholeProfile).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });
});
