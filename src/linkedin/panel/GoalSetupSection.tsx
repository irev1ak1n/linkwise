import { useState } from "react";
import type { Criterion, CriterionCategory, CriterionImportance, CriterionOperator, Goal } from "../../models/goal";
import { GOAL_TEXT_MAX_LENGTH, condenseForGoalText } from "../../nlp/goalTextParser";
import { loadDocumentParser } from "../../documents/loadDocumentParser";
import { generateCriteria } from "../../ai/generateCriteria";
import { buildCriterionBullets, type CriterionBullet } from "./criterionDisplay";
import type { DraftCriterionInput } from "./goalStore";

interface GoalSetupSectionProps {
  goal: Goal | null;
  onSetActiveCriteria: (name: string, criteria: DraftCriterionInput[]) => void;
  onAddCriterion: (goalId: string, label: string, importance: CriterionImportance) => void;
  onUpdateCriterion: (goalId: string, criterionId: string, updates: Partial<Pick<Criterion, "label" | "importance">>) => void;
  onRemoveCriterion: (goalId: string, criterionId: string) => void;
  onUpdateNotes: (goalId: string, notes: string) => void;
}

interface DraftCriterionRow {
  id: string;
  label: string;
  importance: CriterionImportance;
  category?: CriterionCategory;
  groupId?: string;
  value?: string;
  operator?: CriterionOperator;
  sourceText?: string;
}

let localIdCounter = 0;
function makeLocalId(): string {
  localIdCounter += 1;
  return `draft_${localIdCounter}`;
}

const IMPORTANCE_OPTIONS: { value: CriterionImportance; label: string }[] = [
  { value: "MUST_HAVE", label: "Must Have" },
  { value: "PREFERRED", label: "Preferred" },
  { value: "OPTIONAL", label: "Optional" },
  { value: "EXCLUDED", label: "Excluded" },
];

/**
 * The whole Goal Setup half of the in-page LinkWise panel: describe who you're looking for,
 * review the resulting criteria as a compact readable list, and jot free-form notes — all
 * sharing the SAME goal state the profile-scanning/analysis sections below read from (see
 * goalStore.ts). There is no separate browser-side-panel version of this anymore, and no
 * saved-goals switcher or category-card criteria editor either: this panel now manages one
 * working search intent at a time.
 */
