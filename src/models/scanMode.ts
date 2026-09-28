// The user's chosen profile-scanning mode. "scroll" never moves the page. The two automatic
// modes move it for the user: "auto" scans quickly, "autoScroll" reads through it slowly.
export type ScanMode = "scroll" | "auto" | "autoScroll";

export function isAutomaticScan(mode: ScanMode): boolean {
  return mode === "auto" || mode === "autoScroll";
}

export const DEFAULT_SCAN_MODE: ScanMode = "scroll";
