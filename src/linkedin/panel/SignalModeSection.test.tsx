import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SignalModeSection } from "./SignalModeSection";

function render(enabled: boolean, overrides: { keywords?: string; color?: "blue" | "yellow"; keywordColor?: "orange" | "violet"; highlighted?: number } = {}): string {
  return renderToStaticMarkup(
    <SignalModeSection
      enabled={enabled}
      highlighted={overrides.highlighted ?? 0}
      onChange={() => {}}
      keywords={overrides.keywords ?? ""}
      onKeywordsChange={() => {}}
      color={overrides.color ?? "blue"}
      onColorChange={() => {}}
      keywordColor={overrides.keywordColor ?? "orange"}
      onKeywordColorChange={() => {}}
    />,
  );
}

describe("SignalModeSection", () => {
  it("holds only the highlighting controls, never the analysis's facts", () => {
    const html = render(true, { highlighted: 12 });
    expect(html).toContain("Profile highlights");
    expect(html).toContain("Signal Mode");
    expect(html).toContain("Highlight color");
    expect(html).toContain("Highlight keywords");
    expect(html).not.toMatch(/High-signal facts|Key evidence/i);
    expect(html).toContain("12 passages highlighted on the profile.");
  });

  it("explains Signal Mode until it has highlighted something", () => {
    expect(render(false)).toContain("Highlight useful evidence directly on the profile.");
    expect(render(true)).toContain("Highlight useful evidence directly on the profile.");
  });

  it("offers the keyword input whether or not Signal Mode is on, showing the saved list", () => {
    for (const enabled of [false, true]) {
      const html = render(enabled, { keywords: "Python, TSA" });
      expect(html).toContain("Highlight keywords");
      expect(html).toContain("Python, TSA");
    }
  });

  it("offers the eight highlight colors with the chosen one marked, only while Signal Mode is on", () => {
    const html = render(true, { color: "yellow" });
    expect(html.match(/role="radio"/g)).toHaveLength(8);
    expect(html).toMatch(/aria-checked="true" aria-label="Yellow"/);
    expect(render(false)).not.toContain("Highlight color");
  });

  it("offers a keyword color only once there are keywords to highlight", () => {
    expect(render(false, { keywords: "   " })).not.toContain("Keyword color");
    const html = render(false, { keywords: "Python, TSA", keywordColor: "violet" });
    expect(html).toContain("Keyword color");
    expect(html).toMatch(/aria-checked="true" aria-label="Violet"/);
  });
});
