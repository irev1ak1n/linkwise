// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionPage, NOTE_PLACEHOLDER, type SectionContext } from "./SectionPages";
import { DETAIL_SECTIONS, SECTION_GUIDANCE } from "./sectionGuidance";
import { EMPTY_PROFILE } from "../models/profile";
import { SECTION_NOTES_STORAGE_KEY, composeUserContext, sectionNotesPreference, setSectionNote } from "./sectionNotes";

const stored: Record<string, unknown> = {};
const set = vi.fn((items: Record<string, unknown>) => {
  Object.assign(stored, items);
  return Promise.resolve();
});

beforeEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
  set.mockClear();
  vi.stubGlobal("chrome", { runtime: { id: "test" }, storage: { local: { get: () => Promise.resolve({}), set }, onChanged: { addListener: () => {} } } });
  sectionNotesPreference.set({});
  set.mockClear();
});

const context = (overrides: Partial<SectionContext> = {}): SectionContext => ({
  profileKey: "me",
  shell: { isOwnProfile: true, hasPhoto: true, hasBanner: true, sections: {} },
  profile: { ...EMPTY_PROFILE, headline: "Student developer", extracted: true },
  body: null,
  overall: [],
  ...overrides,
});

describe("Missed something?", () => {
  it("appears on every detail page with its own prompt, a Save button only once there is something to save", () => {
    for (const section of DETAIL_SECTIONS) {
      const html = renderToStaticMarkup(<SectionPage section={section} context={context()} />);
      expect(html).toContain("Missed something?");
      expect(html).toContain("Add anything LinkWise couldn&#x27;t find on your profile.");
      expect(html).toContain(`placeholder="${NOTE_PLACEHOLDER[section].replace(/'/g, "&#x27;")}"`);
      expect(html).not.toContain("Save and update analysis");
      // The note sits after the checklist and the advice, directly above the action area.
      expect(html.indexOf("How to improve")).toBeLessThan(html.indexOf("Missed something?"));
    }
    expect(Object.keys(NOTE_PLACEHOLDER).sort()).toEqual([...DETAIL_SECTIONS].sort());
  });

  it("keeps a note per profile and section, saving locally with no request", () => {
    setSectionNote("me", "skills", "Python, C++, C#, React, SQL, Blender");
    setSectionNote("someone-else", "skills", "Not mine");
    expect(sectionNotesPreference.getState().value).toEqual({ me: { skills: "Python, C++, C#, React, SQL, Blender" }, "someone-else": { skills: "Not mine" } });
    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls[0]![0]).toHaveProperty([SECTION_NOTES_STORAGE_KEY]);
    setSectionNote("me", "skills", "   ");
    expect(sectionNotesPreference.getState().value.me).toEqual({});
  });

  it("shows a saved note as the user's own, and how to make it visible once the analysis has answered", () => {
    setSectionNote("me", "skills", "Python, C++, React");
    const assessment = { section: "skills" as const, state: "improve" as const, impact: "high" as const, reason: "You said Python and React are part of your work, but they are not in your Skills section yet.", sourceType: "user_context" as const, evidenceIds: [], suggestions: ["Add Python and React to Skills.", "Mention them in the Experience entry that used them."] };
    const html = renderToStaticMarkup(<SectionPage section="skills" context={context({ overall: [assessment] })} />);
    expect(html).toContain("Python, C++, React");
    expect(html).toContain("This is your own note, not something LinkWise found.");
    expect(html).toContain("How to make this visible");
    expect(html).toContain("You said Python and React");
    expect(html).toContain("Mention them in the Experience entry");
    // A review that did not use the note says nothing about it.
    const fromProfile = { ...assessment, sourceType: "linkedin_profile" as const };
    expect(renderToStaticMarkup(<SectionPage section="skills" context={context({ overall: [fromProfile] })} />)).not.toContain("How to make this visible");
    expect(renderToStaticMarkup(<SectionPage section="skills" context={context({ analyzing: true })} />)).toContain("Updating your assessment…");
  });
});

describe("composeUserContext", () => {
  it("is the general context alone when there are no notes, exactly as before", () => {
    expect(composeUserContext("  I know Rust ", undefined)).toBe("I know Rust");
    expect(composeUserContext("", {})).toBe("");
  });

  it("labels each note by section, in profile order, after the general context", () => {
    const text = composeUserContext("I know Rust", { skills: "Python, C++", featured: "A robotics project", experience: "Led a team of 4" });
    expect(text).toBe(`I know Rust\n\n[${SECTION_GUIDANCE.featured.title}] A robotics project\n\n[${SECTION_GUIDANCE.experience.title}] Led a team of 4\n\n[${SECTION_GUIDANCE.skills.title}] Python, C++`);
  });

  it("stays under the request limit by dropping whole trailing notes, never cutting one", () => {
    const general = "x".repeat(1900);
    const text = composeUserContext(general, { featured: "A robotics project", skills: "Python ".repeat(30).trim() });
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toContain("[Featured] A robotics project");
    expect(text).not.toContain("Python");
  });
});
