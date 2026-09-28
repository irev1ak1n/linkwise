import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AutoScrollControls } from "./AutoScrollControls";
import type { AutoScrollStatus } from "../autoScrollController";
import type { AutoScrollSpeed } from "./autoScrollSpeedPreference";

function render(status: AutoScrollStatus, speed: AutoScrollSpeed = 1, analyzing = false): string {
  return renderToStaticMarkup(<AutoScrollControls speed={speed} status={status} analyzing={analyzing} onSpeedChange={() => {}} onPause={() => {}} onResume={() => {}} />);
}

describe("AutoScrollControls", () => {
  it("shows the chosen speed on the slider", () => {
    const html = render("idle", 0.75);
    expect(html).toContain("0.75x");
    expect(html).toContain('value="1"');
    expect(html).not.toContain("Pause");
  });

  it("offers Pause while scrolling and Resume while paused", () => {
    expect(render("running")).toContain("Pause");
    expect(render("running")).toContain("Auto scrolling");
    expect(render("paused")).toContain("Resume");
  });

  it("shows Analyzing while the final analysis runs, then Complete", () => {
    expect(render("complete", 1, true)).toContain("Analyzing…");
    const html = render("complete");
    expect(html).toContain("Complete");
    expect(html).not.toContain("<button");
  });
});
