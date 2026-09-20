// Local-only persistence for the LinkWise opener tab's vertical position, same pattern as
// scanModeRepository.ts. Stored as the distance in px from the top of the viewport to the
// tab's top edge. Null means no custom position has been saved yet, use the default centered
// spot instead.
export const OPENER_POSITION_STORAGE_KEY = "finder.openerTopPx.v1";

export async function loadOpenerTopPx(): Promise<number | null> {
  const stored = await chrome.storage.local.get(OPENER_POSITION_STORAGE_KEY);
  const value = stored[OPENER_POSITION_STORAGE_KEY];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function saveOpenerTopPx(topPx: number): Promise<void> {
  await chrome.storage.local.set({ [OPENER_POSITION_STORAGE_KEY]: topPx });
}
