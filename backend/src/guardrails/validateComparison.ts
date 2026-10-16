// Keeps only changes the two texts actually support: quotes must appear in their own text, and
// an explanation may not introduce numbers that neither text contains.
import type { CompareResponse } from "../openai/compareSchema";
import type { CompareProfileRequest } from "../validation/compareRequestSchema";

export type ComparisonResult =
  | { id: string; meaningful: false }
  | {
      id: string;
      meaningful: true;
      significance: "meaningful" | "major";
      direction: "improved" | "changed" | "weaker";
      title: string;
      explanation: string;
      previousValue: string;
      currentValue: string;
    };

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function quoted(value: string, source: string): string {
  const needle = normalize(value);
  return needle && normalize(source).includes(needle) ? value.trim().slice(0, 200) : "";
}

const numbers = (text: string) => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));

function numbersGrounded(text: string, sources: string): boolean {
  const known = new Set(numbers(sources));
  return numbers(text).every((n) => known.has(n));
}

export function validateComparison(response: CompareResponse, request: CompareProfileRequest): ComparisonResult[] {
  const items = new Map(request.items.map((item) => [item.id, item]));
  const results: ComparisonResult[] = [];
  const seen = new Set<string>();
  for (const result of response.results) {
    const item = items.get(result.id);
    if (!item || seen.has(result.id)) continue;
    seen.add(result.id);
    if (!result.factsChanged || result.significance === "none" || result.significance === "minor") {
      results.push({ id: result.id, meaningful: false });
      continue;
    }
    const previousValue = quoted(result.previousValue, item.previous);
    const currentValue = quoted(result.currentValue, item.current);
    const title = result.title.trim().slice(0, 80);
    // Nothing quotable from either text means the change cannot be shown to exist.
    if ((!previousValue && !currentValue) || !title) continue;
    const explanation = numbersGrounded(result.explanation, `${item.previous}\n${item.current}`) ? result.explanation.trim().slice(0, 300) : "";
    results.push({ id: result.id, meaningful: true, significance: result.significance, direction: result.direction, title, explanation, previousValue, currentValue });
  }
  return results;
}
