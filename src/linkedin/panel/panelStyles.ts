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

  .lw-jobs-settings {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid #e0e0e0;
  }
  .lw-jobs-settings__title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: #56687a;
  }
  .lw-jobs-settings__group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .lw-jobs-settings__group-label {
    font-size: 11.5px;
    color: #445;
    min-width: 90px;
  }
  .lw-jobs-settings__radio {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    color: #56687a;
    cursor: pointer;
  }
  .lw-jobs-settings__keywords-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11.5px;
    color: #445;
  }
  .lw-jobs-settings__keywords-input {
    resize: vertical;
    min-height: 40px;
    font: inherit;
    font-size: 12px;
    padding: 6px 8px;
    border: 1px solid #d0d7de;
    border-radius: 6px;
  }
  .lw-jobs-settings__checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: #56687a;
    cursor: pointer;
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
    gap: 14px;
  }
  .lw-optimizer__score {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .lw-optimizer__score-value {
    font-size: 30px;
    font-weight: 700;
    color: #0a66c2;
  }
  .lw-optimizer__score-label {
    color: #56687a;
  }
  .lw-optimizer__summary {
    margin: 0;
    color: #38434f;
  }
  .lw-optimizer__rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lw-optimizer__row {
    border: 1px solid #e4e9ed;
    border-radius: 8px;
  }
  .lw-optimizer__row-head {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    font: inherit;
    padding: 8px 10px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }
  .lw-optimizer__row-label {
    flex: 1;
    font-weight: 600;
  }
  .lw-optimizer__badge,
  .lw-optimizer__impact {
    font-size: 11px;
    font-weight: 600;
    border-radius: 10px;
    padding: 1px 8px;
    white-space: nowrap;
  }
  .lw-optimizer__badge.is-add { background: #fff4e5; color: #915907; }
  .lw-optimizer__badge.is-improve { background: #eaf3fc; color: #0a66c2; }
  .lw-optimizer__badge.is-strong { background: #e6f4ea; color: #1e7b34; }
  .lw-optimizer__impact { color: #56687a; background: #f0f2f5; }
  .lw-optimizer__impact.is-high { color: #b24020; background: #fdecea; }
  .lw-optimizer__details {
    padding: 0 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lw-optimizer__details p {
    margin: 0;
  }
  .lw-optimizer__suggestions {
    margin: 0;
    padding-left: 18px;
  }
  .lw-optimizer__source {
    font-size: 11px;
    color: #56687a;
  }
  .lw-optimizer__source.is-user_context {
    color: #915907;
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
  .lw-opt-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
  }
  .lw-opt-status.is-strong { background: #1e7b34; }
  .lw-opt-status.is-improve { background: #c37d0d; }
  .lw-opt-status.is-missing { background: #b24020; }
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
  .lw-opt-badge.is-improve { background: #fff4e5; color: #915907; }
  .lw-opt-badge.is-missing { background: #fdecea; color: #b24020; }
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
    gap: 5px;
  }
  .lw-opt-checklist li::before {
    content: "☐";
    color: #0a66c2;
    margin-right: 6px;
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
`;
}
