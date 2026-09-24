// Mounts the panel into the page as a fixed right-anchored element, inside a shadow root so
// LinkedIn's CSS can't leak in or out. The React tree is created once, toggling just shows or
// hides it so state is never lost.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PanelApp } from "./PanelApp";
import { getPanelStyles } from "./panelStyles";
import { setOpenerOffset } from "../opener";
import { setPanelVisible } from "./panelVisibilityStore";

const HOST_ID = "finder-linkwise-panel-host";
export const PANEL_WIDTH_PX = 360;

let hostElement: HTMLDivElement | null = null;
let root: Root | null = null;

function ensureHost(): HTMLDivElement {
  if (hostElement && document.body.contains(hostElement)) return hostElement;

  const host = document.createElement("div");
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    right: "0",
    height: "100vh",
    zIndex: "2147483646", // one below the opener button, so it stays clickable to close
    display: "none",
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = getPanelStyles(PANEL_WIDTH_PX);
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  root = createRoot(mountPoint);
  root.render(createElement(PanelApp, { onClose: closePanel }));

  hostElement = host;
  return host;
}

export function isPanelOpen(): boolean {
  return hostElement?.style.display === "block";
}

// Open and close both live here alongside the opener-offset update, since the panel can be
// closed from more than one place and each needs to reset the opener.
export function openPanel(): void {
  ensureHost().style.display = "block";
  setOpenerOffset(PANEL_WIDTH_PX);
  setPanelVisible(true);
}

export function closePanel(): void {
  if (hostElement) hostElement.style.display = "none";
  setOpenerOffset(0);
  setPanelVisible(false);
}

export function togglePanel(): void {
  if (isPanelOpen()) closePanel();
  else openPanel();
}

// Unmounts and removes the host entirely, used only during teardown, never normal open/close.
export function destroyPanel(): void {
  root?.unmount();
  root = null;
  hostElement?.remove();
  hostElement = null;
}
