// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { JobHighlighter, jobHighlightName, type HighlightRegistryLike } from "./jobHighlighter";
import { highlightTargets } from "../../jobs/jobHighlightTargets";
import { buildJobAnalysis } from "../../jobs/jobAnalysis";
import type { JobPosting } from "../../jobs/jobTypes";

function setup(html: string) {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  const highlights = new Map<string, Range[]>();
  const registry: HighlightRegistryLike = { set: (name, h) => highlights.set(name, (h as unknown as { ranges: Range[] }).ranges), delete: (name) => highlights.delete(name) };
  const highlighter = new JobHighlighter(document, registry, (ranges) => ({ ranges }) as unknown as Highlight);
  return { highlights, highlighter, root: document.getElementById("root")! };
}
const texts = (ranges: Range[] | undefined) => (ranges ?? []).map((r) => r.toString());

describe("job highlighter", () => {
  it("marks only the quoted phrases, by category, without changing the page's markup", () => {
    const { highlights, highlighter, root } = setup("<p>We build things. Pay range: $28/hr - $31/hr. Must be authorized   to work in the United States.</p><p>Other text.</p>");
    const before = root.innerHTML;
    const found = highlighter.render(root, [
      { category: "salary", quote: "Pay range: $28/hr - $31/hr." },
      { category: "authorization", quote: "must be authorized to work in the united states" },
      { category: "skill", quote: "Not on this page" },
    ]);
    expect(found).toBe(2);
    expect(texts(highlights.get(jobHighlightName("salary")))).toEqual(["Pay range: $28/hr - $31/hr."]);
    expect(texts(highlights.get(jobHighlightName("authorization")))[0]).toMatch(/^Must be authorized\s+to work in the United States\.?$/);
    expect(root.innerHTML).toBe(before);
    expect(document.getElementById("lw-job-highlight-style")?.textContent).toContain("::highlight(linkwise-job-salary)");
  });

  it("is removable, re-renderable, and redraws when LinkedIn replaces the text", () => {
    const { highlights, highlighter, root } = setup("<p>Python experience is required for this role.</p>");
    const targets = [{ category: "required" as const, quote: "Python experience is required for this role." }];
    highlighter.render(root, targets);
    expect(highlights.size).toBe(1);
    expect(highlighter.stillValid()).toBe(true);
    root.innerHTML = "<p>Python experience is required for this role.</p>";
    expect(highlighter.stillValid()).toBe(false);
    expect(highlighter.render(root, targets)).toBe(1);
    highlighter.clear();
    expect(highlights.size).toBe(0);
  });

  it("builds targets from an analysis: the pay line, skills as single words, and each restriction in its own category", () => {
    const posting: JobPosting = { jobId: "1", url: "", title: "Intern", company: "Acme", headerLines: [], companyText: "", description: "Pay range: $28/hr - $31/hr. This is a hybrid role.\nMinimum Qualifications\n• Experience developing applications using Python.\n• Must be authorized to work in the United States." };
    const targets = highlightTargets(buildJobAnalysis(posting, null, null));
    expect(targets).toEqual(expect.arrayContaining([{ category: "salary", quote: "Pay range: $28/hr - $31/hr." }, { category: "skill", quote: "Python" }, { category: "authorization", quote: "Must be authorized to work in the United States." }]));
    expect(targets.find((t) => t.category === "required" && t.quote.includes("authorized"))).toBeUndefined();
  });
});
