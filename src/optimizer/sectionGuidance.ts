// Static expert guidance for the Profile Optimizer's section pages, written for LinkWise from the
// recurring advice in the sources below (LinkedIn's own Help Center first when they disagree).
// Personalized analysis is separate: it comes from the profile, never from this file.
import { OPTIMIZER_SECTIONS, type OptimizerSection } from "./sections";

export interface SectionGuidance {
  title: string;
  description: string;
  bestPractices: string[];
  /** The recommendation when the section is absent. Conditional, so it claims nothing about the person. */
  missing: string;
  sources: string[];
}

export const SECTION_GUIDANCE: Record<OptimizerSection, SectionGuidance> = {
  photo: {
    title: "Profile Photo",
    description: "Your profile photo is one of the first things people notice and helps make your profile recognizable and credible.",
    bestPractices: [
      "LinkedIn treats a photo as a credibility signal and reports that members with one can get up to twice as many profile views.",
      "LinkedIn requires the photo to show your own likeness: logos, landscapes, pets, text, or other people's images aren't allowed.",
      "Approachable and professional usually works better than overly formal or overly casual; dress the way you would for the work you want.",
      "A well-lit phone photo against a plain wall is fine. Expensive headshots are optional.",
    ],
    sources: [
      "https://www.linkedin.com/help/linkedin/answer/a541850",
      "https://www.linkedin.com/help/linkedin/answer/a1377087",
      "https://www.linkedin.com/help/linkedin/answer/a554351",
      "https://www.linkedin.com/blog/member/product/student-job-seekers-tips-to-building-the-perfect-linkedin-profile",
    ],
    missing: "Add a clear, recent photo of yourself so people can recognize your profile.",
  },
  banner: {
    title: "Banner",
    description: "Your banner is the background image at the top of your LinkedIn profile and can reinforce your professional identity.",
    bestPractices: [
      "LinkedIn suggests images that reflect your personality, your team, or a career milestone.",
      "Examples, not rules: engineers often use project imagery or subtle technical designs, designers show their own work, and students show their school, field, or interests.",
      "If you add text, keep it to a short line people can read on a phone.",
      "Preview the banner on mobile, where more of it is covered or cropped.",
    ],
    sources: [
      "https://www.linkedin.com/help/linkedin/answer/a568217",
      "https://www.linkedin.com/help/linkedin/answer/a552504",
      "https://www.careerflow.ai/blog/linkedin-banner",
    ],
    missing: "Your profile shows LinkedIn's default background. If you have an image that reflects your field or work, a custom banner can make the top of your profile more distinctive.",
  },
  headline: {
    title: "Headline",
    description:
      "Your headline appears directly under your name and is one of the fastest ways to communicate what you do, what you specialize in, and what you want to be known for.",
    bestPractices: [
      "The headline is a major search field, so recognizable role and skill terms help people find you.",
      "Put the most important words first; previews in search and invitations often show only the beginning.",
      "One useful pattern is Role or direction | Specialty | Differentiator, but it's an option, not a formula.",
      "Nouns beat adjectives: \"Full-stack web developer\" says more than \"driven, passionate innovator\".",
      "Students can lead with their target field and real skills or projects rather than only their school status.",
      "You have up to 220 characters, but a focused headline usually reads better than a full one.",
    ],
    sources: [
      "https://www.linkedin.com/help/linkedin/answer/a554351",
      "https://resumeworded.com/linkedin-review/linkedin-headline-examples-for-students",
      "https://www.tealhq.com/post/linkedin-headlines-for-job-seekers",
      "https://www.jobscan.co/blog/impactful-linkedin-headline-examples/",
    ],
    missing: "Add a headline: a short line about what you do or the direction you're working toward.",
  },
  about: {
    title: "About",
    description: "Your About section is where you explain who you are, what you focus on, and what you've done, in your own words.",
    bestPractices: [
      "Open with your focus or direction; the first lines show before \"see more\".",
      "Back claims with specifics: what you built, led, or achieved.",
      "Write in first person and keep it readable on a phone.",
    ],
    missing: "If you add a few sentences about your focus and strongest experience, readers get context before the details.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  featured: {
    title: "Featured",
    description: "Featured shows the posts, links, and media you choose at the top of your profile.",
    bestPractices: [
      "Feature work samples people can open: projects, articles, websites, or demos.",
      "Keep only a few items so the strongest ones stand out.",
    ],
    missing: "If you have projects, articles, websites, demos, or other work samples, Featured could make them more visible.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  experience: {
    title: "Experience",
    description: "Experience is the core of your profile: the roles you've held and what you did in them.",
    bestPractices: [
      "Lead each description with your strongest result.",
      "Use short bullets with concrete actions, tools, and outcomes.",
      "Numbers such as people reached, time saved, or scale make impact easy to see.",
    ],
    missing: "If you have jobs, internships, volunteer roles, or other positions, listing them gives readers the core of your background.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  education: {
    title: "Education",
    description: "Education shows your schools and programs, and can surface coursework, activities, and achievements.",
    bestPractices: [
      "Include your degree or program and dates.",
      "Add activities, coursework, or achievements that support your direction.",
    ],
    missing: "If you have relevant schooling or programs, adding them gives readers useful context.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  projects: {
    title: "Projects",
    description: "Projects let you show work you've built or led, with what it does and how you made it.",
    bestPractices: [
      "Say what the project does and what you built yourself.",
      "Name the technologies you used.",
      "Mention a result: who used it or what it achieved.",
    ],
    missing: "Add a Projects section if you have projects that demonstrate relevant work.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  skills: {
    title: "Skills",
    description: "Skills help people and search understand what you can do.",
    bestPractices: [
      "List the skills you actually use, most relevant first.",
      "Prefer specific skills over very general ones.",
    ],
    missing: "If you have skills you use in your work, listing them helps readers and search find you.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  certifications: {
    title: "Licenses & Certifications",
    description: "Licenses and certifications show credentials you've earned.",
    bestPractices: [
      "Include the issuer and date.",
      "Add the credential ID or link when the issuer provides one.",
    ],
    missing: "If you have relevant certifications or licenses, adding them could strengthen your credibility.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  volunteering: {
    title: "Volunteer Experience",
    description: "Volunteer Experience shows causes you support and skills you use outside work.",
    bestPractices: [
      "Describe your role and what you did.",
      "Mention who you helped or what changed.",
    ],
    missing: "If you have volunteered, adding it could give readers more context about you.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  honors: {
    title: "Honors & Awards",
    description: "Honors & Awards highlights recognition such as awards, scholarships, and competition results.",
    bestPractices: [
      "Say who gave the award and what it recognized.",
    ],
    missing: "If you have received awards, scholarships, or competition results, adding them could highlight your achievements.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  organizations: {
    title: "Organizations",
    description: "Organizations shows clubs, associations, and teams you belong to.",
    bestPractices: [
      "Include your position or contribution in each organization.",
    ],
    missing: "If you belong to clubs, associations, or teams, adding them could show where you are involved.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  languages: {
    title: "Languages",
    description: "Languages shows the languages you can work in and how well.",
    bestPractices: [
      "Add a proficiency level for each language.",
    ],
    missing: "If you speak more than one language, listing them could be useful to readers.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
  location: {
    title: "Location",
    description: "Your location tells people where you're based and helps local search find you.",
    bestPractices: [
      "Use a city or metro area rather than only a country.",
    ],
    missing: "If you add your city or region, readers know where you are based.",
    sources: ["https://www.linkedin.com/help/linkedin/answer/a554351"],
  },
};

// Every section has its own detail page, in Prev / Next order.
export const DETAIL_SECTIONS: OptimizerSection[] = OPTIMIZER_SECTIONS.map((info) => info.section);
