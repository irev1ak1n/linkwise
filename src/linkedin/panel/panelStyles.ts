// Self-contained CSS for the in-page panel's shadow root — deliberately isolated from
// LinkedIn's own stylesheet (nothing here can leak out, nothing of LinkedIn's can leak in).
//
// Takes the panel width as a parameter rather than hardcoding it a second time here — mount.ts's
// PANEL_WIDTH_PX is the one source of truth, also used to offset the opener button so the two
// can never drift apart.
export function getPanelStyles(widthPx: number): string {
  return `
  :host, * {
    box-sizing: border-box;
  }
  .lw-panel {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: ${widthPx}px;
    background: #ffffff;
    border-left: 1px solid #d0d7dd;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.12);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: #1a1a1a;
  }
  .lw-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #e4e9ed;
    flex-shrink: 0;
  }
  .lw-panel__brand {
    font-weight: 700;
    font-size: 15px;
    color: #0a66c2;
    letter-spacing: -0.01em;
  }
  .lw-panel__close {
    border: none;
    background: transparent;
    font-size: 14px;
    cursor: pointer;
    color: #56687a;
    line-height: 1;
    padding: 4px;
    border-radius: 6px;
  }
  .lw-panel__close:hover {
    background: #f0f2f5;
    color: #1a1a1a;
  }
  .lw-panel__body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .lw-empty {
    color: #56687a;
    font-style: italic;
  }

  /* Goal Setup — the panel's only input: describe who you're looking for. */
  .lw-goal h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #56687a;
    margin: 0 0 8px;
  }
  .text-area {
    font: inherit;
    width: 100%;
    padding: 9px 10px;
    border: 1px solid #d0d7dd;
    border-radius: 8px;
    resize: vertical;
    min-height: 64px;
    transition: border-color 0.15s ease;
  }
  .text-area:focus {
    outline: none;
    border-color: #0a66c2;
    box-shadow: 0 0 0 3px rgba(10, 102, 194, 0.12);
  }
  .button {
    font: inherit;
    font-weight: 600;
    border-radius: 18px;
    padding: 7px 16px;
    cursor: pointer;
    border: 1px solid #0a66c2;
    color: #0a66c2;
    background: #fff;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .button--primary {
    background: #0a66c2;
    color: #fff;
  }
  .button--primary:hover:not(:disabled) {
    background: #084e96;
    border-color: #084e96;
  }
  .lw-goal__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
  }
  .char-count {
    font-size: 11px;
    color: #8a949c;
  }
  .lw-goal__message {
    margin: 8px 0 0;
    font-size: 12px;
    color: #445;
    line-height: 1.4;
  }
  .lw-goal__active {
    margin: 6px 0 0;
    font-size: 11.5px;
    color: #0a66c2;
    font-weight: 600;
  }

  /* Scanning state */
  .lw-scanning__title {
    font-weight: 600;
    margin: 0 0 4px;
  }
  .lw-scanning__for {
    color: #445;
    margin: 0 0 8px;
  }
  .lw-scanning__hint {
    color: #56687a;
    font-size: 12px;
    margin: 0 0 14px;
  }
  .lw-fraction {
    font-weight: 600;
    font-size: 12px;
    margin: 8px 0 4px;
  }
  .lw-progress {
    height: 6px;
    border-radius: 3px;
    background: #e4e9ed;
    overflow: hidden;
  }
  .lw-progress__fill {
    height: 100%;
    background: #0a66c2;
    border-radius: 3px;
    transition: width 0.2s ease;
  }
  .lw-checklist {
    list-style: none;
    margin: 8px 0 16px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lw-checklist li.is-done {
    color: #057642;
  }
  .lw-checklist li.is-pending {
    color: #8a949c;
  }

  .lw-button {
    font: inherit;
    font-weight: 600;
    border-radius: 18px;
    padding: 7px 16px;
    cursor: pointer;
    border: 1px solid #0a66c2;
    color: #0a66c2;
    background: #fff;
    transition: background 0.15s ease;
  }
  .lw-button:hover {
    background: #eaf3fc;
  }
  .lw-button--secondary {
    width: 100%;
  }

  /* Waiting on AI (collection already settled, reasoning still in flight) */
  .lw-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px 16px;
    text-align: center;
  }
  .lw-loading__spinner {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 3px solid #e4e9ed;
    border-top-color: #0a66c2;
    animation: lw-spin 0.8s linear infinite;
  }
  .lw-loading__label {
    margin: 0;
    font-size: 12.5px;
    color: #56687a;
  }
  @keyframes lw-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Analysis state */
  .lw-analysis {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .lw-summary-card {
    text-align: center;
    padding: 18px 16px;
    border-radius: 12px;
    background: #f3f6f8;
    border: 1px solid transparent;
  }
  .lw-summary-card__level {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .lw-summary-card__score {
    font-size: 34px;
    font-weight: 700;
    margin-top: 4px;
    letter-spacing: -0.02em;
  }
  .lw-summary-card__target {
    font-size: 12px;
    color: #445;
    margin-top: 6px;
  }
  .lw-summary-card__note {
    font-size: 11.5px;
    color: #8a6d00;
    margin: 8px 0 0;
  }
  .lw-ai-status {
    font-size: 11px;
    font-style: italic;
    color: #56687a;
    margin: 6px 0 0;
  }
  .lw-ai-status--ai {
    font-style: normal;
    font-weight: 600;
    color: #0a66c2;
  }

  .lw-section {
    padding-bottom: 16px;
    border-bottom: 1px solid #eef1f4;
  }
  .lw-section:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .lw-section h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #56687a;
    margin: 0 0 8px;
  }
  .lw-summary-text {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: #1a1a1a;
  }

  .lw-recommendation {
    margin: 0;
    font-size: 13.5px;
    font-weight: 700;
  }
  .lw-recommendation__reason {
    margin: 2px 0 0;
    font-size: 12px;
    color: #56687a;
  }
  .lw-guidance {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .lw-guidance__pill {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11.5px;
    font-weight: 600;
    border: 1px solid transparent;
  }
  .lw-guidance__pill--contact-recommended {
    background: #e6f4ea;
    color: #057642;
    border-color: #b7dfc4;
  }
  .lw-guidance__pill--contact-maybe {
    background: #fff6e0;
    color: #8a6d00;
    border-color: #f0dfa8;
  }
  .lw-guidance__pill--contact-not-recommended {
    background: #fdecea;
    color: #c0392b;
    border-color: #f3c6c1;
  }
  .lw-guidance__pill--save-save {
    background: #e6f4ea;
    color: #057642;
    border-color: #b7dfc4;
  }
  .lw-guidance__pill--save-consider-saving {
    background: #fff6e0;
    color: #8a6d00;
    border-color: #f0dfa8;
  }
  .lw-guidance__pill--save-skip {
    background: #fdecea;
    color: #c0392b;
    border-color: #f3c6c1;
  }

  .lw-experience-level {
    margin: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: #0a66c2;
  }
  .lw-experience-level__reason {
    margin: 4px 0 0;
    font-size: 12px;
    color: #445;
    line-height: 1.4;
  }
  .lw-guidance__reason {
    margin: 6px 0 0;
    font-size: 12px;
    color: #445;
    line-height: 1.4;
  }

  .lw-evidence-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lw-evidence-list__item {
    padding: 7px 10px;
    border-radius: 8px;
    font-size: 12.5px;
    border: 1px solid transparent;
  }
  .lw-evidence-list__item--strength {
    background: #e6f4ea;
    color: #057642;
    border-color: #b7dfc4;
  }
  .lw-evidence-list__item--gap {
    background: #fdecea;
    color: #c0392b;
    border-color: #f3c6c1;
  }
`;
}
