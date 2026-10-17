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

  /* Scan screen: live progress through the profile's sections. */
  .lw-scan {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border: 1px solid #e1e6ea;
    border-radius: 14px;
    background: linear-gradient(180deg, #f7f9ff 0%, #fff 70%);
  }
  .lw-scan__reading {
    margin: 0;
    font-size: 14px;
    color: #38434f;
    overflow-wrap: anywhere;
  }
  .lw-scan__name {
    color: #1a1a1a;
    font-size: 15px;
  }
  .lw-scan__goal {
    margin: 2px 0 0;
    font-size: 12px;
    color: #56687a;
  }
  .lw-scan__goal span {
    font-weight: 600;
    color: #38434f;
  }
  .lw-scan__status {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .lw-scan__message {
    margin: 0;
    font-weight: 600;
    color: #2b3a8f;
    animation: lw-scan-fade 0.3s ease;
  }
  .lw-scan__percent {
    font-size: 12px;
    font-weight: 700;
    color: #5b3fb5;
    font-variant-numeric: tabular-nums;
  }
  .lw-scan__bar {
    position: relative;
    height: 6px;
    border-radius: 3px;
    background: #e6e9f5;
    overflow: hidden;
  }
  .lw-scan__fill {
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, #0a66c2, #6a4fd0);
    transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .lw-scan.is-scanning .lw-scan__fill,
  .lw-scan.is-analyzing .lw-scan__fill {
    background-image: linear-gradient(90deg, #0a66c2, #6a4fd0), linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
    background-size: 100% 100%, 40% 100%;
    background-repeat: no-repeat;
    background-blend-mode: overlay;
    animation: lw-scan-shimmer 1.6s linear infinite;
  }
  .lw-scan.is-error .lw-scan__fill {
    background: #c37d0d;
  }
  .lw-scan.is-error .lw-scan__message {
    color: #8a5a00;
  }
  .lw-scan__result {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #057642;
    animation: lw-scan-fade 0.3s ease;
  }
  .lw-scan__handoff {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    font-weight: 600;
    color: #56687a;
  }
  .lw-scan__handoff-arrow {
    flex: 1;
    height: 2px;
    border-radius: 1px;
    background: linear-gradient(90deg, #0a66c2 0%, #6a4fd0 50%, #e6e9f5 50%);
    background-size: 200% 100%;
    animation: lw-scan-flow 1.2s linear infinite;
  }
  .lw-scan__label {
    margin: 4px 0 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #8a949c;
  }
  .lw-scan__rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lw-scan-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 10px;
    border-radius: 9px;
    background: #fff;
    border: 1px solid #edf0f3;
    color: #8a949c;
    transition: background 0.35s ease, border-color 0.35s ease, color 0.35s ease;
  }
  .lw-scan-row.is-scanning {
    color: #1a1a1a;
    background: #f1f0fd;
    border-color: #d9d3f7;
  }
  .lw-scan-row.is-complete {
    color: #1a1a1a;
    background: #f3faf5;
    border-color: #dcefe2;
  }
  .lw-scan-row.is-not_found,
  .lw-scan-row.is-skipped {
    color: #8a949c;
    background: #fafbfc;
  }
  .lw-scan-row__icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.8;
  }
  .lw-scan-row__label {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lw-scan-row__detail {
    flex-shrink: 0;
    font-size: 11.5px;
    color: #56687a;
  }
  .lw-scan-row.is-scanning .lw-scan-row__detail {
    color: #5b3fb5;
  }
  .lw-scan-mark {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  .lw-scan-mark.is-pending {
    border: 1.5px solid #cfd6dd;
    width: 13px;
    height: 13px;
  }
  .lw-scan-mark.is-scanning {
    width: 13px;
    height: 13px;
    border: 2px solid #d9d3f7;
    border-top-color: #6a4fd0;
    animation: lw-scan-spin 0.8s linear infinite;
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
  .lw-scan.is-complete .lw-scan-mark.is-complete path {
    animation: none;
  }
  .lw-scan__hint {
    margin: 0;
    font-size: 12px;
    color: #56687a;
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
  @keyframes lw-scan-fade {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: none; }
  }
  @keyframes lw-scan-shimmer {
    from { background-position: 0 0, -40% 0; }
    to { background-position: 0 0, 140% 0; }
  }
  @keyframes lw-scan-flow {
    from { background-position: 100% 0; }
    to { background-position: 0 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .lw-scan *,
    .lw-scan {
      animation: none !important;
      transition: none !important;
    }
    .lw-scan-mark.is-scanning {
      border-color: #6a4fd0;
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
  .lw-signals__status {
    margin: 0;
    font-size: 11.5px;
    color: #56687a;
  }
  .lw-signals__status--error {
    color: #b24020;
  }
  .lw-signals__facts summary {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: #56687a;
    cursor: pointer;
  }
  .lw-signals__count {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: #8a949c;
    margin-left: 4px;
  }
  .lw-signals__facts ul {
    margin: 6px 0 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .lw-signals__facts li {
    font-size: 12px;
    line-height: 1.35;
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
  .lw-keywords {
    display: flex;
    flex-direction: column;
    gap: 3px;
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

  .lw-tools {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .lw-tools__tab {
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 8px;
    border: 1px solid #d0d7dd;
    border-radius: 8px;
    background: #fff;
    color: #38434f;
    cursor: pointer;
  }
  .lw-tools__tab:hover {
    border-color: #a9c4e0;
  }
  .lw-tools__tab.is-active {
    background: #0a66c2;
    border-color: #0a66c2;
    color: #fff;
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
  .lw-an-scan {
    border: 1px solid #e1e6ea;
    border-radius: 10px;
    padding: 8px 12px;
    background: #fff;
  }
  .lw-an-scan[open] {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lw-an-scan summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 12.5px;
  }
  .lw-an-scan summary span {
    font-weight: 400;
    color: #56687a;
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
    gap: 3px;
  }
  .lw-opt-group .lw-opt-card {
    min-height: 46px;
    padding: 5px 10px;
    box-shadow: none;
  }
  .lw-opt-card__text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .lw-opt-card__text .lw-opt-card__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lw-opt-card__meta {
    font-size: 12px;
    color: #8a949c;
  }
  .lw-opt-card__impact {
    color: #56687a;
  }
  .lw-opt-row-status {
    font-weight: 600;
  }
  .lw-opt-row-status.is-strong { color: #1e7b34; }
  .lw-opt-row-status.is-improve { color: #0a5aa8; }
  .lw-opt-row-status.is-add { color: #a5640a; }
  .lw-opt-row-status.is-partial,
  .lw-opt-row-status.is-unverifiable { color: #6b7780; }
`;
}
