import { useEffect, useRef, useState } from "react";
import type { PendingRelayRequest } from "../ai/backgroundRelay";
import { requestAboutOptions, type AboutGenerationRequestBody, type OptimizeProfileRequestBody } from "./optimizerClient";
import { openOptimizerPage } from "./optimizerNav";
import { copyText } from "./copyText";
import { LANGUAGES } from "./HeadlineGenerator";
import type { AboutOption, AboutOptionsOutcome } from "./optimizerTypes";

export interface AboutForm {
  targetRole: string;
  standOut: string;
  additionalContext: string;
  language: string;
}

// Kept for the session, like the Headline generator: leaving and coming back keeps what was typed
// and the options that were written. The counter only ever goes up, so no two requests share one.
let savedForm: AboutForm = { targetRole: "", standOut: "", additionalContext: "", language: "English" };
let savedOptions: AboutOption[] | null = null;
let variationCounter = 0;

export function buildAboutRequest(body: OptimizeProfileRequestBody, currentAbout: string, form: AboutForm, variation: number): AboutGenerationRequestBody {
  return {
    profile: body.profile,
    currentAbout,
    targetRole: form.targetRole.trim(),
    standOut: form.standOut.trim(),
    additionalContext: form.additionalContext.trim(),
    language: form.language,
    variation,
    userContext: body.userContext,
  };
}

type GeneratorState = { status: "idle" } | { status: "loading" } | { status: "ready"; options: AboutOption[] } | { status: "unavailable"; reason: string };

interface AboutGeneratorProps {
  body: OptimizeProfileRequestBody | null;
  currentAbout: string;
  request?: (body: AboutGenerationRequestBody) => PendingRelayRequest<AboutOptionsOutcome>;
}

export function AboutGenerator({ body, currentAbout, request = requestAboutOptions }: AboutGeneratorProps) {
  const [form, setForm] = useState<AboutForm>(savedForm);
  const [state, setState] = useState<GeneratorState>(savedOptions ? { status: "ready", options: savedOptions } : { status: "idle" });
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  function update(field: keyof AboutForm, value: string): void {
    const next = { ...form, [field]: value };
    savedForm = next;
    setForm(next);
  }

  // Every click is its own request with its own variation, so Generate can be pressed again for a new take.
  function generate(): void {
    if (!body || state.status === "loading") return;
    variationCounter += 1;
    const payload = buildAboutRequest(body, currentAbout, form, variationCounter);
    setState({ status: "loading" });
    const pending = request(payload);
    cancelRef.current = pending.cancel;
    void pending.promise.then((outcome) => {
      cancelRef.current = null;
      if (outcome.status === "ok") savedOptions = outcome.options;
      setState(outcome.status === "ok" ? { status: "ready", options: outcome.options } : { status: "unavailable", reason: outcome.reason });
    });
  }

  const label = state.status === "loading" ? "Generating…" : state.status === "ready" ? "Generate again" : "Generate About";
  return (
    <article className="lw-opt-page">
      <button type="button" className="lw-opt-back" onClick={() => openOptimizerPage({ name: "section", section: "about" })}>
        ← Back to About
      </button>
      <h3 className="lw-opt-page__title">Generate About</h3>
      <p className="lw-opt-page__description">LinkWise already uses your profile. Add a direction or what should stand out to steer the options.</p>

      <div className="lw-opt-form">
        <label>
          Target role
          <input className="lw-keywords__input" value={form.targetRole} maxLength={120} placeholder="e.g. Software Engineer" onChange={(e) => update("targetRole", e.target.value)} />
        </label>
        <label>
          What should stand out?
          <input className="lw-keywords__input" value={form.standOut} maxLength={300} placeholder="e.g. leadership, projects, measurable impact" onChange={(e) => update("standOut", e.target.value)} />
        </label>
        <label>
          Additional context
          <textarea className="lw-keywords__input" rows={2} value={form.additionalContext} maxLength={1000} placeholder="Optional" onChange={(e) => update("additionalContext", e.target.value)} />
        </label>
        <label>
          Language
          <select className="lw-keywords__input" value={form.language} onChange={(e) => update("language", e.target.value)}>
            {LANGUAGES.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </select>
        </label>
        <button type="button" className="lw-button lw-button--secondary" disabled={!body || state.status === "loading"} onClick={generate}>
          {label}
        </button>
        {!body && <p className="lw-scan-mode__hint">Waiting for LinkWise to finish reading your profile…</p>}
      </div>

      {state.status === "unavailable" && (
        <p className="lw-scan-mode__hint">
          {state.reason === "ungrounded_abouts" ? "The options mentioned things not on your profile, so they were discarded. Try again." : `About options unavailable (${state.reason}).`}
        </p>
      )}
      {state.status === "ready" && (
        <ol className="lw-opt-options">
          {state.options.map((option) => (
            <AboutOptionCard key={option.text} option={option} />
          ))}
        </ol>
      )}
      {state.status === "ready" && <p className="lw-scan-mode__hint">Options for you to review. LinkWise never changes your profile.</p>}
    </article>
  );
}

export function AboutOptionCard({ option, copy = copyText }: { option: AboutOption; copy?: (text: string) => Promise<boolean> }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const words = option.text.split(/\s+/).filter(Boolean).length;
  return (
    <li className="lw-opt-option">
      <span className="lw-opt-option__label">{option.label}</span>
      <p className="lw-opt-option__text lw-opt-option__text--paragraphs">{option.text}</p>
      <div className="lw-opt-option__meta">
        <span>
          {words} words · {option.text.length} / 2600
        </span>
        <button type="button" className="lw-button" onClick={() => void copy(option.text).then(setCopied)}>
          {copied ? "Copied ✓" : copied === false ? "Copy failed" : "Copy"}
        </button>
      </div>
    </li>
  );
}
