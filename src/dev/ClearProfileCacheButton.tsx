import { useState } from "react";
import { clearProfileCache } from "./clearProfileCache";

// Temporary: remove this button (and src/dev) after recording the demo.
export function ClearProfileCacheButton({ profileKey }: { profileKey: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="lw-button lw-button--secondary"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void clearProfileCache(profileKey).finally(() => location.reload());
      }}
    >
      Clear current profile cache
    </button>
  );
}
