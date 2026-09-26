import { useSyncExternalStore } from "react";
import { getManualSectionsState, initManualSectionsStore, setManualSectionsPreference, subscribeManualSectionsStore } from "./manualSectionsStore";

export function useManualSectionsPreference() {
  initManualSectionsStore();
  const state = useSyncExternalStore(subscribeManualSectionsStore, getManualSectionsState);
  return { enabled: state.enabled, loaded: state.loaded, setManualSectionsPreference };
}
