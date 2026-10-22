import { useEffect, useRef, useState } from "react";
import type { PendingRelayRequest } from "../ai/backgroundRelay";
import { requestHeadlineOptions, type HeadlineGenerationRequestBody, type OptimizeProfileRequestBody } from "./optimizerClient";
import { openOptimizerPage } from "./optimizerNav";
import { copyText } from "./copyText";
import { includeHint } from "./generatorHints";
import { CurrentCard, GeneratorBlock, GeneratorNav, PrimaryButton } from "./GeneratorParts";
import type { HeadlineOption, HeadlineOptionsOutcome } from "./optimizerTypes";

export interface GeneratorForm {
  include: string;
  format: string;
}

export const FORMAT_PLACEHOLDER = "Role | Focus | Proof";

// Kept for the session, so leaving the generator and coming back keeps what was typed and generated.
let savedForm: GeneratorForm = { include: "", format: "" };
let savedOptions: HeadlineOption[] | null = null;

export function buildHeadlineRequest(body: OptimizeProfileRequestBody, currentHeadline: string, form: GeneratorForm): HeadlineGenerationRequestBody {
  return { profile: body.profile, currentHeadline, include: form.include.trim(), format: form.format.trim(), language: "English", userContext: body.userContext };
}

type GeneratorState = { status: "idle" } | { status: "loading" } | { status: "ready"; options: HeadlineOption[] } | { status: "unavailable"; reason: string };

interface HeadlineGeneratorProps {
  body: OptimizeProfileRequestBody | null;
  currentHeadline: string;
  request?: (body: HeadlineGenerationRequestBody) => PendingRelayRequest<HeadlineOptionsOutcome>;
}

export function HeadlineGenerator({ body, currentHeadline, request = requestHeadlineOptions }: HeadlineGeneratorProps) {
  const [form, setForm] = useState<GeneratorForm>(savedForm);
  const [state, setState] = useState<GeneratorState>(savedOptions ? { status: "ready", options: savedOptions } : { status: "idle" });
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  function update(field: keyof GeneratorForm, value: string): void {
    const next = { ...form, [field]: value };
    savedForm = next;
    setForm(next);
  }

  // Every click is its own request, so the button is never stuck: it only waits while one is running.
  function generate(): void {
    if (!body || state.status === "loading") return;
    const payload = buildHeadlineRequest(body, currentHeadline, form);
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
  const label = loading ? "Generating..." : state.status === "ready" ? "Generate again" : "Generate headlines";
  return (
    <article className="lw-opt-page lw-gen">
      <GeneratorNav title="Headline Generator" backLabel="Back to Headline" onBack={() => openOptimizerPage({ name: "section", section: "headline" })} />

      <GeneratorBlock title="Current headline">
        <CurrentCard text={currentHeadline} empty="No headline currently found." />
      </GeneratorBlock>

      <GeneratorBlock title="What should we include?">
        <p className="lw-gen-help">Add keywords, achievements, roles, projects, or anything you want emphasized.</p>
        <textarea
          className="lw-gen-input"
          rows={2}
          aria-label="What should we include?"
          value={form.include}
          maxLength={600}
          placeholder={includeHint(body?.profile.evidence ?? [], "headline")}
          onChange={(e) => update("include", e.target.value)}
        />
      </GeneratorBlock>

      <GeneratorBlock title="Format">
        <input className="lw-gen-input" aria-label="Format" value={form.format} maxLength={120} placeholder={FORMAT_PLACEHOLDER} onChange={(e) => update("format", e.target.value)} />
        <p className="lw-gen-help">Optional. Set the structure you want.</p>
      </GeneratorBlock>

      <PrimaryButton disabled={!body || loading} onClick={generate}>
        {label}
      </PrimaryButton>
      {!body && <p className="lw-gen-note">Waiting for LinkWise to finish reading your profile…</p>}

      {(state.status === "ready" || state.status === "unavailable") && (
        <GeneratorBlock
          title="Generated headlines"
          action={
            state.status === "ready" ? (
              <button type="button" className="lw-gen-link" disabled={loading} onClick={generate}>
                Regenerate
              </button>
            ) : undefined
          }
        >
          {state.status === "unavailable" && (
            <p className="lw-gen-note">{state.reason === "ungrounded_headlines" ? "The options mentioned things not on your profile, so they were discarded. Try again." : `Headlines unavailable (${state.reason}).`}</p>
          )}
          {state.status === "ready" && (
            <ol className="lw-gen-options">
              {state.options.map((option) => (
                <HeadlineOptionCard key={option.headline} option={option} />
              ))}
            </ol>
          )}
        </GeneratorBlock>
      )}
      {state.status === "ready" && <p className="lw-gen-note">Options for you to review. LinkWise never changes your profile.</p>}
    </article>
  );
}

export function HeadlineOptionCard({ option, copy = copyText }: { option: HeadlineOption; copy?: (text: string) => Promise<boolean> }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <li className="lw-gen-option">
      <span className="lw-gen-option__label">{option.label}</span>
      <p className="lw-gen-option__text">{option.headline}</p>
      <div className="lw-gen-option__meta">
        <span>{option.headline.length} / 220</span>
        <button type="button" className="lw-gen-copy" onClick={() => void copy(option.headline).then(setCopied)}>
          {copied ? "Copied ✓" : copied === false ? "Copy failed" : "Copy"}
        </button>
      </div>
    </li>
  );
}
