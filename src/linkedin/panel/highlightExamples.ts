// Generic LinkedIn-style sentences for each highlight category's Live Preview. [Brackets] mark the
// words that category highlights. Made up on purpose: never anyone's real profile.
import type { HighlightRuleId } from "./settingsNav";

export const HIGHLIGHT_EXAMPLES: Record<HighlightRuleId, string[]> = {
  roles: [
    "Promoted to [Senior Software Engineer] after leading the platform migration.",
    "[Founder & CEO] · Brightpath Learning · Full-time",
    "Joined as a [Research Assistant] in the university's robotics lab.",
    "[President] of the Computer Science Club, elected by 60 members.",
    "Previously a [Product Design Intern] on the mobile payments team.",
  ],
  numbers: [
    "Built an internal dashboard used by [4,000+ students] across the school.",
    "Grew annual sponsorship revenue to [$25,000] for the student nonprofit.",
    "Coordinated a volunteer team of [40 people] for the citywide food drive.",
    "Cut page load times by [60%] after rewriting the image pipeline.",
    "Logged [300+ hours] of tutoring over three school years.",
  ],
  impact: [
    "[Reduced processing time by 35%] and improved reporting accuracy.",
    "Redesigned onboarding, [raising week-one retention from 42% to 58%].",
    "Automated invoice matching, [saving the finance team ten hours a week].",
    "[Helped 120 families access free tax filing] through the community clinic.",
    "Launched a referral program that [doubled monthly sign-ups].",
  ],
  leadership: [
    "[Led a five-person development team] through the product launch.",
    "[Mentored six junior analysts] through their first reporting cycle.",
    "[Organized a 300-attendee regional hackathon] with local sponsors.",
    "[Taught weekly Python workshops] for first-year students.",
    "[Managed the club's budget and recruiting] as vice president.",
  ],
  skills: [
    "Comfortable in [Python], [Java], and [C++] for coursework and research.",
    "Built the frontend with [React] and [TypeScript], styled with [Tailwind CSS].",
    "Deployed services on [AWS] with [PostgreSQL] and [Redis] behind them.",
    "Developed the backend using [Python], [PostgreSQL], [Docker], and [AWS].",
    "Analyzed survey data in [R] and [Excel], then presented findings in [Tableau] to the district board.",
  ],
  achievements: [
    "[Placed 2nd at the regional competition] and qualified for the state conference.",
    "[Named a National Merit Semifinalist] in the fall of junior year.",
    "[Selected for a summer research program] with a 4% acceptance rate.",
    "[Earned the AWS Certified Cloud Practitioner credential].",
    "[Won Best Use of Data] among 80 teams at the university hackathon.",
  ],
  projects: [
    "[Built and deployed a full-stack scheduling platform] for student organizations.",
    "[Designed a low-cost air quality sensor] and published the build guide.",
    "[Created a Chrome extension] that summarizes long course readings.",
    "[Developed a mobile app for tracking volunteer hours] used by local schools.",
    "[Shipped a recommendation engine] for the campus bookstore's website.",
  ],
  languages: [
    "Works professionally in [English] and [Russian] with conversational [Spanish].",
    "[French] — Full professional proficiency",
    "[Mandarin Chinese] — Native or bilingual proficiency",
    "Translated volunteer materials from [English] into [Portuguese].",
    "[German] — Elementary proficiency",
  ],
  keywords: [
    "Mentored students in [Python] during weekly after-school sessions.",
    "Captain of the [robotics] team at the regional championship.",
    "Organized a [volunteer] cleanup with the environmental club.",
    "Presented a [machine learning] project at the spring science fair.",
  ],
};

export interface ExampleSegment {
  text: string;
  marked: boolean;
}

export function exampleSegments(sentence: string): ExampleSegment[] {
  return sentence
    .split(/(\[[^\]]+\])/)
    .filter((part) => part.length > 0)
    .map((part) => (part.startsWith("[") ? { text: part.slice(1, -1), marked: true } : { text: part, marked: false }));
}
