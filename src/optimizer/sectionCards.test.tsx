// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SectionCards, SectionPage, type SectionContext } from "./SectionPages";
import { getOptimizerPage, openOptimizerPage, subscribeOptimizerPage } from "./optimizerNav";
import { DETAIL_SECTIONS, SECTION_GUIDANCE } from "./sectionGuidance";
import { EMPTY_PROFILE } from "../models/profile";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const context: SectionContext = {
  profileKey: "jordan-rivera",
  shell: { isOwnProfile: true, hasPhoto: true, hasBanner: false, sections: {}, connections: "500+", openToWork: "not_shown" },
  profile: { ...EMPTY_PROFILE, headline: "Student developer", extracted: true },
  body: null,
  overall: [],
};

function Overview() {
  const page = useSyncExternalStore(subscribeOptimizerPage, getOptimizerPage);
  return page.name === "section" ? <SectionPage section={page.section} context={context} /> : <SectionCards context={context} />;
}

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  openOptimizerPage({ name: "home" });
});

describe("overview rows", () => {
  it("open their own detail page, and Back to Profile Optimizer returns to the list", () => {
    act(() => root.render(<Overview />));
    DETAIL_SECTIONS.forEach((section, index) => {
      const row = container.querySelectorAll<HTMLButtonElement>(".lw-opt-card")[index]!;
      act(() => row.click());
      expect(getOptimizerPage()).toEqual({ name: "section", section });
      expect(container.querySelector(".lw-od-title")?.textContent).toBe(SECTION_GUIDANCE[section].title);
      act(() => Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Back to Profile Optimizer"))!.click());
      expect(container.querySelectorAll(".lw-opt-card")).toHaveLength(18);
    });
  });
});
