// Turns an entry's text lines into structured fields. A line's role comes from its position
// relative to the date line, and a candidate is rejected when it is clearly metadata.
import type { ProfileEducationEntry, ProfileExperienceEntry, ProfileListEntry } from "../models/profile";

export interface EntryLine {
  text: string;
  description?: boolean;
}

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const POINT = `(?:${MONTH}\\s+)?\\d{4}`;
const DATE_RANGE = new RegExp(`^${POINT}\\s*[-–—]\\s*(?:present|${POINT})$`, "i");
const SINGLE_DATE = new RegExp(`^${POINT}$`, "i");
const DURATION = /^(?:less than a year|\d+\+?\s*(?:yrs?|years?|mos?|months?)(?:\s+\d+\s*(?:mos?|months?))?)$/i;
const WORK_MODE = /^(?:remote|hybrid|on-site)$/i;
const EMPLOYMENT_TYPE = /^(?:full-time|part-time|self-employed|freelance|contract|internship|apprenticeship|seasonal|temporary)$/i;

function segments(text: string): string[] {
  return text.split("·").map((part) => part.trim()).filter(Boolean);
}

export function isDateLine(text: string): boolean {
  const first = segments(text)[0] ?? "";
  return DATE_RANGE.test(first) || SINGLE_DATE.test(first) || DURATION.test(first);
}

function isPlace(text: string): boolean {
  if (/\barea$/i.test(text)) return true;
  return text.length <= 80 && !/[\d:|•]/.test(text) && text.includes(",") && text.split(",").every((part) => /^\s*\p{Lu}/u.test(part));
}

export function isLocationLine(text: string): boolean {
  const parts = segments(text);
  return parts.length > 0 && parts.every((part) => WORK_MODE.test(part) || isPlace(part));
}

function isEmploymentType(text: string): boolean {
  const parts = segments(text);
  return parts.length > 0 && parts.every((part) => EMPLOYMENT_TYPE.test(part));
}

function isMetadata(text: string): boolean {
  return isDateLine(text) || isLocationLine(text) || isEmploymentType(text);
}

// "Acme · Full-time" is a company followed by its employment type.
function splitCompany(text: string): { company?: string; employmentType?: string } {
  const [company, ...rest] = segments(text);
  const type = rest.filter((part) => EMPLOYMENT_TYPE.test(part));
  return { company: company && !isMetadata(company) ? company : undefined, employmentType: type.length > 0 ? type.join(" · ") : undefined };
}

// A grouped employer's header is its name, then total duration and location.
export function groupCompany(header: EntryLine[]): string | undefined {
  const line = header.find((l) => !l.description && !isMetadata(l.text));
  return line ? splitCompany(line.text).company : undefined;
}

function joined(parts: string[]): string | undefined {
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function parseExperienceLines(lines: EntryLine[], employer?: string): ProfileExperienceEntry {
  const entry: ProfileExperienceEntry = {};
  const details: string[] = [];
  for (const { text, description } of lines) {
    if (description) details.push(text);
    else if (entry.title === undefined && !entry.dates && !isMetadata(text)) entry.title = text;
    else if (!entry.dates && isDateLine(text)) entry.dates = text;
    else if (!entry.dates && isEmploymentType(text)) entry.employmentType ??= text;
    else if (!entry.dates && !entry.company && !employer && !isMetadata(text)) Object.assign(entry, splitCompany(text));
    else if (entry.dates && !entry.location && isLocationLine(text)) entry.location = text;
    else details.push(text);
  }
  entry.company ??= employer;
  entry.description = joined(details);
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as ProfileExperienceEntry;
}

export function parseEducationLines(lines: EntryLine[]): ProfileEducationEntry {
  const entry: ProfileEducationEntry = {};
  const details: string[] = [];
  for (const { text, description } of lines) {
    if (description) details.push(text);
    else if (entry.school === undefined && !isDateLine(text)) entry.school = text;
    else if (!entry.dates && isDateLine(text)) entry.dates = text;
    else if (!entry.degree && !entry.dates) entry.degree = text;
    else details.push(text);
  }
  entry.description = joined(details);
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as ProfileEducationEntry;
}

export function parseListLines(lines: EntryLine[]): ProfileListEntry {
  const name = lines.find((line) => !line.description);
  const entry: ProfileListEntry = { name: name?.text, description: joined(lines.filter((line) => line !== name).map((line) => line.text)) };
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as ProfileListEntry;
}
