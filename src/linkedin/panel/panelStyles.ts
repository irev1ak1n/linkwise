// Self-contained CSS for the panel's shadow root, isolated from LinkedIn's own stylesheet.
// Takes width as a parameter so mount.ts's PANEL_WIDTH_PX stays the one source of truth.
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

  /* Scan mode toggle, compact and secondary to the goal/analysis content around it. */
  .lw-scan-mode {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lw-scan-mode__label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #56687a;
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

  /* Compact checkbox next to the Scan mode toggle, only shown in "Analyze as I scroll". */
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

  /* Checkbox under the Scan mode toggle, only shown in "Auto scan profile". */
  .lw-enhanced-analysis__label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: #56687a;
    cursor: pointer;
  }
  .lw-enhanced-analysis__label input {
    margin: 0;
  }
  .lw-enhanced-analysis__hint {
    margin: 2px 0 0 20px;
    font-size: 11px;
    color: #8a949c;
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

  .lw-signals {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid #e0e0e0;
  }
  .lw-signals__toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .lw-signals__toggle input {
    margin: 0;
  }
  .lw-signals__hint {
    font-weight: 400;
    font-size: 11.5px;
    color: #8a949c;
    margin-left: 4px;
  }
  .lw-signals__count {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: #8a949c;
    margin-left: 4px;
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
  .lw-optimizer__context .lw-keywords__input {
    min-height: 0;
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
    letter-spacing: 0.04em;
    color: #56687a;
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
  .lw-tool-head--hero {
    position: relative;
    isolation: isolate;
    flex-shrink: 0;
    gap: 10px;
    margin: -16px -16px 0;
    padding: 18px 18px 20px;
    overflow: hidden;
    border-bottom: 1px solid #edf1fa;
    background:
      radial-gradient(150px 120px at 84% 66%, rgba(122, 150, 245, 0.16), transparent 72%),
      radial-gradient(260px 170px at 100% 30%, rgba(140, 120, 245, 0.07), transparent 70%),
      linear-gradient(160deg, #ffffff 0%, #fbfcff 45%, #f3f6ff 100%);
  }
  .lw-tool-head--hero::before,
  .lw-tool-head--hero::after {
    content: "";
    position: absolute;
    z-index: -1;
    border-radius: 50%;
    pointer-events: none;
  }
  .lw-tool-head--hero::before {
    width: 330px;
    height: 190px;
    right: -170px;
    top: 34px;
    border: 18px solid rgba(70, 110, 230, 0.05);
    transform: rotate(-16deg);
  }
  .lw-tool-head--hero::after {
    width: 220px;
    height: 120px;
    right: -92px;
    top: 66px;
    border: 10px solid rgba(124, 92, 252, 0.06);
    transform: rotate(-16deg);
  }
  .lw-hero-nav {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .lw-hero-nav__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid rgba(120, 150, 240, 0.22);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(244, 247, 255, 0.9));
    box-shadow: 0 8px 22px rgba(48, 78, 150, 0.1), inset 0 1px 0 #fff;
    cursor: pointer;
    transition: background 0.18s ease-out, border-color 0.18s ease-out, box-shadow 0.18s ease-out, transform 0.18s ease-out;
  }
  .lw-hero-nav__button--menu {
    border-radius: 15px;
    color: #5b63ea;
  }
  .lw-hero-nav__button--settings {
    border-radius: 50%;
    color: #44507a;
    box-shadow: 0 0 0 6px rgba(140, 130, 245, 0.07), 0 8px 22px rgba(48, 78, 150, 0.1), inset 0 1px 0 #fff;
  }
  .lw-hero-nav__button:hover {
    background: #fff;
    border-color: rgba(124, 132, 240, 0.3);
    border-color: rgba(96, 128, 240, 0.38);
    box-shadow: 0 10px 26px rgba(48, 78, 150, 0.15), inset 0 1px 0 #fff;
    transform: translateY(-1px);
  }
  .lw-hero-nav__button--settings:hover {
    box-shadow: 0 0 0 6px rgba(140, 130, 245, 0.1), 0 10px 26px rgba(48, 78, 150, 0.15), inset 0 1px 0 #fff;
  }
  .lw-hero-nav__button:focus-visible {
    outline: 2px solid #6b74ee;
    outline-offset: 2px;
  }
  .lw-tool-head--settings {
    min-height: 0;
    gap: 14px;
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
  .lw-tool-head__hero-row {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    min-height: 86px;
    gap: 6px;
  }
  .lw-tool-head__copy {
    flex: 1 1 auto;
    min-width: 0;
    padding-left: 2px;
  }
  .lw-tool-head--hero .lw-tool-head__title {
    font-size: 25px;
    font-weight: 750;
    line-height: 1.15;
    letter-spacing: -0.025em;
    white-space: nowrap;
    color: #101a38;
  }
  .lw-tool-head__subtitle {
    max-width: 212px;
    margin: 7px 0 0;
    font-size: 13.5px;
    line-height: 1.48;
    color: #68778f;
  }
  .lw-tool-head__art {
    position: relative;
    align-self: stretch;
    flex: 0 0 96px;
    min-width: 0;
  }
  .lw-tool-head__art::before {
    content: "";
    position: absolute;
    width: 112px;
    height: 112px;
    right: -14px;
    top: -12px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(110, 140, 240, 0.13) 0%, rgba(124, 92, 252, 0.05) 60%, transparent 72%);
  }
  .lw-tool-head__art-svg {
    position: absolute;
    width: 116px;
    height: auto;
    right: -6px;
    top: -2px;
    overflow: visible;
    filter: drop-shadow(0 12px 24px rgba(42, 84, 151, 0.09));
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
  .lw-focus__empty {
    color: #8a949c;
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
    color: #56687a;
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
  .lw-od-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .lw-od-count {
    font-size: 12px;
    color: #8a949c;
    font-variant-numeric: tabular-nums;
  }
  .lw-od-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e8ecef;
  }
  .lw-od-pager button {
    font: inherit;
    font-size: 12px;
    color: #0a66c2;
    background: none;
    border: 1px solid #d0d7dd;
    border-radius: 14px;
    padding: 3px 10px;
    cursor: pointer;
  }
  .lw-od-pager button:disabled {
    color: #b0b8bf;
    cursor: default;
  }
  .lw-od-pager__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: #38434f;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lw-od-pager__icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: #0a66c2;
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
    color: #56687a;
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
  .lw-od-actions {
    position: sticky;
    bottom: -16px;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 4px -16px -16px;
    padding: 12px 16px;
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
    color: #8a949c;
  }
  .lw-opt-group .lw-opt-cards {
    gap: 4px;
  }
  .lw-opt-group .lw-opt-card {
    padding: 12px;
    box-shadow: none;
  }
  .lw-opt-group .lw-opt-card:hover {
    background: #f7f9fb;
    border-color: #c9d6e2;
    box-shadow: none;
  }
  .lw-opt-card__title {
    min-width: 0;
  }
  .lw-opt-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
  }
  .lw-opt-status.is-strong { background: #1e7b34; }
  .lw-opt-status.is-improve { background: #c37d0d; }
  .lw-opt-status.is-add { background: #b24020; }
  .lw-opt-status.is-partial,
  .lw-opt-status.is-unverifiable { background: #9aa5ad; }
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
    color: #8a949c;
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
    color: #8a949c;
  }
  .lw-hl .lw-signals__toggle {
    justify-content: space-between;
    font-size: 13px;
  }
  .lw-hl .lw-signals__hint {
    display: block;
    margin: 1px 0 0;
  }
  .lw-hl__more {
    border: 1px solid #e1e6ea;
    border-radius: 10px;
    background: #fff;
  }
  .lw-hl__more > summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    text-transform: none;
    letter-spacing: 0;
    cursor: pointer;
    list-style: none;
  }
  .lw-hl__more > summary::-webkit-details-marker {
    display: none;
  }
  .lw-hl__more > summary > span:first-child {
    flex: 1;
  }
  .lw-hl__more > summary::after {
    content: "›";
    color: #8a949c;
    font-size: 18px;
    line-height: 1;
    transition: transform 0.15s ease;
  }
  .lw-hl__more[open] > summary::after {
    transform: rotate(90deg);
  }
  .lw-hl__more > :not(summary) {
    margin: 0 12px 10px;
  }
`;
}
