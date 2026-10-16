import { z } from "zod";
import type { CompareProfileRequest } from "../validation/compareRequestSchema";

export const compareResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      factsChanged: z.boolean(),
      significance: z.enum(["none", "minor", "meaningful", "major"]),
      direction: z.enum(["improved", "changed", "weaker"]),
      title: z.string(),
      explanation: z.string(),
      previousValue: z.string(),
      currentValue: z.string(),
    }),
  ),
});

export type CompareResponse = z.infer<typeof compareResponseSchema>;

export const COMPARE_SYSTEM_PROMPT = `You compare two versions of the same text from one person's LinkedIn profile for LinkWise. For each item, decide whether the underlying factual meaning changed, not whether the wording changed.

Not a change (factsChanged false, significance "none" or "minor"):
- paraphrases, synonyms, reordered sentences or bullets, punctuation, spelling, formatting;
- the same facts said differently ("Built a website serving 300+ students" vs "Designed and developed a website used by more than 300 students");
- a number that is in both texts but with a different value: ignore it, those are compared separately. A new fact that happens to include a number still counts.

A change (factsChanged true):
- "meaningful": a new responsibility, scope, technology, audience, accomplishment or role detail, or one that was dropped ("Built a staff dashboard" vs "Built a staff dashboard that let advisers add, edit and remove student content");
- "major": a change of role, field or professional direction (for example a headline moving from software engineering to product management).

For a change also return:
- direction: "improved" when the person now shows more (added responsibility, accomplishment, skill), "weaker" when something meaningful was dropped, "changed" when it is different rather than more or less;
- title: at most 8 words naming the change, for example "New responsibility" or "Shifted focus to product management";
- explanation: one short sentence describing what is new or gone, using only facts from the two texts;
- previousValue / currentValue: short exact quotes copied from the previous / current text that show the change, or "" when that side has nothing relevant.

For no change, return empty strings for title, explanation and both values.
Return one result per item id. Never invent facts that are in neither text.`;

export function buildCompareUserPrompt(request: CompareProfileRequest): string {
  return JSON.stringify(
    request.items.map((item) => ({ id: item.id, section: item.section, entry: item.context, previous: item.previous, current: item.current })),
    null,
    2,
  );
}
