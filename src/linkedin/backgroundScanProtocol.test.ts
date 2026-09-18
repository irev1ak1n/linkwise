import { describe, expect, it } from "vitest";
import { buildScanUrl, getRequestingTabId, isScanTabUrl } from "./backgroundScanProtocol";

describe("backgroundScanProtocol", () => {
  it("builds a scan URL from a bare profile key and requesting tab id, marked with the scan query param", () => {
    const url = buildScanUrl("alex-chen", 42);
    expect(url).toBe("https://www.linkedin.com/in/alex-chen/?lwscan=1&lwreq=42");
  });

  it("percent-encodes a profile key that needs it", () => {
    const url = buildScanUrl("alex chen", 42);
    expect(url).toContain("/in/alex%20chen/");
  });

  it("recognizes a scan tab URL", () => {
    expect(isScanTabUrl("https://www.linkedin.com/in/alex-chen/?lwscan=1&lwreq=42")).toBe(true);
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

  describe("getRequestingTabId", () => {
    it("reads back the tab id embedded by buildScanUrl", () => {
      const url = buildScanUrl("alex-chen", 42);
      expect(getRequestingTabId(url)).toBe(42);
    });

    it("returns null when the URL has no requester param", () => {
      expect(getRequestingTabId("https://www.linkedin.com/in/alex-chen/?lwscan=1")).toBeNull();
    });

    it("returns null for a malformed URL", () => {
      expect(getRequestingTabId("not a url")).toBeNull();
    });

    it("returns null when the param isn't a valid integer", () => {
      expect(getRequestingTabId("https://www.linkedin.com/in/alex-chen/?lwscan=1&lwreq=not-a-number")).toBeNull();
    });
  });
});
