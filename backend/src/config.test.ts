import { describe, expect, it } from "vitest";
import { isAiConfigured, loadConfig, redactedConfigSummary } from "./config";

describe("loadConfig", () => {
  it("reports not configured when OPENAI_API_KEY is missing", () => {
    const config = loadConfig({});
    expect(isAiConfigured(config)).toBe(false);
  });

  it("reports configured when OPENAI_API_KEY is present", () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test-not-real" });
    expect(isAiConfigured(config)).toBe(true);
  });

  it("treats a blank/whitespace-only API key as not configured", () => {
    expect(isAiConfigured(loadConfig({ OPENAI_API_KEY: "" }))).toBe(false);
    expect(isAiConfigured(loadConfig({ OPENAI_API_KEY: "   " }))).toBe(false);
  });

  it("falls back to the documented default model when OPENAI_MODEL is unset", () => {
    const config = loadConfig({});
    expect(config.openAiModel).toBe("gpt-5.6-luna");
  });

  it("honors a configured OPENAI_MODEL — the model is never hardcoded elsewhere", () => {
    const config = loadConfig({ OPENAI_MODEL: "some-other-model" });
    expect(config.openAiModel).toBe("some-other-model");
  });

  it("falls back to the documented default port when PORT is unset or invalid", () => {
    expect(loadConfig({}).port).toBe(8787);
    expect(loadConfig({ PORT: "not-a-number" }).port).toBe(8787);
    expect(loadConfig({ PORT: "-1" }).port).toBe(8787);
  });

  it("honors a configured PORT", () => {
    expect(loadConfig({ PORT: "9999" }).port).toBe(9999);
  });
});

describe("redactedConfigSummary", () => {
  it("never includes the API key itself", () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-super-secret-value" });
    const summary = redactedConfigSummary(config);
    expect(JSON.stringify(summary)).not.toContain("sk-super-secret-value");
    expect(summary).toEqual({ aiConfigured: true, model: "gpt-5.6-luna", port: 8787 });
  });
});
