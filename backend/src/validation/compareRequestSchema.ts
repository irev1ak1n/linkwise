import { z } from "zod";

export const MAX_COMPARE_ITEMS = 20;
const MAX_TEXT_LENGTH = 3000;

export const COMPARE_SECTIONS = ["headline", "about", "experience", "education", "projects", "certifications", "organizations", "volunteering", "honors"] as const;

export const compareProfileRequestSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        section: z.enum(COMPARE_SECTIONS),
        context: z.string().max(300).default(""),
        previous: z.string().max(MAX_TEXT_LENGTH),
        current: z.string().max(MAX_TEXT_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_COMPARE_ITEMS),
});

export type CompareProfileRequest = z.infer<typeof compareProfileRequestSchema>;
