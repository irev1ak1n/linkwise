// What a posting states plainly, read without AI: pay, workplace, employment type, restrictions,
// benefits, skills, and the lists under its headings. Every fact keeps the sentence it came from.
// This is the floor the AI reading builds on, and all that shows when the AI is unavailable. Nothing
// here guesses: a fact that is not in the text is left out, never filled in.
import type { JobCompensation, JobFinding, JobPosting, WorkplaceType } from "./jobTypes";

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** Sentences and bullet lines of a block of text, trimmed. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9$(])/))
    .map((part) => clean(part.replace(/^[\s•·▪●○◦*\-–—]+/, "")))
    .filter((part) => part.length > 1);
}

const finding = (text: string, evidence: string): JobFinding => ({ text, evidence: evidence.slice(0, 320) });

// ---- header ---------------------------------------------------------------------------------

const WORKPLACE: [RegExp, WorkplaceType][] = [
  [/\bhybrid\b/i, "hybrid"],
  [/\bremote\b/i, "remote"],
  [/\bon-?\s?site\b|\bin[- ]office\b|\bin-person\b/i, "on-site"],
];
const EMPLOYMENT: [RegExp, string][] = [
  [/\bintern(ship)?\b/i, "Internship"],
  [/\bpart[- ]time\b/i, "Part-time"],
  [/\bfull[- ]time\b/i, "Full-time"],
  [/\bcontract(or)?\b/i, "Contract"],
  [/\btemporary\b|\btemp\b/i, "Temporary"],
  [/\bvolunteer\b/i, "Volunteer"],
  [/\bapprentice(ship)?\b/i, "Apprenticeship"],
];
const LEVEL = /\b(entry level|associate|mid[- ]senior level|senior level|director|executive)\b/i;
const POSTED = /\b(?:reposted\s+|posted\s+)?(\d+\s+(?:minute|hour|day|week|month)s?\s+ago)\b/i;
const APPLICANTS = /\b((?:over\s+)?\d[\d,]*\+?\s+(?:people clicked apply|applicants?|people))\b/i;

export interface HeaderFacts {
  location: string | null;
  workplaceType: WorkplaceType | null;
  employmentType: string | null;
  experienceLevel: string | null;
  postedDate: string | null;
  applicants: string | null;
}

function workplaceIn(text: string): WorkplaceType | null {
  return WORKPLACE.find(([re]) => re.test(text))?.[1] ?? null;
}

// The top card is short and structured, so a hit here is trusted over one buried in the description.
export function parseHeader(lines: string[], title: string, description: string): HeaderFacts {
  const header = lines.map(clean).filter(Boolean);
  const meta = header.find((line) => line.includes("·") && (POSTED.test(line) || APPLICANTS.test(line) || /,/.test(line)));
  const rawLocation = meta ? clean(meta.split("·")[0]!) : (header.find((line) => /^[A-Z][\w .'-]+,\s*[A-Z][\w .'-]+/.test(line) && line.length < 60) ?? null);
  const location = rawLocation ? rawLocation.replace(/\s*\((on-?site|hybrid|remote)\)\s*$/i, "") : null;
  const chips = header.filter((line) => line.length <= 24);
  const fromHeader = header.map(workplaceIn).find(Boolean) ?? null;
  // "Remote" or "hybrid" in the description counts only when it describes this job's arrangement.
  const inDescription = sentencesOf(description).find((s) => /\b(this (is a|role is|position is)|work(ing)? (is|will be)|located|position)\b/i.test(s) && workplaceIn(s));
  const employment = chips.map((line) => EMPLOYMENT.find(([re]) => re.test(line))?.[1]).find(Boolean) ?? EMPLOYMENT.find(([re]) => re.test(title))?.[1] ?? null;
  const level = header.join(" ").match(LEVEL)?.[1];
  return {
    location: location && location.length > 1 ? location : null,
    workplaceType: fromHeader ?? (inDescription ? workplaceIn(inDescription) : null),
    employmentType: employment,
    experienceLevel: level ?? null,
    postedDate: header.join(" ").match(POSTED)?.[1] ?? null,
    applicants: header.join(" ").match(APPLICANTS)?.[1] ?? null,
  };
}

