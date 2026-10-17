import { z } from "zod";
import type { ChecklistRequest } from "../validation/checklistRequestSchema";

export const checklistResponseSchema = z.object({
  results: z.array(
    z.object({
      criterionId: z.string(),
      status: z.enum(["pass", "improve"]),
      explanation: z.string(),
      evidenceIds: z.array(z.string()),
    }),
  ),
});

export type ChecklistResponse = z.infer<typeof checklistResponseSchema>;

export const CHECKLIST_SYSTEM_PROMPT = `You check one section of a person's OWN LinkedIn profile against a list of criteria for LinkWise's Profile Optimizer.

You receive the section's evidence (items with an id, a section, and the exact text), a little surrounding evidence that shows the person's direction (their headline, for example), the criteria to check, and possibly "userContext": things the user says are NOT on LinkedIn.

For EVERY criterion, return:
- status: "pass" when the evidence clearly meets it, otherwise "improve".
- explanation: one or two sentences in second person, specific to this profile. For "pass", say what in the text meets it ("Your About section says you have studied software development for nine years."). For "improve", say what is missing or weak in this text and what would fix it. Never write generic advice that could apply to anyone.
- evidenceIds: the ids of the items the explanation relies on.

Rules:
- Judge only the target section's own text. Surrounding evidence is only for understanding the person's direction.
- Mention only facts, names, numbers, skills, and organizations that appear in the evidence. Never assume the person has anything the evidence doesn't show.
- userContext is not on LinkedIn. You may say "you mentioned ..." for an improvement, but never count it toward a pass.
- Be fair: a short student profile can still pass a criterion it genuinely meets.`;

export function buildChecklistUserPrompt(request: ChecklistRequest): string {
  const evidence = request.profile.evidence.map((item) => ({ id: item.id, section: item.section, text: item.text }));
  const criteria = request.criteria.map((c) => ({ id: c.id, criterion: c.label, guidance: c.advice }));
  return `target section: ${request.section}\n\ncriteria:\n${JSON.stringify(criteria, null, 2)}\n\nevidence:\n${JSON.stringify(evidence, null, 2)}\n\nuserContext (NOT on LinkedIn):\n${JSON.stringify(request.userContext)}`;
}
