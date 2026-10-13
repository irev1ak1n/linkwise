import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScanModeToggle } from "./ScanModeToggle";

describe("ScanModeToggle", () => {
  it("offers only Analyze as I scroll and Auto scan profile", () => {
    const html = renderToStaticMarkup(<ScanModeToggle mode="auto" onChange={() => {}} />);
    const options = [...html.matchAll(/role="radio"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(options).toEqual(["Analyze as I scroll", "Auto scan profile"]);
    expect(html).not.toContain("Auto scroll");
    expect(html).toMatch(/aria-checked="true"[^>]*>Auto scan profile/);
  });
});
