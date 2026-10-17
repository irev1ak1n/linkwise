// AI drafts for a section that needs work. LinkWise only shows the draft; it never edits the profile.
import { useEffect, useRef, useState } from "react";
import { requestOptimizerDraft, type OptimizeProfileRequestBody } from "./optimizerClient";
import { copyText } from "./copyText";
import type { DraftSection, SectionAssessmentDTO } from "./optimizerTypes";

type DraftState = { status: "idle" } | { status: "loading" } | { status: "ready"; draft: string } | { status: "unavailable"; reason: string };
const draftMemory = new Map<string, string>();

interface DraftBoxProps {
  body: OptimizeProfileRequestBody;
  guidance: string;
  section: DraftSection;
  evidenceId: string | null;
  label: string;
}

function DraftBox({ body, guidance, section, evidenceId, label }: DraftBoxProps) {
  const memoryKey = `${body.profile.identity}:${section}:${evidenceId ?? ""}:${guidance}`;
  const remembered = draftMemory.get(memoryKey);
  const [draft, setDraft] = useState<DraftState>(remembered ? { status: "ready", draft: remembered } : { status: "idle" });
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  function generate(): void {
    setDraft({ status: "loading" });
    const pending = requestOptimizerDraft({ profile: body.profile, section, evidenceId, guidance, userContext: body.userContext });
    cancelRef.current = pending.cancel;
    void pending.promise.then((outcome) => {
      cancelRef.current = null;
      if (outcome.status === "ok") draftMemory.set(memoryKey, outcome.draft);
      setDraft(outcome.status === "ok" ? { status: "ready", draft: outcome.draft } : { status: "unavailable", reason: outcome.reason });
    });
  }

  return (
    <div className="lw-optimizer__draft">
      {draft.status !== "ready" && (
        <button type="button" className="lw-button lw-button--secondary" disabled={draft.status === "loading"} onClick={generate}>
          {draft.status === "loading" ? "Writing draft…" : label}
        </button>
      )}
      {draft.status === "unavailable" && (
        <p className="lw-scan-mode__hint">{draft.reason === "ungrounded_draft" ? "The draft mentioned things not on your profile, so it was discarded. Try again." : `Draft unavailable (${draft.reason}).`}</p>
      )}
      {draft.status === "ready" && (
        <>
          <textarea className="lw-keywords__input" readOnly rows={8} value={draft.draft} />
          <p className="lw-scan-mode__hint">A draft for you to review. LinkWise never changes your profile.</p>
          <button type="button" className="lw-button lw-button--secondary" onClick={() => void copyText(draft.draft)}>
            Copy draft
          </button>
        </>
      )}
    </div>
  );
}

export function SectionDrafts({ section, body, assessment }: { section: "about" | "experience"; body: OptimizeProfileRequestBody; assessment: SectionAssessmentDTO | undefined }) {
  const guidance = assessment ? [assessment.reason, ...assessment.suggestions].join("\n") : "";
  const evidence = body.profile.evidence;
  const entries = section === "experience" ? [...new Set([...(assessment?.evidenceIds ?? []), ...evidence.map((e) => e.id)])].filter((id) => id.startsWith("experience:")).slice(0, 3) : [];
  return (
    <section className="lw-od-section" aria-label="AI drafts">
      <h4 className="lw-od-heading">AI draft</h4>
      {section === "experience" ? (
        entries.map((id) => <DraftBox key={id} body={body} guidance={guidance} section="experience" evidenceId={id} label={`Draft for ${(evidence.find((e) => e.id === id)?.text ?? id).split(" — ")[0]}`} />)
      ) : (
        <DraftBox body={body} guidance={guidance} section="about" evidenceId={null} label="Generate improved draft" />
      )}
    </section>
  );
}
