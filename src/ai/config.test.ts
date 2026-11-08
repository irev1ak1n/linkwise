import { describe, expect, it } from "vitest";
import { LINKWISE_API_BASE_URL, LOCAL_API_BASE_URL, analyzeJobEndpoint, analyzeProfileEndpoint } from "./config";

describe("backend address", () => {
  it("is the local backend unless a build sets another, and every endpoint hangs off it", () => {
    expect(LINKWISE_API_BASE_URL).toBe(LOCAL_API_BASE_URL);
    expect(LOCAL_API_BASE_URL).toBe("http://localhost:8787");
    expect(analyzeProfileEndpoint()).toBe(`${LINKWISE_API_BASE_URL}/api/analyze-profile`);
    expect(analyzeJobEndpoint()).toBe(`${LINKWISE_API_BASE_URL}/api/analyze-job`);
  });
});