// ---- compensation ---------------------------------------------------------------------------

const CUR = String.raw`(\$|USD\s?|US\$|€|£|CAD\s?|C\$)`;
const CUR_NC = String.raw`(?:\$|USD\s?|US\$|€|£|CAD\s?|C\$)`;
const UNIT = String.raw`(hour|hr|year|yr|annum|annual(?:ly)?|month|week|day)\b`;
// 1 currency, 2 amount, 3 K, 4 unit, then an optional "to" amount: 5 amount, 6 K, 7 unit. "$28/hr - $31/hr" and "$28-31 per hour" both fit.
const MONEY = new RegExp(String.raw`${CUR}\s?(\d[\d,]*(?:\.\d+)?)\s*([kK])?(?:\s*(?:\/|per\s+|an?\s+|each\s+)\s*${UNIT})?(?:\s*(?:-|–|—|to|and)\s*(?:${CUR_NC}\s?)?(\d[\d,]*(?:\.\d+)?)\s*([kK])?(?:\s*(?:\/|per\s+|an?\s+|each\s+)\s*${UNIT})?)?`, "i");
const PAY_CONTEXT = /\b(pay|salary|compensation|wage|rate|range|hourly|annual|stipend|base|earn|paid|per hour|per year)\b|\/\s?(hr|hour|yr|year)\b/i;
const OTHER_PAY = /\b(bonus|commission|stipend|equity|stock options?|sign-?on|relocation (bonus|package)|tips)\b/i;
const CURRENCY: Record<string, string> = { $: "USD", usd: "USD", "us$": "USD", "€": "EUR", "£": "GBP", cad: "CAD", "c$": "CAD" };

function periodOf(word: string | undefined, sentence: string): JobCompensation["period"] {
  const w = (word ?? "").toLowerCase();
  if (/^(hour|hr)/.test(w)) return "hour";
  if (/^(year|yr|annum|annual)/.test(w)) return "year";
  if (w === "month") return "month";
  if (w === "week") return "week";
  if (w === "day") return "day";
  if (/\bhourly\b|per hour/i.test(sentence)) return "hour";
  if (/\bannual(ly)?\b|per year|salary/i.test(sentence)) return "year";
  return null;
}

export function parseCompensation(text: string): JobCompensation | null {
  const sentences = sentencesOf(text);
  const other: JobFinding[] = [];
  let main: JobCompensation | null = null;
  for (const sentence of sentences) {
    const match = MONEY.exec(sentence);
    if (!match) continue;
    if (OTHER_PAY.test(sentence) && !PAY_CONTEXT.test(sentence.replace(OTHER_PAY, ""))) {
      other.push(finding(sentence.slice(0, 140), sentence));
      continue;
    }
    if (main || !(PAY_CONTEXT.test(sentence) || match[4] || match[7])) continue;
    const scale = (digits: string | undefined, k: string | undefined) => (digits ? Number(digits.replace(/,/g, "")) * (k ? 1000 : 1) : null);
    const first = scale(match[2], match[3]);
    // "$28 - $31" and "$28-31" both mean 28 to 31; the K of the second number applies to the first.
    const second = scale(match[5], match[6] ?? (match[3] && match[5] ? match[3] : undefined));
    const min = first !== null && second !== null ? Math.min(first, second) : first;
    const max = first !== null && second !== null ? Math.max(first, second) : first;
    main = { min, max, currency: CURRENCY[match[1]!.trim().toLowerCase()] ?? null, period: periodOf(match[7] ?? match[4], sentence), rawText: sentence.slice(0, 240), other: [] };
  }
  if (main) return { ...main, other };
  return other.length > 0 ? { min: null, max: null, currency: null, period: null, rawText: "", other } : null;
}

// ---- restrictions ---------------------------------------------------------------------------

