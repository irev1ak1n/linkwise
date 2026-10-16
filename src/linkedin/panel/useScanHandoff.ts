import { useEffect, useRef, useState } from "react";
import type { ScanStatus } from "./scanProgress";

export const COMPLETE_HOLD_MS = 900;
export const STALL_MS = 45000;

// Holds "Profile scan complete" briefly, only when this panel actually watched the scan run, and
// reports a scan that stopped making progress.
export function useScanHandoff(profileKey: string | null, status: ScanStatus | null, progressSignature: string | null): { showingComplete: boolean; stalled: boolean } {
  const watched = useRef<string | null>(null);
  const [holding, setHolding] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!profileKey || !status) return;
    if (status === "scanning" || status === "analyzing") {
      watched.current = profileKey;
      return;
    }
    if (status === "complete" && watched.current === profileKey) {
      watched.current = null;
      setHolding(profileKey);
      const handle = setTimeout(() => setHolding(null), COMPLETE_HOLD_MS);
      return () => clearTimeout(handle);
    }
  }, [profileKey, status]);

  useEffect(() => {
    setStalled(false);
    if (!progressSignature || status !== "scanning") return;
    const handle = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(handle);
  }, [progressSignature, status]);

  return { showingComplete: holding !== null && holding === profileKey, stalled };
}
