// Self-contained CSS for the panel's shadow root, isolated from LinkedIn's own stylesheet.
// Takes width as a parameter so mount.ts's PANEL_WIDTH_PX stays the one source of truth.
export function getPanelStyles(widthPx: number): string {
  return `
  :host, * {
    box-sizing: border-box;
  }
  /* Structural section labels (SCANNING, COLOR, Summary, Checklist...): one near-black so the page
     structure reads at a glance. Helper text and descriptions keep their muted grays. */
  :host {
    --lw-section-label: #20242c;
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
    position: relative;
    z-index: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px 14px 18px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(90, 130, 255, 0.32);
    box-shadow: 0 3px 10px rgba(10, 25, 75, 0.15);
    background:
      radial-gradient(28% 130% at 100% 15%, rgba(118, 66, 245, 0.75) 0%, rgba(110, 60, 240, 0.28) 45%, transparent 78%),
      radial-gradient(34% 110% at 63% 92%, rgba(40, 104, 255, 0.72) 0%, rgba(36, 98, 255, 0.24) 44%, transparent 74%),
      radial-gradient(30% 140% at 0% 50%, rgba(2, 8, 34, 0.35) 0%, transparent 75%),
      linear-gradient(100deg in oklab, #061646 0%, #081f5e 34%, #0c2a80 58%, #15329f 78%, #2f2fc4 100%);
  }
  .lw-panel__lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .lw-panel__brand {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .lw-panel__mark {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    filter: drop-shadow(0 0 8px rgba(70, 130, 255, 0.45)) drop-shadow(0 2px 4px rgba(4, 10, 40, 0.3));
  }
  .lw-panel__wordmark {
    font-weight: 650;
    font-size: 20px;
    line-height: 1;
    letter-spacing: -0.022em;
    color: #f8faff;
  }
  .lw-panel__wordmark span {
    color: #eaf0ff;
  }
  .lw-panel__close {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: rgba(240, 244, 255, 0.82);
    cursor: pointer;
    transition: background 0.18s ease-out, color 0.18s ease-out;
  }
  .lw-panel__close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .lw-panel__close:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.8);
    outline-offset: 1px;
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

  /* Goal Setup, the panel's only input. */
  .lw-goal h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--lw-section-label);
    margin: 0 0 8px;
    font-weight: 700;
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
  .lw-goal__actions {
    display: flex;
    gap: 8px;
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

  /* Scan mode chooser: one image (panels, icons, glow) with the real text and the selection on
     top. Positions are fractions of the art, measured from it, so they track it at any width. */
  .lw-sm {
    position: relative;
    aspect-ratio: 1337 / 765;
    border-radius: 18px;
    overflow: hidden;
    isolation: isolate;
    background: #050a2e;
    box-shadow: 0 6px 18px rgba(20, 35, 120, 0.18);
    color: #fff;
  }
  .lw-sm__art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
    user-select: none;
  }
  /* The wide top panel, beside its icon. */
  .lw-sm__head {
    position: absolute;
    left: 21.6%;
    right: 6%;
    top: 15.2%;
    height: 30.1%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    text-shadow: 0 1px 6px rgba(5, 8, 40, 0.5);
  }
  .lw-sm__title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.15;
  }
  .lw-sm__subtitle {
    font-size: 11px;
    line-height: 1.3;
    color: rgba(214, 222, 255, 0.85);
  }
  .lw-sm__option {
    position: absolute;
    top: 49.3%;
    height: 41.8%;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: rgba(2, 5, 28, 0.2);
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
  }
  .lw-sm__option--scroll {
    left: 2.69%;
    width: 46%;
  }
  .lw-sm__option--auto {
    left: 51.08%;
    width: 46.07%;
  }
  .lw-sm__option:hover {
    background: rgba(2, 5, 28, 0.08);
  }
  /* The art draws each panel's border; selection only brightens it in the same blue. */
  .lw-sm__option.is-selected {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px rgba(96, 140, 255, 0.95), 0 0 8px rgba(70, 115, 255, 0.35);
  }
  .lw-sm__option:focus-visible {
    outline: 2px solid #c7d2fe;
    outline-offset: 2px;
  }
  /* Beside the panel's icon, never over it. */
  .lw-sm__label {
    position: absolute;
    left: 41%;
    right: 5%;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    font-size: 13.5px;
    font-weight: 700;
    line-height: 1.2;
    text-shadow: 0 1px 6px rgba(5, 8, 40, 0.55);
  }
  /* Where the art's own check badge sat, on whichever mode is selected. */
  .lw-sm__check {
    position: absolute;
    right: 4.2%;
    top: 6.8%;
    width: 12.2%;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #fff;
    color: #3048e0;
    box-shadow: 0 0 6px rgba(120, 155, 255, 0.5);
  }
  .lw-sm__check svg {
    width: 62%;
    height: 62%;
  }

  /* The selected mode's settings: clean white rows under the chooser. */
  /* One grouped container of rows, like Highlight categories: the group owns the card (border,
     radius, shadow, clipping); rows are flat and separated by dividers that start after the icon. */
  .lw-scan-options {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid #e0e6ef;
    border-radius: 15px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
  }
  .lw-scan-option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    margin: 0;
    padding: 11px 12px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    cursor: pointer;
    transition: background-color 0.12s ease;
  }
  .lw-scan-option:not(:last-child)::after {
    content: "";
    position: absolute;
    left: 62px;
    right: 0;
    bottom: 0;
    height: 1px;
    background: #e8ecf3;
  }
  .lw-scan-option:hover {
    background: #f8faff;
  }
  .lw-scan-option__tile {
    flex: none;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: #eef3fe;
    color: #2f5be0;
  }
  .lw-scan-option__tile svg {
    width: 20px;
    height: 20px;
  }
  .lw-scan-option__text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .lw-scan-option__title {
    font-size: 13.5px;
    font-weight: 600;
    color: #1d2a3a;
  }
  .lw-scan-option__hint {
    font-size: 12px;
    line-height: 1.35;
    color: #6b7785;
  }
  .lw-scan-mode__control {
    display: flex;
    border: 1px solid #d0d7dd;
    border-radius: 8px;
    overflow: hidden;
  }
  .lw-scan-mode__option {
    flex: 1;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.25;
    padding: 5px 6px;
    border: none;
    background: #fff;
    color: #56687a;
    cursor: pointer;
  }
  .lw-scan-mode__option + .lw-scan-mode__option {
    border-left: 1px solid #d0d7dd;
  }
  .lw-scan-mode__option.is-active {
    background: #0a66c2;
    color: #fff;
  }
  .lw-scan-mode__hint {
    margin: 0;
    font-size: 11px;
    color: #8a949c;
  }

  /* Compact checkbox (Job Filters). */
  .lw-expand-details {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: #56687a;
    cursor: pointer;
  }
  .lw-expand-details input {
    margin: 0;
  }

  /* Hands-free reading speed and state, under the Auto scan options. */

  /* Scan screen: one surface, one real progress bar, flat section rows. */
  .lw-scan {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 14px 12px;
    border: 1px solid #e3e7f3;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(16, 24, 64, 0.04);
  }
  .lw-scan__head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .lw-scan__eyebrow {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6a4fd0;
  }
  .lw-scan__name {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    line-height: 1.25;
    color: #1a1a1a;
    overflow-wrap: anywhere;
  }
  .lw-scan__goal {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: #8a949c;
  }
  .lw-scan__goal span {
    font-weight: 600;
    color: #56687a;
  }
  .lw-scan__progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lw-scan__phase {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: #1e7b34;
    animation: lw-scan-fade 0.3s ease;
  }
  .lw-scan__status {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .lw-scan__message {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #2b3a8f;
    animation: lw-scan-fade 0.3s ease;
  }
  .lw-scan__percent {
    font-size: 11.5px;
    font-weight: 600;
    color: #8a949c;
    font-variant-numeric: tabular-nums;
  }
  .lw-scan__bar {
    height: 4px;
    border-radius: 2px;
    background: #eceef6;
    overflow: hidden;
  }
  .lw-scan__fill {
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(90deg, #0a66c2, #6a4fd0);
    transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .lw-scan.is-scanning .lw-scan__fill,
  .lw-scan.is-analyzing .lw-scan__fill {
    background-image: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent), linear-gradient(90deg, #0a66c2, #6a4fd0);
    background-size: 40% 100%, 100% 100%;
    background-repeat: no-repeat;
    animation: lw-scan-shimmer 1.8s linear infinite;
  }
  .lw-scan.is-complete .lw-scan__fill {
    background: linear-gradient(90deg, #0a66c2, #1e7b34);
  }
  .lw-scan.is-error .lw-scan__fill {
    background: #9aa5ad;
  }
  .lw-scan.is-error .lw-scan__message {
    color: #56687a;
  }
  .lw-scan__result {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #1a1a1a;
    animation: lw-scan-fade 0.3s ease;
  }
  .lw-scan__rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .lw-scan-row {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    padding: 5px 8px;
    border-radius: 7px;
    font-size: 13px;
    color: #8a949c;
    transition: background 0.3s ease, color 0.3s ease;
  }
  .lw-scan-row.is-scanning {
    color: #1a1a1a;
    background: #f4f2fd;
  }
  .lw-scan-row.is-complete {
    color: #1a1a1a;
  }
  .lw-scan-row__label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lw-scan-row.is-scanning .lw-scan-row__label,
  .lw-scan-row.is-complete .lw-scan-row__label {
    font-weight: 600;
  }
  .lw-scan-row__detail {
    flex-shrink: 0;
    font-size: 11.5px;
    color: #8a949c;
  }
  .lw-scan-row.is-scanning .lw-scan-row__detail {
    color: #6a4fd0;
  }
  .lw-scan-mark {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  .lw-scan-mark.is-pending {
    width: 10px;
    height: 10px;
    margin: 2px;
    border: 1.5px solid #cfd6dd;
  }
  .lw-scan-mark.is-scanning {
    position: relative;
    width: 8px;
    height: 8px;
    margin: 3px;
    background: #6a4fd0;
  }
  .lw-scan-mark.is-scanning::after {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: rgba(106, 79, 208, 0.25);
    animation: lw-scan-pulse 1.4s ease-out infinite;
  }
  .lw-scan-mark.is-absent {
    font-size: 12px;
    color: #b0b8bf;
  }
  .lw-scan-mark.is-complete circle {
    fill: #1e7b34;
    stroke: none;
  }
  .lw-scan-mark.is-complete path {
    fill: none;
    stroke: #fff;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 10;
    stroke-dashoffset: 0;
    animation: lw-scan-check 0.35s ease-out;
  }
  .lw-scan-mark.is-complete {
    animation: lw-scan-pop 0.3s ease-out;
  }
  .lw-scan.is-complete .lw-scan-row .lw-scan-mark.is-complete,
  .lw-scan.is-complete .lw-scan-row .lw-scan-mark.is-complete path {
    animation: none;
  }
  .lw-scan__hint {
    margin: 0;
    font-size: 12px;
    color: #8a949c;
  }
  .lw-scan__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .lw-scan__link {
    align-self: flex-start;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: #0a66c2;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  @keyframes lw-scan-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes lw-scan-check {
    from { stroke-dashoffset: 10; }
    to { stroke-dashoffset: 0; }
  }
  @keyframes lw-scan-pop {
    from { transform: scale(0.6); opacity: 0.4; }
    to { transform: none; opacity: 1; }
  }
  @keyframes lw-scan-pulse {
    from { transform: scale(0.6); opacity: 1; }
    to { transform: scale(1.6); opacity: 0; }
  }
  @keyframes lw-scan-fade {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: none; }
  }
  @keyframes lw-scan-shimmer {
    from { background-position: -40% 0, 0 0; }
    to { background-position: 140% 0, 0 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .lw-scan *,
    .lw-scan *::after,
    .lw-scan {
      animation: none !important;
      transition: none !important;
    }
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





  .lw-ai-retry {
    margin-left: 6px;
    padding: 0;
    border: none;
    background: none;
    color: #0a66c2;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .lw-colors {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .lw-colors__label {
    font-size: 11.5px;
    color: #56687a;
  }
  .lw-colors__swatches {
    display: flex;
    gap: 5px;
  }
  .lw-colors__swatch {
    width: 16px;
    height: 16px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 50%;
    cursor: pointer;
  }
  .lw-colors__swatch--selected {
    outline: 2px solid #1d2226;
    outline-offset: 1px;
  }
  .lw-keywords__label {
    font-size: 11.5px;
    color: #56687a;
  }
  .lw-keywords__input {
    box-sizing: border-box;
    width: 100%;
    resize: vertical;
    padding: 4px 6px;
    border: 1px solid #c8cdd2;
    border-radius: 4px;
    font: inherit;
    font-size: 12px;
    color: inherit;
    background: #fff;
  }
  .lw-keywords__input:focus {
    outline: none;
    border-color: #0a66c2;
  }

  .lw-jobs-page {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lw-job-rule {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .lw-job-rule + .lw-job-rule {
    padding-top: 8px;
    border-top: 1px solid #eef1f4;
  }
  .lw-job-rule__label {
    font-size: 12px;
    font-weight: 600;
    color: #38434f;
  }

  .lw-optimizer,
  .lw-optimizer__result,
  .lw-optimizer__context,
  .lw-optimizer__reading,
  .lw-optimizer__error,
  .lw-optimizer__draft {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lw-optimizer {
    gap: 12px;
  }
  .lw-optimizer__result {
    gap: 4px;
  }
  .lw-optimizer__score {
    display: flex;
    align-items: baseline;
    gap: 6px;
    line-height: 1.1;
  }
  .lw-optimizer__score-value {
    font-size: 32px;
    font-weight: 700;
    color: #0a66c2;
  }
  .lw-optimizer__score-label {
    font-size: 13px;
    color: #56687a;
  }
  .lw-optimizer__summary {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: #38434f;
  }

  .lw-opt-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lw-opt-card {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    font: inherit;
    text-align: left;
    padding: 11px 12px;
    background: #fff;
    border: 1px solid #e1e6ea;
    border-radius: 10px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .lw-opt-card:hover {
    border-color: #b9cfe6;
    box-shadow: 0 2px 6px rgba(10, 102, 194, 0.12);
  }
  .lw-opt-card__icon {
    color: #0a66c2;
    flex-shrink: 0;
  }
  .lw-opt-card__title {
    flex: 1;
    font-weight: 600;
  }
  .lw-opt-card__chevron {
    color: #8a949c;
    font-size: 18px;
    line-height: 1;
  }
  .lw-opt-ai {
    font-size: 10.5px;
    font-weight: 600;
    color: #5b3fb5;
    background: #f1edfc;
    border-radius: 10px;
    padding: 1px 7px;
    white-space: nowrap;
    align-self: flex-start;
  }
  .lw-opt-card .lw-opt-ai {
    align-self: center;
  }

  .lw-opt-page {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lw-opt-back {
    align-self: flex-start;
    font: inherit;
    font-weight: 600;
    color: #0a66c2;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .lw-opt-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: #56687a;
  }
  .lw-opt-pager button {
    font: inherit;
    color: #0a66c2;
    background: none;
    border: 1px solid #d0d7dd;
    border-radius: 14px;
    padding: 2px 10px;
    cursor: pointer;
  }
  .lw-opt-pager button:disabled {
    color: #b0b8bf;
    cursor: default;
  }
  .lw-opt-page__title {
    margin: 4px 0 0;
    font-size: 17px;
  }
  .lw-opt-page__description {
    margin: 0;
    color: #38434f;
  }
  .lw-opt-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border: 1px solid #e4e9ed;
    border-radius: 10px;
    background: #fff;
  }
  .lw-opt-block h4 {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--lw-section-label);
    font-weight: 700;
  }
  .lw-opt-block p {
    margin: 0;
  }
  .lw-opt-badge {
    align-self: flex-start;
    font-size: 12px;
    font-weight: 600;
    border-radius: 10px;
    padding: 1px 9px;
  }
  .lw-opt-badge.is-strong { background: #e6f4ea; color: #1e7b34; }
  .lw-opt-badge.is-improve { background: #e8f1fb; color: #0a5aa8; }
  .lw-opt-badge.is-add { background: #fff4e5; color: #915907; }
  .lw-opt-badge.is-review { background: #eaf0fe; color: #2f5be0; }
  .lw-opt-badge.is-partial,
  .lw-opt-badge.is-unverifiable { background: #eef1f3; color: #56687a; }
  .lw-opt-quote {
    margin: 0;
    padding: 6px 10px;
    border-left: 3px solid #0a66c2;
    background: #f5f8fb;
    font-style: italic;
  }
  .lw-opt-ai-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
  }
  .lw-opt-subhead {
    font-weight: 600;
  }
  .lw-opt-findings {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .lw-opt-findings li {
    display: flex;
    gap: 6px;
  }
  .lw-opt-findings__mark {
    font-weight: 700;
    flex-shrink: 0;
    width: 12px;
  }
  .lw-opt-findings .is-good .lw-opt-findings__mark { color: #1e7b34; }
  .lw-opt-findings .is-improve .lw-opt-findings__mark { color: #c37d0d; }
  .lw-opt-checklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .lw-opt-check {
    display: flex;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    border-left: 3px solid transparent;
  }
  .lw-opt-check.is-pass { border-color: #1e7b34; background: #f3faf5; }
  .lw-opt-check.is-improve { border-color: #c37d0d; background: #fff8ec; }
  .lw-opt-check.is-unverifiable,
  .lw-opt-check.is-not_applicable { border-color: #cfd6dd; background: #f7f8fa; }
  .lw-opt-check.is-checking { border-color: #d9d3f7; background: #f7f6fe; }
  .lw-opt-check__mark {
    flex-shrink: 0;
    width: 14px;
    font-weight: 700;
    text-align: center;
  }
  .lw-opt-check.is-pass .lw-opt-check__mark { color: #1e7b34; }
  .lw-opt-check.is-improve .lw-opt-check__mark { color: #c37d0d; }
  .lw-opt-check.is-unverifiable .lw-opt-check__mark,
  .lw-opt-check.is-not_applicable .lw-opt-check__mark { color: #8a949c; }
  .lw-opt-check.is-checking .lw-opt-check__mark::before {
    content: "";
    display: inline-block;
    width: 9px;
    height: 9px;
    border: 2px solid #d9d3f7;
    border-top-color: #6a4fd0;
    border-radius: 50%;
    animation: lw-scan-spin 0.8s linear infinite;
  }
  .lw-opt-check__text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .lw-opt-check__label {
    font-weight: 600;
    color: #1a1a1a;
  }
  .lw-opt-check.is-unverifiable .lw-opt-check__label { color: #56687a; }
  .lw-opt-check__tag {
    margin-left: 6px;
    font-size: 10px;
    font-weight: 600;
    color: #5b3fb5;
    background: #f1edfc;
    border-radius: 8px;
    padding: 0 5px;
    vertical-align: 1px;
  }
  .lw-opt-check__detail {
    font-size: 12px;
    color: #56687a;
    overflow-wrap: anywhere;
  }
  .lw-opt-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .lw-opt-summary__count {
    font-size: 12px;
    font-weight: 600;
    color: #38434f;
  }
  .lw-opt-tips {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lw-opt-actions {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
  }
  .lw-opt-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lw-opt-form label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 11.5px;
    color: #56687a;
  }
  .lw-opt-options {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lw-opt-option {
    border: 1px solid #e1e6ea;
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lw-opt-option__label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #5b3fb5;
    font-weight: 600;
  }
  .lw-opt-option__text {
    margin: 0;
    font-weight: 600;
  }
  .lw-opt-option__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: #8a949c;
  }

  .lw-welcome {
    display: block;
    width: calc(100% + 20px);
    max-width: none;
    height: auto;
    margin: -10px -10px -4px;
    border-radius: 12px;
    pointer-events: none;
    user-select: none;
  }
  .lw-menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lw-menu .lw-menu__item {
    padding: 12px 14px;
    box-shadow: none;
  }
  .lw-menu .lw-menu__item:hover {
    background: #f7f9fb;
    border-color: #c9d6e2;
    box-shadow: none;
  }
  .lw-faq {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 6px;
  }
  .lw-faq__heading {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .lw-faq__heading::before,
  .lw-faq__heading::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #e1e6ea;
  }
  .lw-faq__title {
    margin: 0;
    font-size: 14.5px;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: #0a1230;
    text-align: center;
    white-space: nowrap;
  }
  .lw-faq__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lw-faq__item {
    background: #fff;
    border: 1px solid #e1e6ea;
    border-radius: 10px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    overflow: hidden;
  }
  .lw-faq__question {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 12px 14px 12px 18px;
    font: inherit;
    font-weight: 700;
    text-align: left;
    color: #0a1230;
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .lw-faq__question:hover {
    background: #f7f9fb;
  }
  .lw-faq__question:focus-visible {
    outline: 2px solid #0a66c2;
    outline-offset: -2px;
  }
  .lw-faq__chevron {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: #56687a;
    border: 1px solid #e1e6ea;
    border-radius: 50%;
    transition: transform 0.2s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .lw-faq__item--open .lw-faq__chevron {
    transform: rotate(180deg);
    color: #0a66c2;
    border-color: #b9cfe6;
  }
  .lw-faq__answer {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.22s ease;
  }
  .lw-faq__item--open .lw-faq__answer {
    grid-template-rows: 1fr;
  }
  .lw-faq__answer-inner {
    overflow: hidden;
    min-height: 0;
    visibility: hidden;
    transition: visibility 0s 0.22s;
  }
  .lw-faq__item--open .lw-faq__answer-inner {
    visibility: visible;
    transition-delay: 0s;
  }
  .lw-faq__answer-inner p {
    margin: 0;
    padding: 0 18px 14px;
    color: #232f46;
    line-height: 1.55;
  }
  @media (prefers-reduced-motion: reduce) {
    .lw-faq__answer,
    .lw-faq__chevron {
      transition: none;
    }
  }
  .lw-tool-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lw-tool-head__title {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: #1a1a1a;
  }
  .lw-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .lw-settings__group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lw-art-hero {
    position: relative;
    container-type: inline-size;
    flex-shrink: 0;
    margin: -16px -16px 0;
    line-height: 0;
    background: #060c26;
  }
  .lw-art-hero__art {
    display: block;
    width: 100%;
    height: auto;
    pointer-events: none;
    user-select: none;
  }
  .lw-art-hero__hotspot {
    position: absolute;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    box-shadow: none;
    color: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    -webkit-tap-highlight-color: transparent;
  }
  .lw-art-hero__hotspot:focus {
    outline: none;
  }
  .lw-art-hero__hotspot:focus-visible {
    outline: 2px solid rgba(150, 180, 255, 0.75);
    outline-offset: -2px;
  }
  /* Bounds of the buttons drawn in each artwork, as fractions of its size. */
  .lw-art-hero--analyzer .lw-art-hero__hotspot {
    top: 11.2%;
    height: 23.6%;
  }
  .lw-art-hero--analyzer .lw-art-hero__hotspot--menu {
    left: 4.8%;
    width: 13.8%;
    border-radius: 24%;
  }
  .lw-art-hero--analyzer .lw-art-hero__hotspot--settings {
    right: 5.5%;
    width: 13.3%;
    border-radius: 50%;
  }
  .lw-art-hero--settings .lw-art-hero__hotspot {
    top: 12.2%;
    width: 11.7%;
    height: 20%;
    border-radius: 24%;
  }
  .lw-art-hero--settings .lw-art-hero__hotspot--back {
    left: 4.9%;
  }
  .lw-art-hero--settings .lw-art-hero__hotspot--menu {
    left: 19.9%;
  }
  .lw-art-hero--optimizer .lw-art-hero__hotspot {
    top: 15.6%;
    height: 22.9%;
  }
  .lw-art-hero--optimizer .lw-art-hero__hotspot--menu {
    left: 4.8%;
    width: 13.8%;
    border-radius: 24%;
  }
  .lw-art-hero--optimizer .lw-art-hero__hotspot--settings {
    right: 5.3%;
    width: 13.5%;
    border-radius: 50%;
  }
  /* The Job Analyzer artwork's own button bounds; its title and subtitle share the Optimizer's rules above.
     The artwork draws two glow lines across its top edge; the Analyzer's has one. The top 22px (1.35% of
     its width) are cropped so only the lower line is left, and the zones below are measured from there. */
  .lw-art-hero--jobs {
    overflow: hidden;
  }
  .lw-art-hero--jobs .lw-art-hero__art {
    margin-top: -1.352cqw;
  }
  .lw-art-hero.lw-art-hero--jobs .lw-art-hero__copy {
    left: 4.8%;
    top: 44.4%;
  }
  .lw-art-hero.lw-art-hero--jobs .lw-art-hero__title {
    font-size: 7.9cqw;
  }
  .lw-art-hero.lw-art-hero--jobs .lw-art-hero__subtitle {
    margin-top: 1.5cqw;
    font-size: 3.7cqw;
    line-height: 1.36;
  }
  .lw-art-hero--jobs .lw-art-hero__hotspot {
    top: 10.4%;
    height: 21.2%;
  }
  .lw-art-hero--jobs .lw-art-hero__hotspot--menu {
    left: 4.8%;
    width: 13%;
    border-radius: 24%;
  }
  .lw-art-hero--jobs .lw-art-hero__hotspot--settings {
    right: 6.6%;
    width: 12.9%;
    border-radius: 50%;
  }
  /* The Analyzer's zones: buttons in their own row, then the title and subtitle below them at the
     Analyzer's scale. The artwork's illustration sits right of 61%, where the one-line title ends. */
  .lw-art-hero--optimizer .lw-art-hero__copy {
    left: 5.5%;
    top: 47%;
    max-width: none;
  }
  .lw-art-hero--optimizer .lw-art-hero__title {
    font-size: 7.2cqw;
    line-height: 1.1;
    white-space: nowrap;
  }
  .lw-art-hero--optimizer .lw-art-hero__subtitle {
    margin-top: 1.6cqw;
    font-size: 4cqw;
    line-height: 1.32;
    color: rgba(255, 255, 255, 0.9);
  }
  .lw-art-hero--optimizer .lw-art-hero__subtitle > span {
    display: block;
    white-space: nowrap;
  }
  /* Live text laid over artwork, sized in container widths so it scales with the image the way
     the Analyzer artwork's drawn title does, and placed where that title sits. */
  .lw-art-hero__copy {
    position: absolute;
    left: 5.9%;
    top: 42.5%;
    max-width: 52%;
    line-height: normal;
    pointer-events: none;
  }
  .lw-art-hero__title {
    margin: 0;
    font-size: 7.7cqw;
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: #ffffff;
    text-shadow: 0 0 2.4cqw rgba(140, 165, 255, 0.35);
  }
  .lw-art-hero__subtitle {
    margin: 1.9cqw 0 0;
    font-size: 3.95cqw;
    font-weight: 400;
    line-height: 1.33;
    color: #dfe3fb;
  }
  .lw-an-goal {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid #e1e6ea;
    border-radius: 10px;
    background: #fff;
  }
  .lw-an-goal__text {
    flex: 1;
    min-width: 0;
  }
  .lw-an-goal__label {
    font-size: 11.5px;
    color: #56687a;
  }
  .lw-an-goal__text p {
    margin: 2px 0 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .lw-an-score {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 16px 14px 14px;
    border: 1px solid #e1e6ea;
    border-top: 4px solid;
    border-radius: 12px;
    background: #fff;
    text-align: center;
  }
  .lw-an-score__level {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .lw-an-score__value {
    font-size: 40px;
    font-weight: 700;
    line-height: 1.1;
    color: #1a1a1a;
  }
  .lw-an-score__goal {
    font-weight: 600;
    color: #38434f;
  }
  .lw-an-score__source,
  .lw-an-score__note {
    font-size: 11.5px;
    color: #56687a;
    margin: 0;
  }
  .lw-an-compact {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
  }
  .lw-an-compact strong {
    font-size: 16px;
  }
  .lw-an-page-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .lw-an-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border: 1px solid #e1e6ea;
    border-radius: 12px;
    background: #fff;
  }
  .lw-an-card p {
    margin: 0;
    line-height: 1.45;
  }
  .lw-an-heading {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #1a1a1a;
  }
  .lw-an-summary {
    color: #38434f;
  }
  .lw-an-recommendation {
    font-weight: 700;
    color: #0a66c2;
  }
  .lw-an-more {
    align-self: flex-start;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: #0a66c2;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .lw-an-points {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lw-an-points li {
    position: relative;
    padding-left: 20px;
  }
  .lw-an-points li::before {
    position: absolute;
    left: 0;
    font-weight: 700;
  }
  .lw-an-points li.is-good::before { content: "✓"; color: #057642; }
  .lw-an-points li.is-gap::before { content: "!"; color: #8a6d00; left: 4px; }
  .lw-an-points--detailed li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .lw-an-points--detailed span {
    color: #56687a;
  }
  .lw-an-criteria {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lw-an-criteria li + li {
    padding-top: 10px;
    border-top: 1px solid #eef1f4;
  }
  .lw-an-criteria__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  .lw-an-criteria__label {
    font-weight: 600;
  }
  .lw-an-criteria__importance {
    font-size: 11px;
    color: #8a949c;
  }
  .lw-an-criteria__note {
    font-size: 12px;
    color: #56687a;
  }
  .lw-an-chip {
    font-size: 11px;
    font-weight: 600;
    border-radius: 10px;
    padding: 1px 8px;
    white-space: nowrap;
    background: #f0f2f5;
    color: #56687a;
  }
  .lw-an-chip.is-strong { background: #e6f4ea; color: #057642; }
  .lw-an-chip.is-moderate { background: #fff4e5; color: #8a6d00; }
  .lw-an-chip.is-weak, .lw-an-chip.is-missing { background: #fdecea; color: #b24020; }
  .lw-an-quote {
    margin: 4px 0 0;
    padding: 4px 8px;
    border-left: 3px solid #d0d7dd;
    font-size: 12px;
    color: #38434f;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .lw-an-evidence {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lw-an-evidence li {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 12.5px;
  }
  .lw-an-evidence__full {
    font-size: 12px;
    color: #56687a;
  }
  .lw-an-evidence__full summary {
    cursor: pointer;
    color: #0a66c2;
  }
  .lw-an-evidence__section {
    font-size: 11px;
    color: #8a949c;
  }
  .lw-opt-card__text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .lw-opt-card__subtitle {
    font-size: 11.5px;
    color: #56687a;
  }

  .lw-fa {
    gap: 14px;
  }
  .lw-fa-label {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--lw-section-label);
  }
  .lw-fa-summary {
    padding: 14px 14px 14px 16px;
    border-radius: 12px;
    background: #fff;
    border: 1px solid #dbe6f1;
    border-left: 4px solid #0a66c2;
  }
  .lw-fa-summary p {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: #1a1a1a;
  }
  .lw-fa-decision {
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid;
  }
  .lw-fa-decision p {
    margin: 0;
  }
  .lw-fa-decision.is-good { background: #f1f9f4; border-color: #c7e6d3; }
  .lw-fa-decision.is-maybe { background: #fffaf0; border-color: #f0dcae; }
  .lw-fa-decision.is-weak { background: #fdf3f1; border-color: #f0cfc8; }
  .lw-fa-decision__headline {
    font-size: 16px;
    font-weight: 700;
  }
  .lw-fa-decision.is-good .lw-fa-decision__headline { color: #057642; }
  .lw-fa-decision.is-maybe .lw-fa-decision__headline { color: #8a6d00; }
  .lw-fa-decision.is-weak .lw-fa-decision__headline { color: #b24020; }
  .lw-fa-decision__detail {
    font-weight: 600;
    color: #38434f;
  }
  .lw-fa-decision__reason {
    margin-top: 6px !important;
    color: #38434f;
    line-height: 1.45;
  }
  .lw-fa-decision .lw-an-more {
    margin-top: 6px;
  }
  .lw-fa-list {
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid;
  }
  .lw-fa-list.is-match { background: #f4faf6; border-color: #d3eadb; }
  .lw-fa-list.is-gap { background: #fffbf3; border-color: #f2e2bd; }
  .lw-fa-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lw-fa-list li {
    position: relative;
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.4;
  }
  .lw-fa-list li::before {
    position: absolute;
    left: 0;
    top: 0;
    font-weight: 700;
  }
  .lw-fa-list.is-match li::before { content: "✓"; color: #057642; }
  .lw-fa-list.is-gap li::before { content: "!"; color: #8a6d00; left: 5px; }
  .lw-fa-list strong {
    color: #1a1a1a;
  }
  .lw-fa-list span {
    color: #56687a;
    font-size: 12.5px;
  }
  .lw-fa-experience {
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid #e4e9ed;
    background: #fafbfc;
  }
  .lw-fa-experience > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .lw-fa-experience .lw-fa-label {
    margin: 0;
  }
  .lw-fa-experience__level {
    font-weight: 700;
    color: #1a1a1a;
  }
  .lw-fa-experience p {
    margin: 4px 0 0;
    font-size: 12.5px;
    color: #56687a;
    line-height: 1.4;
  }
  .lw-fa-criteria {
    display: flex;
    flex-direction: column;
  }
  .lw-fa-criterion {
    border: 1px solid #e4e9ed;
    background: #fff;
  }
  .lw-fa-criterion + .lw-fa-criterion {
    border-top: none;
  }
  .lw-fa-criterion:first-of-type {
    border-radius: 10px 10px 0 0;
  }
  .lw-fa-criterion:last-of-type {
    border-radius: 0 0 10px 10px;
  }
  .lw-fa-criterion:only-of-type {
    border-radius: 10px;
  }
  .lw-fa-criterion summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    cursor: pointer;
    list-style: none;
  }
  .lw-fa-criterion summary::-webkit-details-marker {
    display: none;
  }
  .lw-fa-criterion summary::after {
    content: "›";
    color: #8a949c;
    font-size: 16px;
    transition: transform 0.15s ease;
  }
  .lw-fa-criterion[open] summary::after {
    transform: rotate(90deg);
  }
  .lw-fa-criterion__label {
    flex: 1;
    font-weight: 600;
  }
  .lw-fa-criterion__body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 12px 12px;
  }

  .lw-sp-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: 8px 12px;
    border: 1px solid #e1e6ea;
    border-radius: 10px;
    background: #f8fafc;
  }
  .lw-sp-bar .lw-button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .lw-sp-saved {
    font-weight: 700;
    color: #057642;
  }
  .lw-sp-bar__status {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    color: #38434f;
  }
  .lw-sp-delta {
    font-weight: 700;
    border-radius: 10px;
    padding: 0 7px;
  }
  .lw-sp-delta.is-improved { color: #057642; background: #e6f4ea; }
  .lw-sp-delta.is-weaker { color: #8a5a00; background: #fff4e5; }
  .lw-sp-match {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
  }
  .lw-sp-match > div {
    display: flex;
    flex-direction: column;
  }
  .lw-sp-match strong {
    font-size: 20px;
  }
  .lw-sp-match__label,
  .lw-sp-note {
    font-size: 12px;
    color: #56687a;
  }
  .lw-sp-match .lw-sp-note {
    width: 100%;
    margin: 0;
  }
  .lw-sp-explanations,
  .lw-sp-changes,
  .lw-sp-history {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lw-sp-explanations li {
    font-size: 12.5px;
    color: #38434f;
  }
  .lw-sp-change {
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    border-left: 3px solid;
  }
  .lw-sp-change.is-improved { border-color: #1e7b34; background: #f1f8f3; }
  .lw-sp-change.is-changed { border-color: #0a66c2; background: #f0f6fc; }
  .lw-sp-change.is-weaker { border-color: #c37d0d; background: #fff8ec; }
  .lw-sp-change__icon {
    font-weight: 700;
    width: 14px;
    flex-shrink: 0;
  }
  .lw-sp-change__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .lw-sp-change__title {
    font-weight: 700;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: baseline;
  }
  .lw-sp-change__type {
    font-size: 11px;
    font-weight: 600;
    color: #56687a;
  }
  .lw-sp-change__detail {
    font-size: 12px;
    color: #38434f;
  }
  .lw-sp-history summary {
    display: flex;
    gap: 10px;
    cursor: pointer;
    font-size: 12.5px;
  }
  .lw-sp-history summary span:first-child {
    flex: 1;
    font-weight: 600;
  }
  .lw-sp-history details > :not(summary) {
    margin-top: 6px;
  }
  .lw-sp-recommendation {
    font-weight: 700;
  }
  .lw-sp-notes {
    font: inherit;
    min-height: 64px;
    resize: vertical;
    padding: 8px;
    border: 1px solid #d0d7dd;
    border-radius: 8px;
  }
  .lw-sp-link {
    color: #0a66c2;
  }
  .lw-sp-remove {
    align-self: flex-start;
    font: inherit;
    color: #b24020;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  /* Profile Optimizer detail page: flat sections separated by dividers, actions pinned below. */
  .lw-od {
    display: flex;
    flex-direction: column;
  }
  .lw-od-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e8ecef;
  }
  .lw-od-nav > .lw-nav-button:first-child {
    margin-right: 2px;
  }
  .lw-od-nav__center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 0 2px;
    text-align: center;
  }
  .lw-od-nav__title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    max-width: 100%;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
    color: #1d2226;
  }
  .lw-od-nav__name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .lw-od-nav__icon {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    color: #3f67d8;
  }
  .lw-od-count {
    font-size: 11.5px;
    font-weight: 600;
    color: #8a949c;
    font-variant-numeric: tabular-nums;
  }
  .lw-od-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px 0 16px;
    border-bottom: 1px solid #e8ecef;
  }
  .lw-od-title {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
    color: #1a1a1a;
  }
  .lw-od-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .lw-od-status__text {
    font-size: 12.5px;
    font-weight: 600;
    color: #38434f;
  }
  .lw-od-description {
    margin: 2px 0 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: #56687a;
  }
  .lw-od-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 18px 0;
    border-bottom: 1px solid #e8ecef;
  }
  .lw-od-heading {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--lw-section-label);
  }
  .lw-od-checks {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .lw-od-check {
    display: flex;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid #f0f2f4;
  }
  .lw-od-check:last-child {
    border-bottom: none;
  }
  .lw-od-check__mark {
    flex-shrink: 0;
    width: 16px;
    font-weight: 700;
    text-align: center;
    line-height: 1.4;
  }
  .lw-od-check.is-pass .lw-od-check__mark { color: #1e7b34; }
  .lw-od-check.is-improve .lw-od-check__mark { color: #c37d0d; }
  .lw-od-check.is-unverifiable .lw-od-check__mark,
  .lw-od-check.is-not_applicable .lw-od-check__mark { color: #9aa4ad; }
  .lw-od-check.is-checking .lw-od-check__mark::before {
    content: "";
    display: inline-block;
    width: 9px;
    height: 9px;
    border: 2px solid #d9d3f7;
    border-top-color: #6a4fd0;
    border-radius: 50%;
    animation: lw-scan-spin 0.8s linear infinite;
  }
  .lw-od-check__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  /* Checks only the user can make: a quiet "yours to check" mark, never an error. */
  .lw-od-check.is-needs_user .lw-od-check__mark {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    border-radius: 50%;
    background: #f2f5fe;
    box-shadow: inset 0 0 0 1.5px #b9c8f5;
    color: #2f5be0;
  }
  .lw-od-check.is-own .lw-od-check__text {
    flex: 1;
  }
  .lw-od-answer {
    display: flex;
    align-self: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .lw-od-answer__btn {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid #dbe2ec;
    border-radius: 8px;
    background: #fff;
    color: #8a94a3;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .lw-od-answer__btn:hover {
    border-color: #b9c8f5;
    background: #f5f8ff;
    color: #2f5be0;
  }
  .lw-od-answer__btn:focus-visible {
    outline: 2px solid #2f5be0;
    outline-offset: 1px;
  }
  .lw-od-answer {
    position: relative;
  }
  .lw-od-answer__btn svg {
    width: 14px;
    height: 14px;
  }
  .lw-od-answer__btn.is-set {
    border-color: #b9c8f5;
    background: #eef3fe;
    color: #2f5be0;
  }
  .lw-od-menu {
    position: absolute;
    z-index: 5;
    top: 32px;
    right: 0;
    display: flex;
    flex-direction: column;
    min-width: 170px;
    padding: 4px;
    background: #fff;
    border: 1px solid #dbe2ec;
    border-radius: 10px;
    box-shadow: 0 6px 18px rgba(16, 24, 40, 0.14);
  }
  .lw-od-menu__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 0;
    border-radius: 7px;
    background: none;
    font: inherit;
    font-size: 12.5px;
    color: #1d2226;
    text-align: left;
    cursor: pointer;
  }
  .lw-od-menu__item:hover {
    background: #f1f5fe;
  }
  .lw-od-menu__item[aria-checked="true"] {
    background: #eef3fe;
    font-weight: 700;
  }
  .lw-od-menu__item span {
    width: 14px;
    font-weight: 800;
    text-align: center;
  }
  .lw-od-menu__item.is-yes span {
    color: #1a7f45;
  }
  .lw-od-menu__item.is-no span {
    color: #a86f00;
  }
  /* The writing pages (Headline, About) share the Optimizer's look: white rounded cards, blue accent. */
  .lw-gen {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .lw-gen-nav__spacer {
    flex: none;
    width: 42px;
  }
  .lw-gen-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lw-gen-block__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .lw-gen-block .lw-opt-group__title {
    margin: 0;
  }
  .lw-gen-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
  }
  .lw-gen-current {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: #1d2226;
    white-space: pre-wrap;
    max-height: 150px;
    overflow-y: auto;
  }
  .lw-gen-current.is-empty,
  .lw-gen-help,
  .lw-gen-note {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: #56687a;
  }
  .lw-gen-input {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 11px;
    font: inherit;
    font-size: 13.5px;
    color: #1d2226;
    background: #f8fafc;
    border: 1px solid #dbe2ec;
    border-radius: 10px;
    resize: vertical;
  }
  .lw-gen-input--area {
    display: block;
    min-height: 88px;
    padding: 11px 14px;
    line-height: 1.5;
    overflow-y: hidden;
    overflow-wrap: anywhere;
    resize: vertical;
    scrollbar-width: thin;
  }
  .lw-gen-input:focus {
    outline: none;
    border-color: #2f5be0;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(47, 91, 224, 0.15);
  }
  .lw-gen-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .lw-gen-chip {
    padding: 6px 12px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: #1d2226;
    background: #f8fafc;
    border: 1px solid #dbe2ec;
    border-radius: 999px;
    cursor: pointer;
  }
  .lw-gen-chip.is-on {
    color: #2f5be0;
    background: #eef3fe;
    border-color: #2f5be0;
  }
  .lw-primary-button {
    min-height: 42px;
    padding: 0 16px;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    background: #2f5be0;
    border: 0;
    border-radius: 12px;
    cursor: pointer;
  }
  .lw-primary-button:hover:not(:disabled) {
    background: #2650cc;
  }
  .lw-primary-button:active:not(:disabled) {
    background: #1f43b3;
  }
  .lw-primary-button:disabled {
    background: #b9c8f5;
    cursor: default;
  }
  .lw-gen-link {
    padding: 0;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: #2f5be0;
    background: none;
    border: 0;
    cursor: pointer;
  }
  .lw-gen-link:disabled {
    color: #9aa8c7;
    cursor: default;
  }
  .lw-gen-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lw-gen-option {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: #f8fafc;
    border: 1px solid #e0e6ef;
    border-radius: 12px;
  }
  .lw-gen-option__label {
    align-self: flex-start;
    padding: 3px 10px;
    border-radius: 999px;
    background: #eef3fe;
    color: #2f5be0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .lw-gen-option__text {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: #1d2226;
  }
  .lw-gen-option__text--paragraphs {
    white-space: pre-wrap;
  }
  .lw-gen-option__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: #6b7585;
  }
  .lw-gen-copy {
    padding: 5px 12px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: #2f5be0;
    background: #fff;
    border: 1px solid #c9d6f6;
    border-radius: 9px;
    cursor: pointer;
  }
  /* Job Analyzer: functional for now, restyled later. */
  .lw-ja {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .lw-ja-block h4 {
    margin: 0 0 6px;
  }
  .lw-ja-sub {
    margin: 8px 0 2px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #56687a;
  }
  .lw-ja-score,
  .lw-ja-pay {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: #1d2226;
  }
  .lw-ja-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
  }
  .lw-ja-chip {
    padding: 3px 10px;
    border-radius: 999px;
    background: #eef3fe;
    color: #2f5be0;
    font-size: 12px;
    font-weight: 600;
  }
  .lw-ja-criteria li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .lw-ja-status {
    font-size: 12px;
    font-weight: 700;
    color: #2f5be0;
  }
  .lw-ja-match--strong .lw-ja-status,
  .lw-ja-match--match .lw-ja-status {
    color: #1a7f45;
  }
  .lw-ja-match--none .lw-ja-status {
    color: #b42318;
  }
  .lw-ja-match--unknown .lw-ja-status {
    color: #6b7585;
  }
  .lw-ja-reason {
    font-size: 12.5px;
    color: #56687a;
  }
  .lw-ja-evidence {
    font-size: 12px;
    color: #6b7585;
  }
  /* Job filters (in Settings): the Optimizer's card look, a divider above, and the blue selected state. */
  .lw-settings__group.lw-jobs-page {
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid #e8ecef;
  }
  .lw-jobs-page .lw-scan-mode__hint {
    font-size: 12px;
    line-height: 1.45;
    color: #56687a;
  }
  .lw-jobs-page .lw-opt-block {
    gap: 10px;
    padding: 14px 16px;
    border-color: #e0e6ef;
    border-radius: 15px;
  }
  .lw-jobs-page .lw-job-rule {
    gap: 7px;
  }
  .lw-jobs-page .lw-job-rule + .lw-job-rule {
    padding-top: 10px;
  }
  .lw-jobs-page .lw-job-rule__label {
    font-size: 12.5px;
    color: #1d2226;
  }
  .lw-jobs-page .lw-scan-mode__control {
    border-color: #dbe2ec;
    border-radius: 10px;
    background: #f8fafc;
  }
  .lw-jobs-page .lw-scan-mode__option {
    padding: 7px 8px;
    font-size: 12px;
    background: transparent;
  }
  .lw-jobs-page .lw-scan-mode__option + .lw-scan-mode__option {
    border-left-color: #dbe2ec;
  }
  .lw-jobs-page .lw-scan-mode__option.is-active {
    background: #2f5be0;
    color: #fff;
  }
  .lw-jobs-page .lw-keywords__input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    font: inherit;
    font-size: 13.5px;
    line-height: 1.5;
    color: #1d2226;
    background: #f8fafc;
    border: 1px solid #dbe2ec;
    border-radius: 10px;
    resize: vertical;
  }
  .lw-jobs-page .lw-keywords__input:focus {
    outline: none;
    border-color: #2f5be0;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(47, 91, 224, 0.15);
  }
  .lw-jobs-page .lw-expand-details {
    gap: 8px;
    font-size: 12.5px;
    line-height: 1.3;
  }
  .lw-jobs-page .lw-expand-details input {
    width: 15px;
    height: 15px;
    flex: none;
    accent-color: #2f5be0;
  }
  .lw-jobs-active {
    background: #f8fafc;
  }
  .lw-jobs-active .lw-opt-tips {
    gap: 6px;
    font-size: 12.5px;
    line-height: 1.4;
    color: #1d2226;
  }
  .lw-jobs-active .lw-opt-tips li::marker {
    color: #2f5be0;
  }
  .lw-od-note {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lw-od-note__help {
    font-size: 12.5px;
    color: #56687a;
  }
  .lw-od-note__actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .lw-od-note__status {
    font-size: 12px;
    color: #6b7585;
  }
  .lw-od-note__visible {
    padding: 10px 12px;
    border-radius: 10px;
    background: #f2f5fe;
  }
  .lw-od-note__visible p {
    margin: 0 0 6px;
    font-size: 13px;
    line-height: 1.45;
    color: #1d2226;
  }
  .lw-od-note__visible .lw-od-tips {
    margin: 0;
  }
  .lw-od-review-note {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 4px;
    padding: 8px 10px;
    border-radius: 10px;
    background: #f2f5fe;
    color: #2f4fb0;
    font-size: 12.5px;
    line-height: 1.4;
  }
  .lw-od-review-note svg {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
  }
  .lw-od-check__label {
    font-weight: 600;
    color: #1a1a1a;
  }
  .lw-od-check.is-unverifiable .lw-od-check__label,
  .lw-od-check.is-not_applicable .lw-od-check__label {
    font-weight: 500;
    color: #56687a;
  }
  .lw-od-check__detail {
    font-size: 12px;
    line-height: 1.45;
    color: #6b7882;
    overflow-wrap: anywhere;
  }
  .lw-od-tips {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    line-height: 1.5;
    color: #38434f;
  }
  /* The action area is exactly as tall as its buttons: it never grows to fill the panel, so a short
     page ends shortly after the button and any spare room is just empty panel. It stays sticky,
     which only matters when the page is taller than the panel. */
  .lw-od,
  .lw-optimizer {
    flex: none;
    min-height: 0;
  }
  .lw-od-actions {
    position: sticky;
    bottom: -16px;
    z-index: 1;
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 8px;
    height: auto;
    min-height: 0;
    margin: 4px -16px -16px;
    padding: 12px 16px 14px;
    background: #fff;
    border-top: 1px solid #e1e6ea;
    box-shadow: 0 -4px 10px rgba(0, 0, 0, 0.04);
  }
  .lw-od-actions .lw-button {
    flex: 1;
    min-width: 0;
  }
  .lw-od-actions__note {
    width: 100%;
    margin: 0;
    font-size: 12px;
    color: #56687a;
  }
  .lw-opt-groups {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lw-opt-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lw-opt-group__title {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--lw-section-label);
  }
  /* The Optimizer's section lists read as one grouped module, like the highlight categories:
     one bordered container, flat rows divided by hairlines that start after the icon tile. */
  .lw-opt-groups .lw-opt-cards {
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    background: #fff;
    border: 1px solid #e0e6ef;
    border-radius: 15px;
    overflow: hidden;
  }
  .lw-opt-groups .lw-opt-card {
    position: relative;
    gap: 12px;
    padding: 11px 14px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: #fff;
  }
  .lw-opt-groups .lw-opt-cards > :not(:last-child)::after,
  .lw-opt-groups .lw-opt-cards > li:not(:last-child) > .lw-opt-card::after {
    content: "";
    position: absolute;
    left: 64px;
    right: 0;
    bottom: 0;
    height: 1px;
    background: #e8ecf3;
  }
  .lw-opt-groups .lw-opt-cards > li:not(:last-child)::after {
    content: none;
  }
  .lw-opt-groups .lw-opt-card:hover {
    background: #f8faff;
    box-shadow: none;
  }
  .lw-opt-groups .lw-opt-card:focus-visible {
    outline: 2px solid #2f5be0;
    outline-offset: -2px;
  }
  .lw-opt-card__tile,
  .lw-opt-priority__rank {
    flex: none;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: #eef3fe;
    color: #2f5be0;
  }
  .lw-opt-card__tile .lw-opt-card__icon {
    width: 20px;
    height: 20px;
    color: inherit;
  }
  .lw-opt-priority__rank {
    font-size: 14px;
    font-weight: 700;
  }
  .lw-opt-groups .lw-opt-card__title {
    font-size: 14px;
    color: #1d2226;
  }
  .lw-opt-card__title {
    min-width: 0;
  }
  svg.lw-opt-card__chevron {
    flex: none;
    width: 18px;
    height: 18px;
    color: #9aa3b2;
  }
  .lw-opt-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 11.5px;
    font-weight: 800;
    color: #fff;
  }
  /* Strong, needs work, or missing / not verified: green, amber, quiet gray. Never red. */
  .lw-opt-status.is-strong { background: #1f9d55; }
  .lw-opt-status.is-improve { background: #e3a008; }
  .lw-opt-status.is-review { background: #eaf0fe; color: #2f5be0; box-shadow: inset 0 0 0 1.5px #b9c8f5; }
  .lw-opt-card__note {
    flex-shrink: 0;
    font-size: 11.5px;
    color: #5b6b85;
    white-space: nowrap;
  }
  .lw-opt-status.is-add,
  .lw-opt-status.is-partial,
  .lw-opt-status.is-unverifiable { background: #e6e9ef; color: #6b7585; }

  /* White functional cards under the dark hero: the score and the user's own context. */
  .lw-opt-block-card {
    padding: 14px 16px;
    background: #fff;
    border: 1px solid #e0e6ef;
    border-radius: 15px;
  }
  .lw-optimizer .lw-optimizer__result {
    gap: 6px;
  }
  .lw-optimizer__result .lw-optimizer__score {
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 6px;
  }
  .lw-optimizer__result .lw-optimizer__score-value {
    font-size: 40px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #1d2226;
  }
  .lw-optimizer__result .lw-optimizer__score-label {
    font-size: 15px;
    font-weight: 600;
    color: #6b7585;
  }
  .lw-optimizer__band {
    margin-left: auto;
    align-self: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: #eef3fe;
    color: #2f5be0;
    font-size: 12px;
    font-weight: 700;
  }
  .lw-opt-score__more {
    align-self: flex-start;
  }
  .lw-opt-context__label {
    font-size: 14px;
    font-weight: 600;
    color: #1d2226;
  }
  .lw-opt-context__input {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 9px 11px;
    font: inherit;
    font-size: 13.5px;
    color: #1d2226;
    background: #f8fafc;
    border: 1px solid #dbe2ec;
    border-radius: 10px;
  }
  .lw-opt-context__input:focus {
    outline: none;
    border-color: #2f5be0;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(47, 91, 224, 0.15);
  }
  .lw-opt-context__help {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: #6b7585;
  }
  .lw-opt-priorities {
    gap: 6px;
  }
  .lw-dash {
    gap: 14px;
  }
  .lw-dash .lw-an-score .lw-sp-bar {
    margin-top: 8px;
    border: none;
    background: none;
    padding: 0;
    justify-content: center;
  }
  .lw-dash__block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 12px;
    border-top: 1px solid #e8ecef;
  }
  .lw-dash__label {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--lw-section-label);
  }
  .lw-dash .lw-an-summary {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: #1a1a1a;
  }
  .lw-key-evidence {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    line-height: 1.4;
    color: #1a1a1a;
  }
  .lw-key-evidence li::marker {
    color: #6a4fd0;
  }
  .lw-dash__none {
    margin: 0;
    font-size: 13px;
    color: #56687a;
  }
  .lw-dash .lw-an-points--detailed {
    gap: 8px;
  }
  .lw-dash .lw-an-points--detailed strong {
    font-weight: 600;
    color: #1a1a1a;
  }
  .lw-dash .lw-an-points--detailed span {
    font-size: 12.5px;
    line-height: 1.4;
  }
  .lw-hl {
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid #e8ecef;
  }
  .lw-hl .lw-an-heading {
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--lw-section-label);
    font-weight: 700;
  }

  /* Profile highlights in Settings: compact single-line rows. */
  .lw-highlighting {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lw-rules__label {
    margin: 6px 0 0;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--lw-section-label);
  }
  /* One grouped list of rows. No overflow clipping: a row's quick palette opens past the edge. */
  .lw-rules {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid #e0e6ef;
    border-radius: 15px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
  }
  .lw-rule {
    display: flex;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
  }
  /* Smart Highlights: the card art is one image (its sparkle tile included), with the real text
     and switch laid over it. Positions are fractions of the card, so they track the art. */
  .lw-sh {
    position: relative;
    aspect-ratio: 1676 / 713;
    border-radius: 16px;
    overflow: hidden;
    isolation: isolate;
    background: #141a5c;
    box-shadow: 0 8px 22px rgba(40, 52, 170, 0.26), 0 1px 2px rgba(15, 21, 70, 0.25);
    color: #fff;
  }
  .lw-sh--off {
    box-shadow: 0 4px 14px rgba(40, 52, 170, 0.15);
  }
  .lw-sh__art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
    user-select: none;
  }
  .lw-sh__content {
    position: absolute;
    inset: 0;
  }
  /* Beside the art's sparkle tile (5%–19% across, 15%–48% down). */
  .lw-sh__text {
    position: absolute;
    left: 23.5%;
    right: 22%;
    top: 16%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-shadow: 0 1px 6px rgba(8, 12, 50, 0.45);
  }
  .lw-sh__title {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .lw-sh__count {
    font-size: 14px;
    color: #c8cdf7;
  }
  .lw-sh__description {
    position: absolute;
    left: 5%;
    right: 6%;
    bottom: 9%;
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.35;
    color: #f7f8ff;
    text-shadow: 0 1px 6px rgba(8, 12, 50, 0.55);
  }
  .lw-sh__switch {
    position: absolute;
    right: 4.5%;
    top: 20%;
    appearance: none;
    width: 46px;
    height: 27px;
    margin: 0;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.16);
    cursor: pointer;
    transition: background 0.18s ease, box-shadow 0.18s ease;
  }
  .lw-sh__switch::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 21px;
    height: 21px;
    border-radius: 50%;
    background: #f2f4ff;
    box-shadow: 0 1px 3px rgba(10, 15, 60, 0.35);
    transition: transform 0.18s ease;
  }
  .lw-sh__switch:checked {
    border-color: rgba(150, 200, 255, 0.55);
    background: linear-gradient(90deg, #3b6cf6, #3fa9f5);
    box-shadow: 0 0 10px rgba(63, 140, 245, 0.35);
  }
  .lw-sh__switch:checked::after {
    transform: translateX(19px);
    background: #fff;
  }
  .lw-sh__switch:focus-visible {
    outline: 2px solid #a5b4fc;
    outline-offset: 2px;
  }

  .lw-rule--row {
    position: relative;
    min-height: 54px;
    padding: 0 8px 0 11px;
    cursor: pointer;
    transition: background-color 0.12s ease;
  }
  /* The divider starts after the icon, and the last row has none. */
  .lw-rule--row:not(:last-child)::after {
    content: "";
    position: absolute;
    left: 53px;
    right: 0;
    bottom: 0;
    height: 1px;
    background: #e8ecf3;
  }
  .lw-rule--row:first-child {
    border-radius: 14px 14px 0 0;
  }
  .lw-rule--row:last-child {
    border-radius: 0 0 14px 14px;
  }
  .lw-rule--row:hover {
    background: #f8faff;
  }
  .lw-rule--row:active {
    background: #eef3fd;
  }
  .lw-rule--disabled > :not(.lw-rule__more) {
    opacity: 0.5;
  }
  .lw-rule__tile {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #f1f5fe;
  }
  .lw-rule__name {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    color: #1d2a3a;
    text-align: left;
    cursor: pointer;
  }
  .lw-rule__name > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lw-rule__name:disabled,
  .lw-rule__more:disabled {
    cursor: default;
  }
  .lw-rule__icon {
    flex: none;
    width: 18px;
    height: 18px;
    color: #2563eb;
  }
  .lw-rule__divider {
    flex: none;
    width: 1px;
    height: 22px;
    background: #e3e8f0;
  }
  .lw-rule__more {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 32px;
    padding: 0;
    border: 0;
    background: none;
    color: #98a2ae;
    cursor: pointer;
  }
  .lw-rule__more svg {
    width: 17px;
    height: 17px;
  }
  .lw-rule__more:focus-visible,
  .lw-rule__name:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
    border-radius: 6px;
  }
  .lw-switch {
    flex: none;
    appearance: none;
    width: 34px;
    height: 20px;
    margin: 0;
    border-radius: 999px;
    background: #c3cad3;
    position: relative;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .lw-switch::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    transition: transform 0.15s ease;
  }
  .lw-switch:checked {
    background: #2563eb;
  }
  .lw-switch:checked::after {
    transform: translateX(14px);
  }
  .lw-switch:disabled {
    cursor: default;
  }
  .lw-switch:focus-visible,
  .lw-dot__button:focus-visible,
  .lw-swatch:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
  }
  .lw-dot {
    position: relative;
    display: inline-flex;
  }
  .lw-dot__button {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.14);
    border-radius: 50%;
    cursor: pointer;
  }
  .lw-dot__button:disabled {
    cursor: default;
  }
  .lw-dot__popover {
    position: absolute;
    top: calc(100% + 6px);
    right: -8px;
    z-index: 5;
    padding: 8px;
    border: 1px solid #e0e6ef;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 6px 18px rgba(16, 24, 40, 0.12);
  }
  .lw-dot__popover .lw-swatches {
    display: grid;
    grid-template-columns: repeat(5, 20px);
  }
  .lw-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .lw-swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.14);
    border-radius: 50%;
    cursor: pointer;
  }
  .lw-swatch--selected {
    outline: 2px solid #1d2226;
    outline-offset: 1px;
  }
  .lw-rules__reset {
    align-self: flex-start;
    margin-top: 2px;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 12px;
    color: #56687a;
    text-decoration: underline;
    cursor: pointer;
  }
  .lw-rule-detail {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .lw-rule-detail__head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .lw-rule-detail__nav {
    flex: none;
    display: flex;
    gap: 8px;
  }
  /* Compact navigation control (Back, Menu): same size, border, shadow, and states; only the icon
     differs. */
  .lw-nav-button {
    flex: none;
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    padding: 0;
    border: 1px solid #dce3f0;
    border-radius: 13px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(63, 103, 216, 0.06);
    color: #3f67d8;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.08s ease;
  }
  .lw-nav-button svg {
    width: 20px;
    height: 20px;
  }
  .lw-nav-button:hover {
    background: #f1f5fe;
    border-color: #b9c8ec;
    color: #2f54bf;
  }
  .lw-nav-button:active {
    transform: scale(0.96);
    background: #e8eefc;
  }
  .lw-nav-button:disabled,
  .lw-nav-button:disabled:hover {
    background: #f4f6f8;
    border-color: #e6eaee;
    box-shadow: none;
    color: #c2c9d0;
    cursor: default;
    transform: none;
  }
  .lw-nav-button:focus-visible {
    outline: none;
    border-color: #8fa8e6;
    box-shadow: 0 0 0 3px rgba(63, 103, 216, 0.22);
  }
  .lw-rule-detail__title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin: 0;
    font-size: 15px;
    color: #1d2226;
  }
  /* A long name ("Meaningful Numbers") wraps rather than being cut off beside the two buttons. */
  .lw-rule-detail__title > span {
    min-width: 0;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .lw-rule-detail__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .lw-rule-detail__words {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid #e0e6ef;
    border-radius: 14px;
    background: #fff;
  }

  /* Color editor: square + hue slider + values, sized for the 360px sidebar. */
  .lw-ce {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid #e0e6ef;
    border-radius: 14px;
    background: #fff;
  }
  .lw-ce__heading,
  .lw-live__heading {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--lw-section-label);
  }
  .lw-ce__main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 14px 112px;
    gap: 10px;
    margin-bottom: 4px;
  }
  .lw-ce__square {
    position: relative;
    aspect-ratio: 1;
    border-radius: 10px;
    background-image: linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, rgba(255, 255, 255, 0));
    cursor: crosshair;
    touch-action: none;
  }
  .lw-ce__square-thumb {
    position: absolute;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.3);
    pointer-events: none;
  }
  .lw-ce__hue {
    position: relative;
    border-radius: 7px;
    background: linear-gradient(to bottom, #f00 0%, #ff0 16.67%, #0f0 33.33%, #0ff 50%, #00f 66.67%, #f0f 83.33%, #f00 100%);
    cursor: ns-resize;
    touch-action: none;
  }
  .lw-ce__hue-thumb {
    position: absolute;
    left: -3px;
    right: -3px;
    height: 6px;
    margin-top: -3px;
    border: 2px solid #fff;
    border-radius: 4px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .lw-ce__square:focus-visible,
  .lw-ce__hue:focus-visible,
  .lw-ce__recent-color:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
  }
  .lw-ce__values {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .lw-ce__label {
    font-size: 11px;
    font-weight: 700;
    color: var(--lw-section-label);
  }
  .lw-ce__values .lw-ce__label:not(:first-child) {
    margin-top: 4px;
  }
  .lw-ce__preview {
    display: block;
    height: 30px;
    border: 1px solid #e0e6ef;
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
  }
  .lw-ce__preview > span {
    display: block;
    height: 100%;
  }
  .lw-ce__hex,
  .lw-ce__channel input {
    width: 100%;
    min-width: 0;
    height: 28px;
    border: 1px solid #d0d7dd;
    border-radius: 8px;
    background: #fff;
    font: inherit;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: #1d2226;
    text-align: center;
  }
  .lw-ce__hex[aria-invalid="true"] {
    border-color: #d97706;
  }
  .lw-ce__hex:focus,
  .lw-ce__channel input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18);
  }
  .lw-ce__rgb {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }
  .lw-ce__channel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
    font-size: 10px;
    font-weight: 700;
    color: #8a949c;
  }
  .lw-ce__channel input {
    padding: 0 2px;
  }
  .lw-ce__recent {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .lw-ce__recent-color {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.14);
    border-radius: 50%;
    cursor: pointer;
  }
  .lw-ce__recent-color--selected {
    outline: 2px solid #1d2226;
    outline-offset: 1px;
  }
  .lw-ce__opacity {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .lw-ce__opacity input {
    flex: 1;
    min-width: 0;
    height: 8px;
    margin: 0;
    border: 1px solid #e0e6ef;
    border-radius: 999px;
    appearance: none;
    cursor: pointer;
  }
  .lw-ce__opacity input::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border: 2px solid #2563eb;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  }
  .lw-ce__percent {
    flex: none;
    width: 38px;
    font-size: 12.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: #1d2226;
  }
  .lw-ce__hint {
    margin: -2px 0 0;
    font-size: 11px;
    color: #8a949c;
  }

  /* Highlight Style: six look cards, 3 per row. */
  .lw-hs {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid #e0e6ef;
    border-radius: 14px;
    background: #fff;
  }
  .lw-hs__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .lw-hs__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 11px 4px 9px;
    border: 1px solid #e0e6ef;
    border-radius: 11px;
    background: #fff;
    font: inherit;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }
  .lw-hs__card:hover {
    border-color: #c7d3ec;
    background: #fafcff;
  }
  .lw-hs__card--selected,
  .lw-hs__card--selected:hover {
    border-color: #3f67d8;
    background: #fff;
    box-shadow: 0 0 0 1px #3f67d8, 0 2px 8px rgba(63, 103, 216, 0.14);
  }
  .lw-hs__card:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
  }
  .lw-hs__sample {
    display: grid;
    place-items: center;
    height: 30px;
  }
  .lw-hs__mark {
    padding: 2px 6px;
    border-radius: 5px;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.25;
    color: #1d2226;
  }
  .lw-hs__label {
    max-width: 100%;
    font-size: 11.5px;
    font-weight: 600;
    color: #44505c;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Live Preview: miniature LinkedIn pieces, one under another, drawn like the profile. */
  .lw-live {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .lw-pv {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 13px;
    border: 1px solid #e0e6ef;
    border-radius: 13px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
    color: #1d2226;
    font-size: 13px;
    line-height: 1.45;
  }
  .lw-pv__icon {
    flex: none;
    width: 16px;
    height: 16px;
    color: #56687a;
  }
  .lw-pv__label {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #1d2226;
  }
  .lw-pv__author {
    display: flex;
    gap: 9px;
  }
  .lw-pv__avatar {
    flex: none;
    display: grid;
    place-items: end center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #dfe4ea;
    overflow: hidden;
  }
  .lw-pv__avatar-icon {
    width: 34px;
    height: 34px;
    margin-bottom: -6px;
    color: #9aa6b2;
    fill: #b5bfca;
    stroke: none;
  }
  .lw-pv__who,
  .lw-pv__entry-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .lw-pv__name,
  .lw-pv__title {
    font-size: 13.5px;
    font-weight: 600;
    color: #1d2226;
  }
  .lw-pv__degree {
    font-weight: 400;
    color: #6b7785;
  }
  .lw-pv__headline {
    font-size: 12px;
    color: #44505c;
  }
  .lw-pv__meta {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11.5px;
    color: #6b7785;
  }
  .lw-pv__globe {
    width: 12px;
    height: 12px;
    color: #6b7785;
  }
  .lw-pv__body,
  .lw-pv__line {
    margin: 0;
  }
  .lw-pv__line {
    margin-top: 6px;
    font-size: 12.5px;
    color: #2d3740;
  }
  .lw-pv__social {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid #eef1f4;
    font-size: 11.5px;
    color: #6b7785;
  }
  .lw-pv__reactions {
    display: inline-flex;
    align-items: center;
  }
  .lw-pv__reaction {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    margin-right: -3px;
    border: 1.5px solid #fff;
    border-radius: 50%;
  }
  .lw-pv__reaction:last-of-type {
    margin-right: 5px;
  }
  .lw-pv__reaction--like {
    background: #378fe9;
  }
  .lw-pv__reaction--celebrate {
    background: #44a14a;
  }
  .lw-pv__reaction--love {
    background: #df704d;
  }
  .lw-pv__reaction-icon {
    width: 9px;
    height: 9px;
    color: #fff;
    stroke-width: 2.6;
  }
  .lw-pv__entry {
    display: flex;
    gap: 10px;
  }
  .lw-pv__logo {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: #eef3f8;
  }
  .lw-pv__logo-icon {
    width: 20px;
    height: 20px;
    color: #56687a;
  }
  .lw-pv__bullets {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 6px 0 0;
    padding-left: 15px;
    font-size: 12.5px;
    color: #2d3740;
  }
  .lw-pv__bullets li::marker {
    color: #8a949c;
  }
  .lw-pv__pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lw-pv__pill {
    padding: 4px 11px;
    border-radius: 999px;
    background: #eef1f4;
    font-size: 12px;
    font-weight: 500;
    color: #44505c;
  }
  .lw-pv__pill--marked {
    color: #1d2226;
  }
  /* Only the shape here; the color and opacity come from the style being edited, as a translucent
     background, so the text itself stays fully opaque. */
  .lw-pv__mark {
    padding: 1px 2px;
    border-radius: 4px;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
`;
}
