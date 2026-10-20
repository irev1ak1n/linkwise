// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OptimizerHero } from "./MainMenu";

vi.stubGlobal("chrome", { runtime: { id: "test", getURL: (path: string) => `chrome-extension://test/${path}` } });

describe("OptimizerHero", () => {
  it("lays real title and subtitle text over the artwork, with its menu and settings buttons", () => {
    const html = renderToStaticMarkup(<OptimizerHero />);
    expect(html).toContain("content/assets/profile-optimizer-hero.webp");
    expect(html).toMatch(/<h2 class="lw-art-hero__title">Profile Optimizer<\/h2>/);
    expect(html).toContain("<span>Improve your LinkedIn profile</span> <span>with AI-powered suggestions.</span>");
    expect(html).toContain('aria-label="Open LinkWise menu"');
    expect(html).toContain('aria-label="Open LinkWise settings"');
  });
});
