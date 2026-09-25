// Each content-script injection after an extension reload runs in a new isolated world, so a
// window global can't reach the previous instance. The DOM is shared across worlds, so a DOM
// event can.
const TAKEOVER_EVENT = "linkwise:takeover";

export function claimRuntime(onReplaced: () => void): () => void {
  document.dispatchEvent(new CustomEvent(TAKEOVER_EVENT));
  const handler = () => onReplaced();
  document.addEventListener(TAKEOVER_EVENT, handler, { once: true });
  return () => document.removeEventListener(TAKEOVER_EVENT, handler);
}
