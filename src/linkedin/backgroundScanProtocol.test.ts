import { describe, expect, it } from "vitest";
import { buildScanUrl, isScanTabUrl } from "./backgroundScanProtocol";

describe("backgroundScanProtocol", () => {
  it("builds a scan URL from a bare profile key, marked with the scan query param", () => {
    const url = buildScanUrl("alex-chen");
    expect(url).toBe("https://www.linkedin.com/in/alex-chen/?lwscan=1");
  });

  it("percent-encodes a profile key that needs it", () => {
    const url = buildScanUrl("alex chen");
    expect(url).toContain("/in/alex%20chen/");
  });

  it("recognizes a scan tab URL", () => {
    expect(isScanTabUrl("https://www.linkedin.com/in/alex-chen/?lwscan=1")).toBe(true);
  });

  it("does not mistake a normal profile URL for a scan tab", () => {
    expect(isScanTabUrl("https://www.linkedin.com/in/alex-chen/")).toBe(false);
  });

  it("does not mistake an unrelated query param for the scan marker", () => {
    expect(isScanTabUrl("https://www.linkedin.com/in/alex-chen/?lwscan=0")).toBe(false);
    expect(isScanTabUrl("https://www.linkedin.com/in/alex-chen/?other=1")).toBe(false);
  });

  it("never throws on a malformed URL", () => {
    expect(isScanTabUrl("not a url")).toBe(false);
  });
});
