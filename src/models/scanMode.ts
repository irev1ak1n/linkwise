// The user's chosen profile-scanning mode. "scroll" never moves the page, "auto" is the only
// mode allowed to scroll it on the user's behalf.
export type ScanMode = "scroll" | "auto";

export const DEFAULT_SCAN_MODE: ScanMode = "scroll";
