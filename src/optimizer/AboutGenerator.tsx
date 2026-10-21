import { useEffect, useRef, useState } from "react";
import type { PendingRelayRequest } from "../ai/backgroundRelay";
import { requestAboutOptions, type AboutGenerationRequestBody, type AboutStyle, type OptimizeProfileRequestBody } from "./optimizerClient";
import { openOptimizerPage } from "./optimizerNav";
import { copyText } from "./copyText";
import { CurrentCard, GeneratorBlock, GeneratorNav, PrimaryButton } from "./GeneratorParts";
import type { AboutOption, AboutOptionsOutcome } from "./optimizerTypes";

export interface AboutForm {
  include: string;
  style: AboutStyle;
}

export const ABOUT_STYLE_CHOICES: { value: AboutStyle; label: string }[] = [
  { value: "all", label: "Mix" },
  { value: "balanced", label: "Balanced" },
  { value: "impact", label: "Impact-focused" },
  { value: "technical", label: "Technical" },
];

// Kept for the session, like the Headline generator: leaving and coming back keeps what was typed
// and the options that were written. The counter only ever goes up, so no two requests share one.
let savedForm: AboutForm = { include: "", style: "all" };
let savedOptions: AboutOption[] | null = null;
let variationCounter = 0;

export function buildAboutRequest(body: OptimizeProfileRequestBody, currentAbout: string, form: AboutForm, variation: number): AboutGenerationRequestBody {
  return { profile: body.profile, currentAbout, include: form.include.trim(), style: form.style, language: "English", variation, userContext: body.userContext };
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

  function update<K extends keyof AboutForm>(field: K, value: AboutForm[K]): void {
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

  const loading = state.status === "loading";
  const label = loading ? "Generating..." : state.status === "ready" ? "Generate again" : "Generate About";
  return (
    <article className="lw-opt-page lw-gen">
      <GeneratorNav title="About Generator" backLabel="Back to About" onBack={() => openOptimizerPage({ name: "section", section: "about" })} />

      <GeneratorBlock title="Current About">
        <CurrentCard text={currentAbout} empty="No About section currently found." />
      </GeneratorBlock>

      <GeneratorBlock title="What should we include?">
        <p className="lw-gen-help">Add achievements, projects, leadership, results, or anything you want emphasized.</p>
        <textarea
          className="lw-gen-input"
          rows={2}
          aria-label="What should we include?"
          value={form.include}
          maxLength={600}
          placeholder="TSA leadership, 150+ tutoring hours, full-stack projects, school websites"
          onChange={(e) => update("include", e.target.value)}
        />
      </GeneratorBlock>

      <GeneratorBlock title="Structure">
        <div className="lw-gen-chips" role="radiogroup" aria-label="Structure">
          {ABOUT_STYLE_CHOICES.map((choice) => (
            <button key={choice.value} type="button" role="radio" aria-checked={form.style === choice.value} className={`lw-gen-chip${form.style === choice.value ? " is-on" : ""}`} onClick={() => update("style", choice.value)}>
              {choice.label}
            </button>
          ))}
        </div>
      </GeneratorBlock>

      <PrimaryButton disabled={!body || loading} onClick={generate}>
        {label}
      </PrimaryButton>
      {!body && <p className="lw-gen-note">Waiting for LinkWise to finish reading your profile…</p>}

      {(state.status === "ready" || state.status === "unavailable") && (
        <GeneratorBlock title="Generated About">
          {state.status === "unavailable" && (
            <p className="lw-gen-note">{state.reason === "ungrounded_abouts" ? "The options mentioned things not on your profile, so they were discarded. Try again." : `About options unavailable (${state.reason}).`}</p>
          )}
          {state.status === "ready" && (
            <ol className="lw-gen-options">
              {state.options.map((option) => (
                <AboutOptionCard key={option.text} option={option} />
              ))}
            </ol>
          )}
        </GeneratorBlock>
      )}
      {state.status === "ready" && <p className="lw-gen-note">Options for you to review. LinkWise never changes your profile.</p>}
    </article>
  );
}

export function AboutOptionCard({ option, copy = copyText }: { option: AboutOption; copy?: (text: string) => Promise<boolean> }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const words = option.text.split(/\s+/).filter(Boolean).length;
  return (
    <li className="lw-gen-option">
      <span className="lw-gen-option__label">{option.label}</span>
      <p className="lw-gen-option__text lw-gen-option__text--paragraphs">{option.text}</p>
      <div className="lw-gen-option__meta">
        <span>{words} words</span>
        <button type="button" className="lw-gen-copy" onClick={() => void copy(option.text).then(setCopied)}>
          {copied ? "Copied ✓" : copied === false ? "Copy failed" : "Copy"}
        </button>
      </div>
    </li>
  );
}
