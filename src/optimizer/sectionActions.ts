// The detail page's footer actions: always LinkedIn's own pages and controls, which LinkWise
// only opens or scrolls to. It never edits anything or calls private APIs.
import { findOpenToControl, findProfileSection, type ProfileShell } from "../linkedin/profileAdapter";
import type { ProfileSectionName } from "../models/profile";
import { goToTopCardPart, openLinkedInEditor } from "./topCardActions";
import type { OptimizerSection } from "./sections";

export interface SectionAction {
  label: string;
  /** False when the target isn't on this page. */
  run: () => boolean;
}

const DETAILS_SLUG: Partial<Record<OptimizerSection, string>> = {
  experience: "experience",
  education: "education",
  projects: "projects",
  skills: "skills",
  certifications: "certifications",
  volunteering: "volunteering-experiences",
  honors: "honors",
  organizations: "organizations",
  languages: "languages",
};

const ADD_SECTION = /^(add section|add profile section)$/i;

function open(url: string): boolean {
  window.location.assign(url);
  return true;
}

function scrollTo(element: HTMLElement | null): boolean {
  element?.scrollIntoView({ behavior: "smooth", block: "start" });
  return !!element;
}

function clickAddSection(doc: Document): boolean {
  const control = Array.from(doc.querySelectorAll<HTMLElement>("main button, main a")).find((el) => ADD_SECTION.test((el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim()));
  control?.click();
  return !!control;
}

export function sectionActions(section: OptimizerSection, options: { profileKey: string | null; present: boolean; shell?: ProfileShell }, page?: Document): SectionAction[] {
  // Resolved only when an action runs, so building the list needs no page.
  const doc = () => page ?? document;
  if (section === "photo" || section === "banner" || section === "headline") {
    const name = section === "photo" ? "profile photo" : section;
    return [
      { label: `Go to ${name}`, run: () => goToTopCardPart(section, doc()) },
      { label: "Edit on LinkedIn", run: () => openLinkedInEditor(section, doc()) },
    ];
  }
  if (section === "location") {
    return [
      { label: "Go to intro", run: () => goToTopCardPart("headline", doc()) },
      { label: "Edit on LinkedIn", run: () => openLinkedInEditor("headline", doc()) },
    ];
  }
  if (section === "url") return [{ label: "Edit on LinkedIn", run: () => open(options.shell?.publicProfileSettingsUrl ?? "https://www.linkedin.com/public-profile/settings/") }];
  if (section === "openToWork") {
    return [
      { label: "Go to Open to", run: () => scrollTo(findOpenToControl(doc().querySelector<HTMLElement>("main") ?? doc().body)) },
      {
        label: "Edit on LinkedIn",
        run: () => {
          const control = findOpenToControl(doc().querySelector<HTMLElement>("main") ?? doc().body);
          control?.click();
          return !!control;
        },
      },
    ];
  }
  if (section === "network") return [{ label: "View connections", run: () => open("https://www.linkedin.com/mynetwork/invite-connect/connections/") }];

  if (!options.present) return [{ label: "Add on LinkedIn", run: () => clickAddSection(doc()) }];
  const name = section as ProfileSectionName | "featured";
  const slug = DETAILS_SLUG[section];
  return [
    { label: "Go to section", run: () => scrollTo(findProfileSection(name, doc())) },
    {
      label: "Edit on LinkedIn",
      run: () => {
        const pencil = findProfileSection(name, doc())?.querySelector<HTMLElement>('a[href*="/edit/"], a[href*="/add-edit/"], button[aria-label^="Edit" i]');
        if (pencil) {
          pencil.click();
          return true;
        }
        return slug && options.profileKey ? open(`https://www.linkedin.com/in/${options.profileKey}/details/${slug}/`) : false;
      },
    },
  ];
}
