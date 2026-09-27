import { useSyncExternalStore } from "react";
import { autoScroller } from "../autoScroller";

export function useAutoScroll() {
  const state = useSyncExternalStore(autoScroller.subscribe, autoScroller.getState);
  return { state, pause: autoScroller.pause, resume: autoScroller.resume };
}
