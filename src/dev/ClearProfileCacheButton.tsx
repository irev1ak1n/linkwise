import { useState } from "react";
import { clearAllAnalysisCaches, clearProfileCache } from "./clearProfileCache";

// Temporary: remove this button (and src/dev) after recording the demo.
export function ClearProfileCacheButton({ profileKey }: { profileKey: string }) {
  const [busy, setBusy] = useState(false);
  const run = (clear: () => Promise<void>) => () => {
    setBusy(true);
    void clear().finally(() => location.reload());
  };
  return (
    <>
      <button type="button" className="lw-button lw-button--secondary" disabled={busy} onClick={run(() => clearProfileCache(profileKey))}>
        Clear current profile cache
      </button>
      <button type="button" className="lw-button lw-button--secondary" disabled={busy} onClick={run(clearAllAnalysisCaches)}>
        Clear all analysis caches
      </button>
    </>
  );
}
