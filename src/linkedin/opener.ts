// Injects the fixed "LinkWise" tab on the page edge, the only UI this extension adds besides
// the panel itself. Styled with inline styles so LinkedIn's CSS can never touch it.
const OPENER_ID = "finder-linkwise-opener";

function applyOpenerStyles(button: HTMLButtonElement): void {
  Object.assign(button.style, {
    position: "fixed",
    top: "50%",
    right: "0",
    transform: "translateY(-50%)",
    zIndex: "2147483647",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    padding: "12px 7px",
    margin: "0",
    border: "none",
    borderRadius: "8px 0 0 8px",
    background: "#0a66c2",
    color: "#ffffff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontSize: "13px",
    fontWeight: "600",
    letterSpacing: "0.03em",
    lineHeight: "1",
    cursor: "pointer",
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.25)",
    transition: "right 0.15s ease",
  });
}

// Idempotent, safe to call repeatedly. Creates the button once and re-attaches the handler.
export function ensureLinkWiseOpener(onToggle: () => void): void {
  const existing = document.getElementById(OPENER_ID) as HTMLButtonElement | null;
  if (existing) {
    existing.onclick = onToggle;
    return;
  }

  const button = document.createElement("button");
  button.id = OPENER_ID;
  button.type = "button";
  button.textContent = "LinkWise";
  button.setAttribute("aria-label", "Open or close the LinkWise panel");
  applyOpenerStyles(button);
  button.onclick = onToggle;

  document.body.appendChild(button);
}

// Shifts the opener to the panel's edge while open, back to the page edge once closed.
export function setOpenerOffset(offsetPx: number): void {
  const existing = document.getElementById(OPENER_ID) as HTMLButtonElement | null;
  if (existing) existing.style.right = `${offsetPx}px`;
}

// Used only during teardown, to avoid a duplicate once a fresh instance takes over.
export function removeLinkWiseOpener(): void {
  document.getElementById(OPENER_ID)?.remove();
}
