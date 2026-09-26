import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SignalModeSection } from "./SignalModeSection";
import type { SignalAnalysisState } from "../../ai/signalAnalysisController";

function render(enabled: boolean, analysis: SignalAnalysisState, highlighted = 0): string {
  return renderToStaticMarkup(<SignalModeSection enabled={enabled} analysis={analysis} highlighted={highlighted} onChange={() => {}} />);
}

describe("SignalModeSection", () => {
  it("shows only the toggle when off", () => {
    const html = render(false, { status: "idle" });
    expect(html).toContain("Signal Mode");
    expect(html).not.toContain("lw-signals__status");
  });

  it("lists grounded facts compactly when ready", () => {
    const html = render(true, {
      status: "ready",
      profileKey: "jordan",
      signals: [],
      facts: [
        { text: "Led 4-person web team", evidenceId: "experience:0" },
        { text: "300+ visitors reached", evidenceId: "experience:0" },
      ],
    }, 2);
    expect(html).toContain("High-signal facts");
    expect(html).toContain("2 highlighted");
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it("states clearly when AI signal analysis is unavailable", () => {
    expect(render(true, { status: "unavailable", reason: "not_configured" })).toContain("AI signal analysis unavailable");
  });

  it("says so when a profile has no strong evidence", () => {
    expect(render(true, { status: "ready", profileKey: "sam", signals: [], facts: [] })).toContain("No strong evidence found");
  });
});
