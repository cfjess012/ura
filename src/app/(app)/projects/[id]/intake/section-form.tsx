"use client";

/**
 * One intake section, one screen (§24.2). Saves on the way out so nothing
 * is lost between sections, and reports failure as a designed state (§25).
 */
import * as React from "react";
import { CoherenceCheck } from "./coherence-check";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveIntake } from "@/app/actions";
import { UNLISTED_OPTION, unlistedKey, SCOPE_KEY } from "@/lib/intake-values";
import { errorRef, isFailure } from "@/lib/errors";
import { entriesOf, type ReferenceEntry } from "@/lib/reference";
import {
  INTAKE_SECTIONS,
  isFieldVisible,
  missingRequiredFields,
  sectionKeyOwning,
  sectionProgress,
  type IntakeField,
  type IntakeValues,
} from "@/lib/intake";
import { IntakeRail } from "./intake-rail";
import {
  bracketSpans,
  holdRewrite,
  takeRewrite,
  type PendingRewrite,
} from "@/lib/pending-rewrite";
import { ProjectHeader } from "../project-header";

export function SectionForm({
  projectId,
  projectName,
  stage,
  stepLine,
  needed,
  sectionName,
  initial,
  nextHref,
  nextLabel,
  previousHref,
  previousLabel,
  sectionKey,
  people,
  lastChange,
  readyForCheck,
}: {
  projectId: string;
  projectName: string;
  /**
   * Whether the AI check belongs on this screen. It reads the WHOLE intake,
   * so offering it on section one invites running it over a quarter-filled
   * form — where most of the answer is "they were never asked". True only
   * on the last section, and only once the earlier ones are complete.
   */
  readyForCheck: boolean;
  /** Draft or In review — read from the record, never a literal. */
  stage: string;
  stepLine: string;
  needed: boolean;
  sectionName: string;
  initial: IntakeValues;
  nextHref: string;
  nextLabel: string;
  previousHref: string;
  previousLabel: string;
  sectionKey: string;
  /** The employee directory, read on the server — people are operational. */
  people: ReferenceEntry[];
  lastChange: { by: string; at: string } | null;
}) {
  const router = useRouter();
  const section = INTAKE_SECTIONS.find((s) => s.name === sectionName)!;
  const [values, setValues] = React.useState<IntakeValues>(initial);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<{
    message: string;
    ref?: string;
    /** False when trying again cannot possibly work (§25.4, N2). */
    retryable: boolean;
  } | null>(null);

  const set = (id: string, v: string | string[]) =>
    setValues((prev) => ({ ...prev, [id]: v }));

  // A rewrite that arrived from the check, which may have run on another
  // section. Held in state so the field can be pointed at afterwards.
  const [pending, setPending] = React.useState<PendingRewrite | null>(null);

  React.useEffect(() => {
    const waiting = takeRewrite(
      projectId,
      section.fields.map((f) => f.id),
    );
    if (waiting) setPending(waiting);
    // Once, on arrival. Re-running would re-apply it over their edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sectionKey]);

  // Put the text in the field.
  React.useEffect(() => {
    if (!pending) return;
    set(pending.fieldId, pending.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Then take them to it and select the first bracket, so typing replaces
  // it. Selecting rather than merely scrolling is the difference between
  // being shown a gap and being put in it.
  //
  // This waits until the value has actually landed in the DOM. Selecting in
  // the same frame as the write set a range on the old text, and React's
  // re-render of the controlled field then dropped it — focus stayed, the
  // selection silently did not.
  const placed = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!pending) return;
    if (placed.current === pending.fieldId) return;
    if (values[pending.fieldId] !== pending.text) return;
    const el = document.getElementById(pending.fieldId) as
      HTMLTextAreaElement | HTMLInputElement | null;
    if (!el || el.value !== pending.text) return;
    placed.current = pending.fieldId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
    const spans = bracketSpans(pending.text);
    if (spans.length > 0) el.setSelectionRange(spans[0]!.from, spans[0]!.to);
  }, [pending, values]);

  const formRef = React.useRef<HTMLFormElement>(null);
  // Adopt anything typed before this component hydrated.
  //
  // The server sends real HTML, so the fields are usable immediately — but
  // they are controlled inputs, and React's first render would overwrite
  // whatever was typed in the meantime with the values the server sent.
  // Silently: no error, no sign, the answer simply gone. Reading the form
  // once on mount and taking the DOM's word for it closes that window.
  // Found because an end-to-end test kept losing a typed answer roughly one
  // run in three on a page reached by redirect.
  React.useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const submitted = new FormData(form);
    setValues((prev) => {
      const next = { ...prev };
      let changed = false;
      // ONLY the fields this form renders. Iterating every field in the
      // instrument read the other three sections as empty — the form does
      // not contain them — and wrote those blanks into client state, so a
      // complete intake reported 5, 7 and 8 answers outstanding on three
      // consecutive screens. The saved record was never touched; the
      // counts a person reads were simply false (§24.9, verifier R1).
      for (const field of section.fields) {
        if (field.type === "note") continue;
        if (field.type === "multi" || field.type === "pick-many") {
          const got = submitted.getAll(field.id).map(String);
          const before = (prev[field.id] as string[] | undefined) ?? [];
          if (
            got.length !== before.length ||
            got.some((v, i) => v !== before[i])
          ) {
            next[field.id] = got;
            changed = true;
          }
        } else {
          const got = String(submitted.get(field.id) ?? "");
          if (got !== ((prev[field.id] as string | undefined) ?? "")) {
            next[field.id] = got;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const missingFields = missingRequiredFields(values).filter((f) =>
    section.fields.some((sf) => sf.id === f.id),
  );
  const missing = missingFields.map((f) => f.label);
  // Only after someone tries to move on. Marking a field as a problem before
  // they have had a chance to fill it in is scolding, not helping (§24.4).
  const [flagged, setFlagged] = React.useState(false);
  const flaggedIds = flagged
    ? new Set(missingFields.map((f) => f.id))
    : new Set<string>();

  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      // Declare the scope: this submission is responsible for this section's
      // fields and no others. Anything outside it must be left alone.
      for (const field of section.fields) {
        if (field.type !== "note") formData.append(SCOPE_KEY, field.id);
      }
      for (const field of section.fields) {
        if (field.type === "note") continue;
        if (!isFieldVisible(field, values)) {
          if (field.type !== "multi" && field.type !== "pick-many")
            formData.set(field.id, "");
          continue;
        }
        const v = values[field.id];
        if (field.type === "multi" || field.type === "pick-many") {
          for (const item of (v as string[] | undefined) ?? [])
            formData.append(field.id, item);
        } else {
          formData.set(field.id, (v as string | undefined) ?? "");
        }
        // The name typed for an off-list answer travels with its field.
        if (field.type === "pick" || field.type === "pick-many") {
          formData.set(
            unlistedKey(field.id),
            (values[unlistedKey(field.id)] as string) ?? "",
          );
        }
      }
      const result = await saveIntake(projectId, formData);
      if (isFailure(result)) {
        setError({
          message: result.message,
          ref: result.ref,
          retryable: result.retryable,
        });
        return false;
      }
      setSavedAt(result.savedAt);
      return true;
    } catch (cause) {
      console.error("saveIntake transport", cause);
      setError({
        message:
          "The server couldn't be reached, so nothing was saved. Your answers are still on screen — try again in a moment.",
        ref: errorRef(),
        retryable: true,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  // The rail lives inside the form so it reports what is on screen rather
  // than what was last saved. Rendered from the server it went stale the
  // moment someone typed — the rail said "1 still needed" while the save bar
  // said "nothing outstanding", about the same section (§24.3).
  const progress = sectionProgress(values);
  const outstanding = progress.reduce((sum, p) => sum + p.missing.length, 0);

  return (
    <form
      ref={formRef}
      className="intake-form"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        // Required means required (FR-28). Their work is still saved — what
        // is refused is moving on, not the answers they did give.
        if (missingFields.length > 0) {
          // Save BEFORE flagging: the message says "Saved." and it has to be
          // true when it appears, not a moment later. "Saving…" covers the
          // gap, so the control still responds instantly (§24.3, §24.4).
          //
          // And it has to be true when the save FAILS, too. The return value
          // was dropped here, so a failed save on a partly-filled section
          // announced "Saved. 2 answers still needed…" over an empty record
          // — the exact sentence the comment above promises is true. The
          // failure has already set its own message; flagging would paint
          // over it.
          if (!(await save())) return;
          setFlagged(true);
          const first = missingFields[0]!;
          document.getElementById(first.id)?.focus();
          document
            .getElementById(first.id)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
        setFlagged(false);
        if (await save()) router.push(nextHref);
      }}
    >
      {/* Header, rail and save bar all read from the same live values, so
          the screen can never report two different amounts of work left
          (§24.3, §24.9). Rendered from the server they went stale the moment
          somebody typed. */}
      <ProjectHeader
        name={projectName}
        status={stage}
        nextLine={
          outstanding === 0
            ? "Everything we need — the risk areas come next."
            : `Tell us about the project — ${outstanding} answer${outstanding === 1 ? "" : "s"} still needed.`
        }
        currentStage={0}
      />

      <IntakeRail
        projectId={projectId}
        progress={progress}
        currentKey={sectionKey}
      />

      <div className="intake-main">
        <p className="eyebrow">{stepLine}</p>
        <h2 className="display gate-display">{sectionName}</h2>

        {needed && (
          /* Arriving here from the risk areas: say why, rather than bouncing
             someone back with no explanation (§25.3). */
          <p className="prefill" role="note">
            <span className="prefill-tag">Needed first</span>
            <span>
              The risk areas work from these answers — we ask you once here so
              nobody asks you again later. Fill in what&rsquo;s marked and
              you&rsquo;ll go straight through.
            </span>
          </p>
        )}

        <div className="card">
          {section.fields.map((field) =>
            isFieldVisible(field, values) ? (
              <Field
                key={field.id}
                field={field}
                values={values}
                set={set}
                flagged={flaggedIds.has(field.id)}
                people={people}
                gaps={
                  pending?.fieldId === field.id
                    ? {
                        text: String(values[field.id] ?? ""),
                        onDone: () => setPending(null),
                      }
                    : null
                }
              />
            ) : null,
          )}
        </div>

        {/* The coherence check reads the WHOLE intake, so it belongs at the
            foot of a section rather than beside one field — and beside the
            way forward rather than in front of it (§22.1, G-69). */}
        {readyForCheck && (
          <CoherenceCheck
            projectId={projectId}
            save={save}
            // Into the field, for them to edit — never into the record. The
            // grading judges whatever they finally submit, not what was
            // offered (FR-22).
            // The field it rewrites usually lives on the first section, so
            // the suggestion is carried there rather than written here into
            // a field this form does not render. It is still not saved:
            // they land on it, edit the brackets, and submit.
            onRewrite={(fieldId, suggestion) => {
              const owner = sectionKeyOwning(fieldId);
              if (!owner) return;
              holdRewrite({
                projectId,
                fieldId,
                text: suggestion.rewrite,
                placeholders: suggestion.placeholders,
              });
              if (owner === sectionKey) {
                setPending({
                  projectId,
                  fieldId,
                  text: suggestion.rewrite,
                  placeholders: suggestion.placeholders,
                });
                return;
              }
              router.push(`/projects/${projectId}/intake/${owner}`);
            }}
            // A correction writes to the record, and the field it corrects
            // usually lives on an earlier section — so pull the saved value
            // back onto this screen rather than leaving it stale.
            onFixed={() => router.refresh()}
          />
        )}

        <div className="savebar">
          <span
            className={
              flagged && missing.length > 0 ? "missing blocked" : "missing"
            }
          >
            {missing.length === 0 ? (
              "Nothing outstanding in this section."
            ) : flagged ? (
              <>
                Answer{" "}
                {missing.length === 1
                  ? "this first"
                  : `these ${missing.length} first`}{" "}
                — {missing.join(", ")}
              </>
            ) : (
              <>
                <strong>{missing.length}</strong> still needed here —{" "}
                {missing.slice(0, 2).join(", ")}
                {missing.length > 2 && ` and ${missing.length - 2} more`}
              </>
            )}
          </span>
          <span
            style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}
          >
            <span
              role="status"
              aria-live="polite"
              className={error ? "save-failed" : "saved"}
            >
              {saving ? (
                "Saving…"
              ) : error ? (
                /* A failure outranks a completeness nag. This branch sat
                 BELOW the "Saved." one, so a save that failed on a partly
                 filled section reported success and hid its own error. */

                <>
                  {error.message}{" "}
                  {error.ref && (
                    <span className="err-ref">Reference {error.ref}</span>
                  )}
                </>
              ) : flagged && missing.length > 0 ? (
                `Saved. ${missing.length} answer${missing.length === 1 ? "" : "s"} still needed before the next section: ${missing.join(", ")}.`
              ) : savedAt ? (
                "Saved"
              ) : (
                ""
              )}
            </span>
            {/* Never invite a retry that cannot work (§25.4, N2). When the
              assessment is gone or isn't theirs, retrying is not the next
              step — leaving with their answers intact is. */}
            {error && !error.retryable ? (
              <Link className="btn ghost" href="/projects">
                Go to my assessments
              </Link>
            ) : (
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Saving…" : error ? "Try again" : nextLabel}
              </button>
            )}
          </span>
        </div>

        <div className="gate-nav">
          <Link
            className="btn ghost"
            href={previousHref}
            onClick={() => void save()}
          >
            {previousLabel}
          </Link>
        </div>

        {lastChange && (
          <p className="attribution">
            Last change saved by <strong>{lastChange.by}</strong>
            {" · "}
            {lastChange.at}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * The gaps a suggested rewrite left behind, listed under the field.
 *
 * A textarea cannot carry markup, so the brackets cannot be highlighted
 * where they sit. Pointing at them from underneath does the same work and
 * one thing better: choosing one **selects** it, so typing replaces it.
 * Being put in the gap beats being shown it.
 */
function Gaps({
  fieldId,
  text,
  onDone,
}: {
  fieldId: string;
  text: string;
  onDone: () => void;
}) {
  const spans = bracketSpans(text);
  if (spans.length === 0) {
    return (
      <p className="gaps-clear" role="status">
        <span aria-hidden="true">✓</span> Nothing left in brackets — this is
        ready to save.
      </p>
    );
  }
  const jump = (from: number, to: number) => {
    const el = document.getElementById(fieldId) as HTMLTextAreaElement | null;
    if (!el) return;
    el.focus();
    el.setSelectionRange(from, to);
  };
  return (
    <div className="gaps">
      <p className="gaps-head">
        <span className="gaps-count">{spans.length}</span>
        {spans.length === 1 ? "gap to fill in" : "gaps to fill in"} — nothing
        here was invented, so anything it did not know is a question for you
      </p>
      <ol className="gaps-list">
        {spans.map((span, at) => (
          <li key={at}>
            <button
              type="button"
              className="link-button"
              onClick={() => jump(span.from, span.to)}
            >
              {text.slice(span.from + 1, span.to - 1)}
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="link-button gaps-dismiss"
        onClick={onDone}
      >
        Hide this
      </button>
    </div>
  );
}

function Field({
  field,
  values,
  set,
  flagged,
  people,
  gaps,
}: {
  field: IntakeField;
  values: IntakeValues;
  set: (id: string, v: string | string[]) => void;
  flagged: boolean;
  /** The employee directory, loaded on the server (G-46's exception). */
  people: ReferenceEntry[];
  /** Set when a suggestion has just been placed here and has gaps in it. */
  gaps: { text: string; onDone: () => void } | null;
}) {
  if (field.type === "note") {
    return (
      <div className="note" role="note">
        <p className="note-title">
          <span aria-hidden="true">✓</span> {field.label}
        </p>
        <p className="note-body">{field.body}</p>
      </div>
    );
  }
  const labelId = `${field.id}-label`;
  const text = (
    <>
      {field.label} {field.required && <span className="req">*</span>}
    </>
  );
  const label = (
    <>
      {field.type === "multi" || field.type === "pick-many" ? (
        <p className="field" id={labelId}>
          {text}
        </p>
      ) : (
        <label className="field" htmlFor={field.id}>
          {text}
        </label>
      )}
      {field.help && <p className="help">{field.help}</p>}
    </>
  );
  const body = (
    <>
      <Control
        field={field}
        values={values}
        set={set}
        flagged={flagged}
        people={people}
        labelId={labelId}
      />
      {gaps && (
        <Gaps fieldId={field.id} text={gaps.text} onDone={gaps.onDone} />
      )}
    </>
  );
  if (field.conditional) {
    return (
      <div className="reveal">
        <p className="why">
          <span aria-hidden="true">↳</span> {field.revealNote}
        </p>
        {label}
        {body}
      </div>
    );
  }
  return (
    <div>
      {label}
      {body}
    </div>
  );
}

function Control({
  field,
  values,
  set,
  flagged,
  people,
  labelId,
}: {
  field: IntakeField;
  values: IntakeValues;
  set: (id: string, v: string | string[]) => void;
  flagged: boolean;
  people: ReferenceEntry[];
  labelId: string;
}) {
  const value = values[field.id];
  const directory = field.list === "people" ? people : null;
  // aria-required is on every required control, always. aria-invalid appears
  // only once someone has tried to move on without it.
  const validity = {
    "aria-required": field.required || undefined,
    "aria-invalid": flagged || undefined,
    className: flagged ? "flagged" : undefined,
  } as const;
  if (field.type === "pick" || field.type === "pick-many") {
    const many = field.type === "pick-many";
    const chosen = many
      ? ((value as string[]) ?? [])
      : [(value as string) ?? ""];
    const offList = chosen.includes(UNLISTED_OPTION);
    const typedKey = unlistedKey(field.id);
    const typed = (values[typedKey] as string) ?? "";
    // The options come from the instrument's declared list — this component
    // holds no names of its own, which is the rule S4.5 exists to keep
    // (FR-29, G-46).
    const options = directory
      ? directory
      : field.list
        ? entriesOf(field.list)
        : [];

    const toggle = (id: string, on: boolean) => {
      if (!many) {
        set(field.id, on ? id : "");
        return;
      }
      const next = on ? [...chosen, id] : chosen.filter((c) => c !== id);
      set(field.id, next);
    };

    return (
      <>
        {many ? (
          <div className="checks" role="group" aria-labelledby={labelId}>
            {options.map((option) => (
              <label key={option.id}>
                <input
                  type="checkbox"
                  name={field.id}
                  value={option.id}
                  checked={chosen.includes(option.id)}
                  onChange={(e) => toggle(option.id, e.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                name={field.id}
                value={UNLISTED_OPTION}
                checked={offList}
                onChange={(e) => toggle(UNLISTED_OPTION, e.target.checked)}
              />
              <span>Something else — not on this list</span>
            </label>
          </div>
        ) : (
          <select
            id={field.id}
            name={field.id}
            value={chosen[0] ?? ""}
            onChange={(e) => set(field.id, e.target.value)}
            {...validity}
          >
            <option value="">Select…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
            <option value={UNLISTED_OPTION}>
              Something else — not on this list
            </option>
          </select>
        )}
        {offList && (
          /* FR-31: the escape hatch is never a dead end. Choosing it asks
             for the name, and says what happens to it — a person who types
             one should not have to wonder whether it went anywhere. */
          <div className="reveal">
            <label className="field" htmlFor={typedKey}>
              {many ? "Which ones? One per line." : "What is it called?"}
            </label>
            {many ? (
              <textarea
                id={typedKey}
                name={typedKey}
                value={typed}
                rows={3}
                onChange={(e) => set(typedKey, e.target.value)}
              />
            ) : (
              <input
                id={typedKey}
                name={typedKey}
                type="text"
                value={typed}
                onChange={(e) => set(typedKey, e.target.value)}
              />
            )}
            <p className="help">
              This goes on your assessment straight away. It reaches everyone
              else&rsquo;s list once an administrator confirms it.
            </p>
          </div>
        )}
      </>
    );
  }
  if (field.type === "text" || field.type === "date") {
    return (
      <input
        id={field.id}
        name={field.id}
        type={field.type}
        value={(value as string) ?? ""}
        onChange={(e) => set(field.id, e.target.value)}
        {...validity}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <>
        <textarea
          id={field.id}
          name={field.id}
          value={(value as string) ?? ""}
          onChange={(e) => set(field.id, e.target.value)}
          {...validity}
        />
      </>
    );
  }
  if (field.type === "select") {
    return (
      <select
        id={field.id}
        name={field.id}
        value={(value as string) ?? ""}
        onChange={(e) => set(field.id, e.target.value)}
        {...validity}
      >
        <option value="">Select…</option>
        {field.options!.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "choice") {
    // One answer on a scale, laid out as the scale (§23). A dropdown hides
    // the options behind a click and hides the ordering entirely, so a
    // person cannot see that they are choosing a level at all.
    const chosen = (value as string) ?? "";
    return (
      <div
        className={flagged ? "levels flagged" : "levels"}
        role="radiogroup"
        aria-labelledby={`${field.id}-label`}
        aria-required={field.required || undefined}
        aria-invalid={flagged || undefined}
      >
        {field.options!.map((o, i) => (
          <label key={o} className={`level${chosen === o ? " chosen" : ""}`}>
            <input
              type="radio"
              name={field.id}
              id={i === 0 ? field.id : undefined}
              value={o}
              checked={chosen === o}
              onChange={() => set(field.id, o)}
            />
            <span className="level-body">
              <span className="level-name">
                <span className="level-rank" aria-hidden="true">
                  {"●".repeat(i + 1)}
                  <span className="level-rank-rest">
                    {"○".repeat(field.options!.length - i - 1)}
                  </span>
                </span>
                {o}
              </span>
              {field.optionHelp?.[o] && (
                <span className="level-what">{field.optionHelp[o]}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    );
  }
  const selected = (value as string[] | undefined) ?? [];
  return (
    <div
      className={flagged ? "checks flagged" : "checks"}
      role="group"
      aria-labelledby={`${field.id}-label`}
      aria-required={field.required || undefined}
      aria-invalid={flagged || undefined}
      /* The group is the control here; the first checkbox carries the id so
         focusing the "missing" field lands somewhere a keyboard can act. */
      id={`${field.id}-group`}
    >
      {field.options!.map((o, i) => (
        <label key={o}>
          <input
            type="checkbox"
            id={i === 0 ? field.id : undefined}
            name={field.id}
            value={o}
            checked={selected.includes(o)}
            onChange={(e) =>
              set(
                field.id,
                e.target.checked
                  ? [...selected, o]
                  : selected.filter((x) => x !== o),
              )
            }
          />
          {o}
        </label>
      ))}
    </div>
  );
}
