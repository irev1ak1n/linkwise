// Fixture content for the Live Preview on every highlight category's page: four miniature LinkedIn
// pieces (a post, an Experience entry, Skills, Education) with a fixed set of highlighted phrases.
// The preview shows what the style being edited looks like in many situations, so the phrases are
// the same on every page; only their style changes. Made-up people and text, never anyone's real
// profile, and never analyzed: these are design fixtures.

export interface PreviewSegment {
  text: string;
  highlighted?: true;
}

const h = (text: string): PreviewSegment => ({ text, highlighted: true });
const t = (text: string): PreviewSegment => ({ text });

export const PREVIEW_POST = {
  author: "Alex Chen",
  degree: "3rd",
  headline: "Software Engineer at Google",
  time: "2d",
  body: [
    t("Excited to share that I "),
    h("led the development"),
    t(" of a full-stack web application used by "),
    h("10,000+"),
    t(" students, improving engagement by "),
    h("40%"),
    t(". I worked with a "),
    h("team of 5"),
    t(" developers using "),
    h("React, Python, and AWS"),
    t(" to design and launch the platform. This project also earned "),
    h("1st place"),
    t(" at our regional hackathon."),
  ],
  reactions: "You and 124 others",
  comments: "8 comments",
};

export const PREVIEW_EXPERIENCE = {
  title: "Software Developer Intern",
  meta: "Microsoft · Jun 2024 – Aug 2024",
  bullets: [
    [t("Built and maintained internal tools used by "), h("500+"), t(" employees, improving workflow efficiency by "), h("30%"), t(".")],
    [t("Developed features using "), h("TypeScript, React, and Azure"), t(".")],
    [t("Collaborated with a "), h("team of 4"), t(" engineers across "), h("2 product teams"), t(".")],
  ],
};

export const PREVIEW_SKILLS: PreviewSegment[] = [t("Python"), t("C++"), t("React"), h("Node.js"), t("AWS"), t("Docker"), t("SQL"), t("Blender")];

export const PREVIEW_EDUCATION = {
  degree: "B.S. in Computer Science",
  meta: "Stanford University · 2024 – 2028",
  coursework: [t("Relevant coursework: "), h("AI"), t(", "), h("Machine Learning"), t(", Database Systems, Computer Vision")],
};