const RESTRICTIONS: [string, RegExp][] = [
  ["Work authorization", /\b(authorized to work|work authorization|legally authorized|eligible to work|right to work)\b/i],
  ["Citizenship", /\b(u\.?s\.? citizens?|citizenship|permanent residents?|green card)\b/i],
  ["Sponsorship", /\b(sponsorship|sponsor (a |your )?visa|visa sponsor)\b/i],
  ["Age requirement", /\b(18\+|at least 18|18 years|over 18|21\+|at least 21|must be (18|21))\b/i],
  ["Security clearance", /\b(security clearance|clearance|ts\/sci|secret clearance)\b/i],
  ["Relocation", /\b(relocat\w+)\b/i],
  ["Travel", /\b(travel\w*)\b[^.]{0,60}\d+\s?%|\b\d+\s?%[^.]{0,30}travel|\bwilling to travel|\brequires? travel/i],
  ["Driver's license", /\b(driver'?s? licen[sc]e|valid licen[sc]e)\b/i],
  ["Schedule", /\b(night shifts?|weekends?|on[- ]call|overnight|rotating shifts?|holidays)\b/i],
  ["Enrollment", /\b(currently (enrolled|pursuing)|must be (a )?(current )?student|enrolled in)\b/i],
  ["Graduation date", /\b(graduat\w+)\b[^.]{0,60}\b(20\d{2})\b|\b(20\d{2})\b[^.]{0,40}\bgraduat/i],
  ["Minimum GPA", /\bgpa\b|\bgrade point/i],
  ["Unpaid", /\bunpaid\b|\bno compensation\b|\bvolunteer (basis|position)\b/i],
  ["Physical requirements", /\b(lift(ing)?\s+\d+|physical(ly)? (demand|requirement|able)|stand(ing)? for)\b/i],
  ["Background check", /\b(background check|drug (test|screen)|background screening)\b/i],
  ["In-office", /\b(\d days? (a|per) week (in|on)[- ]?(office|site)|in[- ]office (requirement|presence))\b/i],
];

export function findRestrictions(text: string): JobFinding[] {
  const found: JobFinding[] = [];
  for (const sentence of sentencesOf(text)) {
    for (const [label, re] of RESTRICTIONS) {
      if (re.test(sentence) && !found.some((f) => f.text === label)) found.push(finding(label, sentence));
    }
  }
  return found;
}

// ---- benefits -------------------------------------------------------------------------------

const BENEFITS: [string, RegExp][] = [
  ["Health insurance", /\b(health (insurance|coverage|plan)|medical|dental|vision (insurance|coverage|plan))\b/i],
  ["401(k)", /\b401\s?\(?k\)?\b|retirement (plan|savings)/i],
  ["Tuition assistance", /\btuition\b|education (assistance|reimbursement)/i],
  ["Paid time off", /\b(paid time off|pto|paid (vacation|holidays|leave)|vacation days)\b/i],
  ["Parental leave", /\bparental leave|maternity|paternity\b/i],
  ["Relocation assistance", /\brelocation (assistance|package|support|stipend|bonus)\b/i],
  ["Flexible schedule", /\bflexible (schedule|hours|working|work arrangement)\b/i],
  ["Remote work option", /\b(work from home|remote work|remote[- ]friendly)\b/i],
  ["Employee discounts", /\bemployee (discount|stock)|discounts?\b/i],
  ["Equity / stock", /\b(equity|stock options?|rsus?|espp)\b/i],
  ["Bonus", /\b(sign-?on bonus|annual bonus|performance bonus|bonus eligible|bonus)\b/i],
  ["Paid internship", /\bpaid (internship|intern)\b/i],
  ["Housing", /\b(housing (stipend|assistance|provided)|corporate housing)\b/i],
  ["Professional development", /\b(professional development|learning budget|training budget|mentorship)\b/i],
];

export function findBenefits(text: string): JobFinding[] {
  const found: JobFinding[] = [];
  for (const sentence of sentencesOf(text)) {
    // "Unpaid" and "no benefits" lines are restrictions, not perks.
    if (/\bunpaid\b|\bno benefits\b|\bnot (eligible|offer)/i.test(sentence)) continue;
    for (const [label, re] of BENEFITS) {
      if (re.test(sentence) && !found.some((f) => f.text === label)) found.push(finding(label, sentence));
    }
  }
  return found;
}

// ---- skills ---------------------------------------------------------------------------------

const TECHNICAL: [string, RegExp][] = [
  ["Python", /\bpython\b/i], ["Java", /\bjava\b(?!\s?script)/i], ["JavaScript", /\bjavascript\b|\bjs\b/i], ["TypeScript", /\btypescript\b/i],
  ["C++", /\bc\+\+/i], ["C#", /\bc#/i], ["Go", /\bgolang\b|\b(?:in|with|using|and|or|of) Go\b(?! (?:to|ahead|on|for|beyond))/], ["Rust", /\brust\b/i], ["SQL", /\bsql\b|\bmysql\b|\bpostgres(ql)?\b/i],
  ["React", /\breact(\.?js)?\b/i], ["Angular", /\bangular\b/i], ["Vue", /\bvue(\.?js)?\b/i], ["Node.js", /\bnode(\.?js)?\b/i],
  ["AWS", /\baws\b|\bamazon web services\b/i], ["Azure", /\bazure\b/i], ["GCP", /\bgcp\b|\bgoogle cloud\b/i], ["Docker", /\bdocker\b/i], ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["Git", /\bgit(hub|lab)?\b/i], ["Linux", /\blinux\b|\bunix\b/i], ["REST APIs", /\brest(ful)?\b|\bapis?\b/i], ["GraphQL", /\bgraphql\b/i], [".NET", /\.net\b/i],
  ["HTML/CSS", /\bhtml\b|\bcss\b/i], ["Machine learning", /\bmachine learning\b|\btensorflow\b|\bpytorch\b/i], ["Data analysis", /\bdata analy(sis|tics)\b|\btableau\b|\bpower bi\b/i],
  ["Excel", /\bexcel\b/i], ["CI/CD", /\bci\/cd\b|\bjenkins\b|\bgithub actions\b/i], ["Agile", /\bagile\b|\bscrum\b/i], ["Terraform", /\bterraform\b/i], ["PHP", /\bphp\b/i], ["Swift", /\bswift\b/i], ["Kotlin", /\bkotlin\b/i],
  ["Object-oriented programming", /\bobject[- ]oriented\b|\boop\b/i], ["Testing", /\b(unit|integration) test(s|ing)?\b|\bdebug(ging)?\b/i],
];
const PROFESSIONAL: [string, RegExp][] = [
  ["Communication", /\bcommunicat\w+\b/i], ["Leadership", /\bleadership\b|\bleading\b/i], ["Teamwork", /\bteam ?work\b|\bcollaborat\w+\b|\bteam player\b/i],
  ["Problem solving", /\bproblem[- ]solving\b|\bsolve (complex )?problems\b/i], ["Time management", /\btime management\b|\bprioritiz\w+\b/i],
  ["Attention to detail", /\battention to detail\b|\bdetail[- ]oriented\b/i], ["Customer service", /\bcustomer service\b|\bcustomer[- ]facing\b/i], ["Adaptability", /\badaptab\w+\b|\bfast[- ]paced\b/i],
];

function skillsIn(text: string, list: [string, RegExp][]): JobFinding[] {
  const found: JobFinding[] = [];
  const sentences = sentencesOf(text);
  for (const [name, re] of list) {
    const sentence = sentences.find((s) => re.test(s));
    if (sentence) found.push(finding(name, sentence));
  }
  return found;
}

export const technicalSkillsIn = (text: string) => skillsIn(text, TECHNICAL);
export const professionalSkillsIn = (text: string) => skillsIn(text, PROFESSIONAL);

// ---- sections -------------------------------------------------------------------------------

export type SectionKind = "responsibilities" | "required" | "preferred" | "benefits" | "other";

const HEADINGS: [SectionKind, RegExp][] = [
  ["preferred", /\b(preferred|nice to have|a plus|bonus points|desired|ideal(ly)?|extra credit)\b/i],
  ["responsibilities", /\b(responsibilit\w+|what you.?ll do|what you will do|your role|the role|day[- ]to[- ]day|duties|key accountabilit\w+|in this role|what you.?ll be doing|you will)\b/i],
  ["required", /\b(minimum|basic|required|requirements?|qualifications?|what you.?ll bring|what you bring|who you are|must[- ]have|what we.?re looking for|skills|you have)\b/i],
  ["benefits", /\b(benefits|perks|what we offer|we offer|total rewards|compensation)\b/i],
];

function headingKind(line: string): SectionKind | null {
  const text = clean(line).replace(/[:：]$/, "");
  if (text.length === 0 || text.length > 70 || /[.!?]$/.test(text)) return null;
  if (text.split(" ").length > 9) return null;
  return HEADINGS.find(([, re]) => re.test(text))?.[1] ? HEADINGS.find(([, re]) => re.test(text))![0] : /^[A-Z][A-Za-z&/' ,-]+$/.test(text) && text.split(" ").length <= 5 ? "other" : null;
}

/** The bullet lines under each heading of the description: what the posting itself groups together. */
export function sectionLists(description: string): Record<Exclude<SectionKind, "other">, JobFinding[]> {
  const lists: Record<Exclude<SectionKind, "other">, JobFinding[]> = { responsibilities: [], required: [], preferred: [], benefits: [] };
  let current: SectionKind = "other";
  for (const raw of description.split(/\n+/)) {
    const line = clean(raw);
    if (!line) continue;
    const kind = headingKind(line);
    const isBullet = /^[•·▪●○◦*\-–—]/.test(raw.trim());
    if (kind && !isBullet) {
      current = kind;
      continue;
    }
    if (current === "other") continue;
    for (const item of line.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
      const text = clean(item.replace(/^[•·▪●○◦*\-–—]\s*/, ""));
      if (text.length >= 12 && text.length <= 320) lists[current].push(finding(text.length > 140 ? `${text.slice(0, 137)}…` : text, text));
    }
  }
  return lists;
}

/** Industry, size, and headquarters, only as LinkedIn's company section states them. */
export function parseCompanyFacts(companyText: string): { industry: string | null; size: string | null; headquarters: string | null; followers: string | null } {
  const lines = companyText.split(/\n+/).map(clean).filter(Boolean);
  const size = companyText.match(/\b(\d[\d,]*(?:\+|-\d[\d,]*)?\s+(?:employees|on linkedin))/i)?.[1] ?? null;
  const sizeLine = lines.find((line) => /\bemployees\b/i.test(line) && line.length < 60);
  const followers = companyText.match(/\b(\d[\d,.]*[KkMm]?\s+followers)\b/i)?.[1] ?? null;
  const industry = lines.find((line) => line.length < 50 && /^[A-Z][A-Za-z&,/ -]+$/.test(line) && !/followers|employees|following|more|about|photos|linkedin/i.test(line) && lines.indexOf(line) <= 6 && lines.indexOf(line) >= 2) ?? null;
  const headquarters = companyText.match(/\bheadquarters?:?\s*([A-Z][\w .'-]+,\s*[A-Z][\w .'-]+)/i)?.[1] ?? null;
  return { industry, size: sizeLine && /\d/.test(sizeLine) ? (sizeLine.match(/\d[\d,]*(?:\+|-\d[\d,]*)?\s+employees/i)?.[0] ?? size) : size, headquarters, followers };
}

/** Everything the posting states plainly. */
export function readPostingFacts(posting: JobPosting) {
  const text = `${posting.description}\n${posting.companyText}`;
  const lists = sectionLists(posting.description);
  return {
    header: parseHeader(posting.headerLines, posting.title, posting.description),
    compensation: parseCompensation(`${posting.headerLines.join("\n")}\n${posting.description}`),
    restrictions: findRestrictions(posting.description),
    benefits: [...findBenefits(posting.description)],
    technical: technicalSkillsIn(posting.description),
    professional: professionalSkillsIn(posting.description),
    lists,
    company: parseCompanyFacts(posting.companyText),
    text,
  };
}
