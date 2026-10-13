import { useEffect, useRef, useState } from "react";
import { hashString } from "../ai/aiAnalysisCache";
import type { PendingRelayRequest } from "../ai/backgroundRelay";
import { requestHeadlineOptions, type HeadlineGenerationRequestBody, type OptimizeProfileRequestBody } from "./optimizerClient";
import { openOptimizerPage } from "./optimizerNav";
import { copyText } from "./copyText";
import type { HeadlineOption, HeadlineOptionsOutcome } from "./optimizerTypes";

export const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Italian", "Polish", "Ukrainian", "Russian", "Chinese", "Japanese", "Korean", "Hindi", "Arabic"];

export interface GeneratorForm {
  targetRole: string;
  keywords: string;
  additionalContext: string;
  language: string;
}

// Kept for the session, so leaving the generator and coming back keeps what was typed and generated.
let savedForm: GeneratorForm = { targetRole: "", keywords: "", additionalContext: "", language: "English" };
const savedResults = new Map<string, HeadlineOption[]>();

export function buildHeadlineRequest(body: OptimizeProfileRequestBody, currentHeadline: string, form: GeneratorForm): HeadlineGenerationRequestBody {
  return { profile: body.profile, currentHeadline, ...form, targetRole: form.targetRole.trim(), keywords: form.keywords.trim(), additionalContext: form.additionalContext.trim(), userContext: body.userContext };
}

function resultKey(request: HeadlineGenerationRequestBody): string {
  return hashString(JSON.stringify(request));
}

type GeneratorState = { status: "idle" } | { status: "loading" } | { status: "ready"; options: HeadlineOption[] } | { status: "unavailable"; reason: string };

interface HeadlineGeneratorProps {
  body: OptimizeProfileRequestBody | null;
  currentHeadline: string;
  request?: (body: HeadlineGenerationRequestBody) => PendingRelayRequest<HeadlineOptionsOutcome>;
}

export function HeadlineGenerator({ body, currentHeadline, request = requestHeadlineOptions }: HeadlineGeneratorProps) {
  const [form, setForm] = useState<GeneratorForm>(savedForm);
  const initial = body ? savedResults.get(resultKey(buildHeadlineRequest(body, currentHeadline, form))) : undefined;
  const [state, setState] = useState<GeneratorState>(initial ? { status: "ready", options: initial } : { status: "idle" });
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  function update(field: keyof GeneratorForm, value: string): void {
    const next = { ...form, [field]: value };
    savedForm = next;
    setForm(next);
  }

  function generate(): void {
    if (!body) return;
    const payload = buildHeadlineRequest(body, currentHeadline, form);
    setState({ status: "loading" });
    const pending = request(payload);
    cancelRef.current = pending.cancel;
    void pending.promise.then((outcome) => {
      cancelRef.current = null;
      if (outcome.status === "ok") savedResults.set(resultKey(payload), outcome.options);
      setState(outcome.status === "ok" ? { status: "ready", options: outcome.options } : { status: "unavailable", reason: outcome.reason });
    });
  }

  return (
    <article className="lw-opt-page">
      <button type="button" className="lw-opt-back" onClick={() => openOptimizerPage({ name: "section", section: "headline" })}>
        ← Back to Headline
      </button>
      <h3 className="lw-opt-page__title">Generate headlines</h3>
      <p className="lw-opt-page__description">LinkWise already uses your profile. Add a direction or keywords to steer the options.</p>

      <div className="lw-opt-form">
        <label>
          Target role
          <input className="lw-keywords__input" value={form.targetRole} maxLength={120} placeholder="e.g. Software Engineer" onChange={(e) => update("targetRole", e.target.value)} />
        </label>
        <label>
          Keywords to include
          <input className="lw-keywords__input" value={form.keywords} maxLength={300} placeholder="e.g. C++, full-stack, robotics" onChange={(e) => update("keywords", e.target.value)} />
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
          {state.status === "loading" ? "Writing headlines…" : "Generate headlines"}
        </button>
        {!body && <p className="lw-scan-mode__hint">Waiting for LinkWise to finish reading your profile…</p>}
      </div>

      {state.status === "unavailable" && (
        <p className="lw-scan-mode__hint">
          {state.reason === "ungrounded_headlines" ? "The options mentioned things not on your profile, so they were discarded. Try again." : `Headlines unavailable (${state.reason}).`}
        </p>
      )}
      {state.status === "ready" && (
        <ol className="lw-opt-options">
          {state.options.map((option) => (
            <HeadlineOptionCard key={option.headline} option={option} />
          ))}
        </ol>
      )}
      {state.status === "ready" && <p className="lw-scan-mode__hint">Options for you to review. LinkWise never changes your profile.</p>}
    </article>
  );
}

export function HeadlineOptionCard({ option, copy = copyText }: { option: HeadlineOption; copy?: (text: string) => Promise<boolean> }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <li className="lw-opt-option">
      <span className="lw-opt-option__label">{option.label}</span>
      <p className="lw-opt-option__text">{option.headline}</p>
      <div className="lw-opt-option__meta">
        <span>{option.headline.length} / 220</span>
        <button type="button" className="lw-button" onClick={() => void copy(option.headline).then(setCopied)}>
          {copied ? "Copied ✓" : copied === false ? "Copy failed" : "Copy"}
        </button>
      </div>
    </li>
  );
}
