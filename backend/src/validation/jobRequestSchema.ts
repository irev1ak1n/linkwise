import { z } from "zod";

// A whole job posting is long, but not unbounded: past this the rest is boilerplate.
export const MAX_JOB_DESCRIPTION = 24000;
const MAX_COMPANY_TEXT = 8000;

export const jobAnalysisRequestSchema = z.object({
  job: z.object({
    jobId: z.string().min(1).max(80),
    title: z.string().max(300).default(""),
    company: z.string().max(300).default(""),
    // The lines of the posting's top card: location, posted date, workplace and employment chips.
    headerLines: z.array(z.string().max(300)).max(40).default([]),
    description: z.string().min(1).max(MAX_JOB_DESCRIPTION),
    companyText: z.string().max(MAX_COMPANY_TEXT).default(""),
  }),
  // The criteria the user is looking for; empty means only the posting itself is analyzed.
  criteria: z
    .array(z.object({ id: z.string().min(1).max(120), label: z.string().min(1).max(400), importance: z.enum(["MUST_HAVE", "PREFERRED", "OPTIONAL", "EXCLUDED"]) }))
    .max(30)
    .default([]),
});

export type JobAnalysisRequest = z.infer<typeof jobAnalysisRequestSchema>;