export function GoalSetupSection({ goal, onSetActiveCriteria, onAddCriterion, onUpdateCriterion, onRemoveCriterion, onUpdateNotes }: GoalSetupSectionProps) {
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  // True while a "Create criteria" (or document-upload) request is out to the AI generator (or
  // falling back to the local parser) — see generateFromText. Never left true on completion: the
  // finally block below always clears it, whichever path produced the result.
  const [generating, setGenerating] = useState(false);

  // Non-null while showing a just-generated, not-yet-committed batch of criteria — the "review
  // before saving" step. While null, the card shows (and directly, live-edits) the ACTIVE
  // goal's real criteria instead.
  const [draftCriteria, setDraftCriteria] = useState<DraftCriterionRow[] | null>(null);
  const [draftName, setDraftName] = useState("");
  // The exact description text the current draft was generated from — used only to detect
  // "you changed the description since generating this" staleness; never compared once the
  // draft has been committed (see commitDraft, which clears it).
  const [generatedFromText, setGeneratedFromText] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editImportance, setEditImportance] = useState<CriterionImportance>("PREFERRED");

  const [addingCriterion, setAddingCriterion] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newImportance, setNewImportance] = useState<CriterionImportance>("PREFERRED");

  const isDraft = draftCriteria !== null;
  const displayedCriteria: DraftCriterionRow[] = isDraft ? draftCriteria! : (goal?.criteria ?? []);
  const bullets = buildCriterionBullets(displayedCriteria);
  const isStale = isDraft && generatedFromText !== null && generatedFromText !== text;

  /**
   * The "Create criteria" flow: asks the AI backend to turn `sourceText` into structured
   * criteria, falling back to the local deterministic parser only when AI is unavailable or
   * returns nothing useful (see ai/generateCriteria.ts) — never the reverse. Either path lands
   * in the same reviewable draft state; the user always reviews/edits before "Use these
   * criteria" activates anything, regardless of which path produced the draft.
   */
  async function generateFromText(sourceText: string): Promise<void> {
    setGenerating(true);
    try {
      const result = await generateCriteria(sourceText);
      setDraftName(result.name);
      setDraftCriteria(
        result.criteria.map((c) => ({
          id: makeLocalId(),
          label: c.label,
          importance: c.importance,
          category: c.category,
          groupId: c.groupId,
          value: c.value,
          operator: c.operator,
          sourceText: c.sourceText,
        })),
      );
      setGeneratedFromText(sourceText);
      setEditingKey(null);
      setAddingCriterion(false);
    } finally {
      setGenerating(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setFileError(null);
    setFileStatus(`Reading ${file.name}…`);
    const readDocumentText = await loadDocumentParser();
    const result = await readDocumentText(file);
    if (result.error) {
      setFileError(result.error);
      setFileStatus(null);
      return;
    }

    const fullText = result.text ?? "";
    const condensed = fullText.length > GOAL_TEXT_MAX_LENGTH ? condenseForGoalText(fullText) : fullText;
    setText(condensed);
    await generateFromText(condensed);
    setFileStatus(
      fullText.length > GOAL_TEXT_MAX_LENGTH
        ? `Read ${file.name} — condensed the most relevant parts of this longer document into the draft below.`
        : `Read ${file.name}.`,
    );
  }

  function commitDraft(): void {
    if (!draftCriteria || draftCriteria.length === 0) return;
    onSetActiveCriteria(
      draftName.trim() || text.trim() || "My search",
      draftCriteria.map((r) => ({
        label: r.label,
        importance: r.importance,
        category: r.category,
        groupId: r.groupId,
        value: r.value,
        operator: r.operator,
        sourceText: r.sourceText,
      })),
    );
    setDraftCriteria(null);
    setDraftName("");
    setGeneratedFromText(null);
  }

  function startEdit(bullet: CriterionBullet): void {
    setEditingKey(bullet.key);
    setEditText(bullet.text);
    setEditImportance(bullet.importance);
  }

  function cancelEdit(): void {
    setEditingKey(null);
  }

  function saveEdit(bullet: CriterionBullet): void {
    const label = editText.trim();
    setEditingKey(null);
    if (!label) return;

    if (isDraft) {
      setDraftCriteria((rows) => {
        if (!rows) return rows;
        const insertIndex = rows.findIndex((r) => bullet.memberIds.includes(r.id));
        const rest = rows.filter((r) => !bullet.memberIds.includes(r.id));
        const source = rows.find((r) => bullet.memberIds.includes(r.id));
        const newRow: DraftCriterionRow = { id: makeLocalId(), label, importance: editImportance, category: source?.category };
        const next = [...rest];
        next.splice(Math.min(insertIndex, next.length), 0, newRow);
        return next;
      });
      return;
    }

    if (!goal) return;
    const [firstId, ...restIds] = bullet.memberIds;
    onUpdateCriterion(goal.id, firstId, { label, importance: editImportance });
    for (const id of restIds) onRemoveCriterion(goal.id, id);
  }

  function removeBullet(bullet: CriterionBullet): void {
    if (isDraft) {
      setDraftCriteria((rows) => rows?.filter((r) => !bullet.memberIds.includes(r.id)) ?? null);
      return;
    }
    if (!goal) return;
    for (const id of bullet.memberIds) onRemoveCriterion(goal.id, id);
  }

  function submitNewCriterion(event: React.FormEvent): void {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) return;

    if (isDraft) {
      setDraftCriteria((rows) => [...(rows ?? []), { id: makeLocalId(), label, importance: newImportance }]);
    } else if (goal) {
      onAddCriterion(goal.id, label, newImportance);
    } else {
      // No active goal yet and nothing generated this session — a manual criterion still
      // starts a reviewable draft rather than being silently dropped.
      setDraftCriteria([{ id: makeLocalId(), label, importance: newImportance }]);
      setDraftName(text.trim() || "My search");
    }
    setNewLabel("");
    setNewImportance("PREFERRED");
    setAddingCriterion(false);
  }

  return (
    <div className="goal-setup">
      <section className="app__section">
        <h2>Describe who you're looking for</h2>
        <p className="section-hint">
          Describe the kind of person you're looking for — e.g. "I am looking for FRC mentors in
          Charlotte with mechanical or aerospace engineering experience." LinkWise will turn your
          description into criteria you can review before applying.
        </p>
        <textarea
          className="text-area"
          value={text}
          maxLength={GOAL_TEXT_MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the kind of person you're looking for…"
          rows={4}
        />
        <div className="goal-setup__textarea-footer">
          <span className="char-count">
            {text.length} / {GOAL_TEXT_MAX_LENGTH}
          </span>
          <button type="button" className="button" disabled={!text.trim() || generating} onClick={() => void generateFromText(text)}>
            {generating ? "Creating criteria…" : "Create criteria"}
          </button>
        </div>

        <div className="goal-setup__upload">
          <label className="button button--secondary goal-setup__upload-label">
            Upload a document instead
            <input type="file" accept=".txt,.md,.pdf,.docx" onChange={(e) => void handleFileChange(e)} hidden />
          </label>
          {fileStatus && <span className="goal-setup__file-status">{fileStatus}</span>}
          {fileError && <span className="goal-setup__file-error">{fileError}</span>}
        </div>
      </section>

      <section className="app__section lw-ideal-match">
        <h2>Your ideal match</h2>
        <p className="section-hint">Review what we'll look for in each profile.</p>

        {isStale && (
          <p className="lw-ideal-match__stale">
            Your description changed — these criteria may be outdated. Click "Create criteria" again to refresh them.
          </p>
        )}

        {bullets.length === 0 && !isDraft && <p className="section-empty">Your criteria will appear here.</p>}
        {bullets.length === 0 && isDraft && (
          <p className="section-empty">
            We couldn't find enough detail in your description. Try adding more — like a role, location, or experience
            — or add a criterion manually below.
          </p>
        )}

        {bullets.length > 0 && (
          <ul className="lw-ideal-match__list">
            {bullets.map((bullet) => (
              <li key={bullet.key} className="lw-ideal-match__item">
                {editingKey === bullet.key ? (
                  <div className="lw-ideal-match__edit-row">
                    <select
                      className="criterion-chip__importance"
                      value={editImportance}
                      onChange={(e) => setEditImportance(e.target.value as CriterionImportance)}
                    >
                      {IMPORTANCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="text-input text-input--small"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                    />
                    <button type="button" className="button button--small" onClick={() => saveEdit(bullet)}>
                      Save
                    </button>
                    <button type="button" className="button button--secondary button--small" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span className={`lw-ideal-match__badge lw-ideal-match__badge--${bullet.importance.toLowerCase()}`}>
                      {bullet.heading}
                    </span>
                    <span className="lw-ideal-match__text">{bullet.text}</span>
                    <span className="lw-ideal-match__actions">
                      <button type="button" onClick={() => startEdit(bullet)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => removeBullet(bullet)}>
                        Remove
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {addingCriterion ? (
          <form className="lw-ideal-match__add-row" onSubmit={submitNewCriterion}>
            <select
              className="criterion-chip__importance"
              value={newImportance}
              onChange={(e) => setNewImportance(e.target.value as CriterionImportance)}
            >
              {IMPORTANCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              className="text-input text-input--small"
              placeholder="e.g. Comfortable with public speaking"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              autoFocus
            />
            <button type="submit" className="button button--small">
              Add
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => setAddingCriterion(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="lw-ideal-match__add-toggle" onClick={() => setAddingCriterion(true)}>
            + Add a criterion
          </button>
        )}

        {isDraft && (
          <button type="button" className="button button--primary lw-ideal-match__use-button" disabled={bullets.length === 0} onClick={commitDraft}>
            Use these criteria
          </button>
        )}
      </section>

      <section className="app__section lw-notes">
        <h2>Notes</h2>
        <textarea
          className="text-area lw-notes__textarea"
          placeholder="Add notes about what you're looking for..."
          value={goal?.notes ?? ""}
          disabled={!goal}
          onChange={(e) => goal && onUpdateNotes(goal.id, e.target.value)}
          rows={3}
        />
      </section>
    </div>
  );
}
