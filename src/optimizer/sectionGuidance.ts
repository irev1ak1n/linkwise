// Static expert guidance for the Profile Optimizer's section pages, written for LinkWise from the
// recurring advice in the sources below (LinkedIn's own Help Center first when they disagree).
// Personalized analysis is separate: it comes from the profile, never from this file.
import type { OptimizerSection } from "./sections";

export interface SectionGuidance {
  title: string;
  description: string;
  checklist: string[];
  bestPractices: string[];
  aiCapable: boolean;
  sources: string[];
}

export const SECTION_GUIDANCE: Partial<Record<OptimizerSection, SectionGuidance>> = {
  photo: {
    title: "Profile Photo",
    description: "Your profile photo is one of the first things people notice and helps make your profile recognizable and credible.",
    checklist: [
      "Use a clear, recent photo of yourself",
      "Make sure your face is easy to see and fills most of the frame",
      "Choose a simple background that doesn't compete with you",
      "Pick an image that matches how you want to present yourself professionally",
      "Avoid group photos or crops where it's unclear which person is you",
      "Check that the crop still works inside LinkedIn's circular frame",
    ],
    bestPractices: [
      "LinkedIn treats a photo as a credibility signal and reports that members with one can get up to twice as many profile views.",
      "LinkedIn requires the photo to show your own likeness: logos, landscapes, pets, text, or other people's images aren't allowed.",
      "Approachable and professional usually works better than overly formal or overly casual; dress the way you would for the work you want.",
      "A well-lit phone photo against a plain wall is fine. Expensive headshots are optional.",
    ],
    aiCapable: false,
    sources: [
      "https://www.linkedin.com/help/linkedin/answer/a541850",
      "https://www.linkedin.com/help/linkedin/answer/a1377087",
      "https://www.linkedin.com/help/linkedin/answer/a554351",
      "https://www.linkedin.com/blog/member/product/student-job-seekers-tips-to-building-the-perfect-linkedin-profile",
    ],
  },
  banner: {
    title: "Banner",
    description: "Your banner is the background image at the top of your LinkedIn profile and can reinforce your professional identity.",
    checklist: [
      "Replace LinkedIn's default background with your own image",
      "Make it relevant to your field, work, interests, or personal brand",
      "Keep it visually clean, with little or no text",
      "Keep important details away from the lower-left area your photo covers",
      "Use a sharp, high-quality image (LinkedIn recommends 1584 × 396 pixels)",
      "Keep colors and style consistent with the impression you want to give",
    ],
    bestPractices: [
      "LinkedIn suggests images that reflect your personality, your team, or a career milestone.",
      "Examples, not rules: engineers often use project imagery or subtle technical designs, designers show their own work, and students show their school, field, or interests.",
      "If you add text, keep it to a short line people can read on a phone.",
      "Preview the banner on mobile, where more of it is covered or cropped.",
    ],
    aiCapable: false,
    sources: [
      "https://www.linkedin.com/help/linkedin/answer/a568217",
      "https://www.linkedin.com/help/linkedin/answer/a552504",
      "https://www.careerflow.ai/blog/linkedin-banner",
    ],
  },
  headline: {
    title: "Headline",
    description:
      "Your headline appears directly under your name and is one of the fastest ways to communicate what you do, what you specialize in, and what you want to be known for.",
    checklist: [
      "Clearly state your current role or the direction you're targeting",
      "Include a few relevant skills or specialties",
      "Use keywords people would realistically search for",
      "Show what sets you apart when space allows",
      "Add an accomplishment only when it adds real credibility",
      "Avoid vague filler like \"hardworking\" or \"motivated\"",
      "Don't stuff it with too many unrelated keywords",
      "Keep it readable for people, not just search",
      "Make sure every claim is accurate",
    ],
    bestPractices: [
      "The headline is a major search field, so recognizable role and skill terms help people find you.",
      "Put the most important words first; previews in search and invitations often show only the beginning.",
      "One useful pattern is Role or direction | Specialty | Differentiator, but it's an option, not a formula.",
      "Nouns beat adjectives: \"Full-stack web developer\" says more than \"driven, passionate innovator\".",
      "Students can lead with their target field and real skills or projects rather than only their school status.",
      "You have up to 220 characters, but a focused headline usually reads better than a full one.",
    ],
    aiCapable: true,
    sources: [
      "https://www.linkedin.com/help/linkedin/answer/a554351",
      "https://resumeworded.com/linkedin-review/linkedin-headline-examples-for-students",
      "https://www.tealhq.com/post/linkedin-headlines-for-job-seekers",
      "https://www.jobscan.co/blog/impactful-linkedin-headline-examples/",
    ],
  },
};

// Sections with their own detail page, in Prev / Next order.
export const DETAIL_SECTIONS: OptimizerSection[] = ["photo", "banner", "headline"];
