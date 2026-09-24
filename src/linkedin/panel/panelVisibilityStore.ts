// Tracks whether the panel is currently shown. Updated only from mount.ts, since that's the
// only place open/close actually happens. Lets other components discard drafts on close.
type Listener = () => void;
const listeners = new Set<Listener>();
let visible = false;

export function isPanelVisible(): boolean {
  return visible;
}

export function subscribePanelVisibility(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPanelVisible(next: boolean): void {
  if (visible === next) return;
  visible = next;
  listeners.forEach((listener) => listener());
}
