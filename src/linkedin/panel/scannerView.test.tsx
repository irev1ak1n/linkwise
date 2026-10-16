// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScannerView } from "./ScannerView";
import { useScanHandoff, COMPLETE_HOLD_MS, STALL_MS } from "./useScanHandoff";
import type { ScanState, ScanStatus } from "./scanProgress";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const scanning: ScanState = {
  status: "scanning",
  progress: 40,
  message: "Scanning experience…",
  active: { section: "experience", status: "scanning" },
  sections: [
    { section: "about", status: "complete" },
    { section: "experience", status: "scanning" },
    { section: "projects", status: "not_found", note: "Not found" },
    { section: "skills", status: "complete", count: 14 },
    { section: "education", status: "pending" },
  ],
};

describe("ScannerView", () => {
  it("shows the person, the goal, the live message and every row's state", () => {
    act(() => root!.render(<ScannerView profileName="Jordan Rivera" goalName="Web Developer Intern" scanMode="auto" state={scanning} />));
    expect(container.querySelector(".lw-scan__name")!.textContent).toBe("Jordan Rivera");
    expect(container.textContent).toContain("For Web Developer Intern");
    expect(container.querySelector("[role=status]")!.textContent).toBe("Scanning experience…");
    expect([...container.querySelectorAll(".lw-scan-row")].map((row) => row.getAttribute("aria-label"))).toEqual([
      "About: complete",
      "Experience: scanning",
      "Projects: not found",
      "Skills: complete",
      "Education: pending",
    ]);
    expect(container.textContent).toContain("14 skills");
    expect(container.textContent).toContain("Not found");
    expect(container.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("40");
  });

  it("never moves the bar backwards when a new section adds a row", () => {
    act(() => root!.render(<ScannerView scanMode="auto" state={scanning} />));
    act(() => root!.render(<ScannerView scanMode="auto" state={{ ...scanning, progress: 33 }} />));
    expect(container.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("40");
  });

  it("presents Analyze as I scroll as coverage", () => {
    act(() => root!.render(<ScannerView scanMode="scroll" state={{ ...scanning, active: null, message: "Scroll the profile to load more information" }} />));
    expect(container.textContent).toContain("Profile coverage");
    expect(container.querySelector(".lw-scan__percent")).toBeNull();
  });

  it("offers Try again when the scan failed", () => {
    const retry = vi.fn();
    act(() => root!.render(<ScannerView scanMode="auto" state={{ ...scanning, status: "error", message: "Could not finish scanning" }} onRetry={retry} onAnalyzeNow={vi.fn()} />));
    expect(container.textContent).toContain("Could not finish scanning");
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent === "Try again")!.click());
    expect(retry).toHaveBeenCalled();
    expect(container.textContent).toContain("Analyze what was found");
  });

  it("shows the match on completion", () => {
    act(() => root!.render(<ScannerView scanMode="auto" state={{ ...scanning, status: "complete", progress: 100, message: "Profile scan complete" }} resultLabel="96% · Strong match" />));
    expect(container.textContent).toContain("96% · Strong match");
    expect(container.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("100");
  });
});

describe("useScanHandoff", () => {
  let latest: ReturnType<typeof useScanHandoff>;
  function Probe({ profileKey, status, signature }: { profileKey: string; status: ScanStatus; signature: string | null }) {
    latest = useScanHandoff(profileKey, status, signature);
    return null;
  }

  it("holds the completed scan briefly only after watching it run", () => {
    vi.useFakeTimers();
    act(() => root!.render(<Probe profileKey="a" status="complete" signature={null} />));
    expect(latest.showingComplete).toBe(false);
    act(() => root!.render(<Probe profileKey="a" status="scanning" signature={null} />));
    act(() => root!.render(<Probe profileKey="a" status="complete" signature={null} />));
    expect(latest.showingComplete).toBe(true);
    act(() => vi.advanceTimersByTime(COMPLETE_HOLD_MS));
    expect(latest.showingComplete).toBe(false);
  });

  it("reports a stall only when progress stops changing", () => {
    vi.useFakeTimers();
    act(() => root!.render(<Probe profileKey="a" status="scanning" signature="10" />));
    act(() => vi.advanceTimersByTime(STALL_MS - 1000));
    act(() => root!.render(<Probe profileKey="a" status="scanning" signature="20" />));
    act(() => vi.advanceTimersByTime(STALL_MS - 1000));
    expect(latest.stalled).toBe(false);
    act(() => vi.advanceTimersByTime(2000));
    expect(latest.stalled).toBe(true);
  });
});
