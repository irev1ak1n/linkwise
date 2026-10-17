// Static guidance for the Profile Optimizer's section pages: short, actionable steps written for
// LinkWise. Official LinkedIn Help is the source wherever it covers a topic; the only numbers used
// are ones LinkedIn documents (the banner and photo sizes, the custom URL length). Personalized
// assessment never comes from this file, only from the checklist evaluating the profile.
import { SECTION_GROUPS, type OptimizerSection } from "./sections";

export interface SectionGuidance {
  title: string;
  description: string;
  /** Three to six short, actionable steps. */
  howToImprove: string[];
  /** The recommendation when the section is absent. Conditional, so it claims nothing about the person. */
  missing: string;
  sources: string[];
}

const HELP = (id: string) => `https://www.linkedin.com/help/linkedin/answer/${id}`;
const PROFILE_HELP = HELP("a554351");

export const SECTION_GUIDANCE: Record<OptimizerSection, SectionGuidance> = {
  photo: {
    title: "Profile Photo",
    description: "Your photo helps people recognize you and makes your profile feel credible.",
    howToImprove: [
      "Use a recent photo where your face is clear and fills most of the frame.",
      "Choose a plain background that doesn't compete with you.",
      "Use a photo of yourself only: no logos, groups, or other people.",
      "Upload at least 400 × 400 pixels so it stays sharp.",
      "Check the crop inside LinkedIn's circular frame.",
    ],
    missing: "Add a clear, recent photo of yourself so people can recognize your profile.",
    sources: [HELP("a1377087"), HELP("a549049")],
  },
  banner: {
    title: "Banner",
    description: "The background image at the top of your profile can reinforce what you do.",
    howToImprove: [
      "Use an image related to your field, your work, or your interests.",
      "Keep it simple, with little or no text.",
      "Keep important details away from the lower-left area your photo covers.",
      "Use 1584 × 396 pixels so it isn't stretched or blurred.",
      "Preview it on a phone, where more of it is covered.",
    ],
    missing: "Your profile shows LinkedIn's default background. If you have an image that reflects your field or work, a custom banner can make the top of your profile more distinctive.",
    sources: [HELP("a568217"), HELP("a549049")],
  },
  headline: {
    title: "Headline",
    description: "The line under your name: the fastest way to say what you do and what you're known for.",
    howToImprove: [
      "Lead with your role or the direction you're working toward.",
      "Add one or two specialties people would search for.",
      "Mention what sets you apart, if it fits.",
      "Prefer concrete nouns over adjectives like \"passionate\".",
      "Keep it readable: a phrase, not a keyword list.",
    ],
    missing: "Add a headline: a short line about what you do or the direction you're working toward.",
    sources: [PROFILE_HELP],
  },
  about: {
    title: "About",
    description: "Your own summary of who you are, what you focus on, and what you've done.",
    howToImprove: [
      "Open with who you are and what you're working toward.",
      "Back it up with what you've built, led, or achieved.",
      "Include a result with a number when you have one.",
      "Say what makes your background different.",
      "Keep it scannable with short paragraphs.",
    ],
    missing: "If you add a few sentences about your focus and strongest experience, readers get context before the details.",
    sources: [PROFILE_HELP],
  },
  featured: {
    title: "Featured",
    description: "Posts, links, and media you choose to show near the top of your profile.",
    howToImprove: [
      "Add work that shows your strongest abilities.",
      "Consider projects, portfolio links, articles, awards, or presentations.",
      "Put the strongest, most relevant item first.",
      "Remove items that are outdated or no longer open.",
    ],
    missing: "Add a Featured section if you have projects, articles, portfolio work, awards, or other work worth showcasing.",
    sources: ["https://www.linkedin.com/learning/linkedin-quick-tips-2022/feature-your-work"],
  },
  experience: {
    title: "Experience",
    description: "The roles you've held and what you did in them.",
    howToImprove: [
      "Lead with what you built or owned.",
      "Include measurable results when they're meaningful.",
      "Name the important tools and technologies.",
      "Explain your own contribution, not only the team's.",
      "Keep descriptions short and specific.",
    ],
    missing: "If you have jobs, internships, volunteer roles, or other positions, listing them gives readers the core of your background.",
    sources: [HELP("a593695")],
  },
  education: {
    title: "Education",
    description: "Your schools and programs, with anything that adds useful context.",
    howToImprove: [
      "List the program, degree, or field where you have one.",
      "Add activities or organizations that support your direction.",
      "Include honors or achievements when they're relevant.",
      "Use the description for specifics, not general statements.",
    ],
    missing: "If you have relevant schooling or programs, adding them gives readers useful context.",
    sources: [PROFILE_HELP],
  },
  projects: {
    title: "Projects",
    description: "Work you've built or led, with what it does and how you made it.",
    howToImprove: [
      "Say what the project does and why you built it.",
      "Make your own part clear.",
      "Name the technologies you used.",
      "State a result: who used it or what it achieved.",
      "Link a demo or repository when you can.",
    ],
    missing: "Add a Projects section if you have projects that demonstrate relevant work.",
    sources: [PROFILE_HELP],
  },
  skills: {
    title: "Skills",
    description: "The skills you want people and search to associate with you.",
    howToImprove: [
      "List the skills you actually use, most relevant first.",
      "Prefer specific skills over very general ones.",
      "Connect skills to the roles, projects, or education where you used them.",
    ],
    missing: "If you have skills you use in your work, listing them helps readers and search find you.",
    sources: [HELP("a549047"), HELP("a593695")],
  },
  certifications: {
    title: "Licenses & Certifications",
    description: "Credentials you've earned, with who issued them.",
    howToImprove: [
      "Use the credential's exact name.",
      "Add the issuing organization and the date.",
      "Add a credential ID or link when the issuer provides one.",
      "Keep the ones that support your direction prominent.",
    ],
    missing: "If you have relevant certifications or licenses, adding them could strengthen your credibility.",
    sources: [PROFILE_HELP],
  },
  volunteering: {
    title: "Volunteer Experience",
    description: "Causes you support and the work you did for them.",
    howToImprove: [
      "Name the organization and your role.",
      "Describe what you did, not only where.",
      "Mention who you helped or what changed.",
    ],
    missing: "If you have volunteered, adding it could give readers more context about you.",
    sources: [PROFILE_HELP],
  },
  honors: {
    title: "Honors & Awards",
    description: "Recognition such as awards, scholarships, and competition results.",
    howToImprove: ["Use the award's exact name.", "Say who gave it and what it recognized.", "Add the date when it helps."],
    missing: "If you have received awards, scholarships, or competition results, adding them could highlight your achievements.",
    sources: [PROFILE_HELP],
  },
  organizations: {
    title: "Organizations",
    description: "Clubs, associations, and teams you belong to.",
    howToImprove: ["Name your role or membership status.", "Highlight leadership positions.", "Add what you contributed when it's notable."],
    missing: "If you belong to clubs, associations, or teams, adding them could show where you are involved.",
    sources: [PROFILE_HELP],
  },
  languages: {
    title: "Languages",
    description: "The languages you can work in, and how well.",
    howToImprove: ["List each language you can work in.", "Add a proficiency level for each.", "Keep one entry per language."],
    missing: "If you speak more than one language, listing them could be useful to readers.",
    sources: [PROFILE_HELP],
  },
  location: {
    title: "Location",
    description: "Where you're based, which helps people and local search find you.",
    howToImprove: ["Show a city or metro area rather than only a country.", "Keep it current when you move."],
    missing: "If you add your city or region, readers know where you are based.",
    sources: [PROFILE_HELP],
  },
  url: {
    title: "LinkedIn URL",
    description: "Your public profile address, the link you share on résumés and email signatures.",
    howToImprove: [
      "Claim a custom URL in your public profile settings.",
      "Use your name, or a recognizable version of it.",
      "Leave out the long number LinkedIn adds by default.",
      "Custom URLs can be 3–100 letters or numbers, without spaces or symbols.",
    ],
    missing: "LinkWise couldn't read your profile URL.",
    sources: [HELP("a542685")],
  },
  openToWork: {
    title: "Open to Work",
    description: "Lets recruiters, or everyone, know you're looking, with the roles and places you want.",
    howToImprove: [
      "Turn it on only if you're looking for opportunities.",
      "Add the job titles and locations you actually want.",
      "Choose who sees it: recruiters only, or all LinkedIn members.",
      "Recruiters-only keeps it off your public profile and photo.",
    ],
    missing: "Open to Work is optional. Use it when you want recruiters to know you're looking.",
    sources: [HELP("a507508"), HELP("a566495")],
  },
  network: {
    title: "Network",
    description: "The people you're connected to, who make your profile easier to find and recommend.",
    howToImprove: [
      "Connect with people you know and trust: classmates, colleagues, mentors.",
      "Add a short note when you send an invitation.",
      "Follow people you'd like to learn from instead of connecting.",
      "Avoid mass invitations to people you don't know.",
    ],
    missing: "LinkWise couldn't read your connection count.",
    sources: [HELP("a545734"), HELP("a541669")],
  },
};

// Every section has its own detail page, in the overview's order.
export const DETAIL_SECTIONS: OptimizerSection[] = SECTION_GROUPS.flatMap((group) => group.sections);

// Numbers static guidance may use, each one documented by LinkedIn itself.
export const DOCUMENTED_NUMBERS = ["400 × 400", "1584 × 396", "3–100"];
