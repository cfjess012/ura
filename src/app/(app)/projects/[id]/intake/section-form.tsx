"use client";

/**
 * One intake section, one screen (§24.2). Saves on the way out so nothing
 * is lost between sections, and reports failure as a designed state (§25).
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveIntake } from "@/app/actions";
import { SCOPE_KEY } from "@/lib/intake-values";
import { isFailure } from "@/lib/errors";
import {
  ALL_FIELDS,
  INTAKE_SECTIONS,
  isFieldVisible,
  missingRequiredFields,
  sectionProgress,
  type IntakeField,
  type IntakeValues,
} from "@/lib/intake";
import { IntakeRail } from "./intake-rail";
import { ProjectHeader } from "../project-header";

export function SectionForm({
  projectId,
  projectName,
  stepLine,
  needed,
  sectionName,
  initial,
  nextHref,
  nextLabel,
  previousHref,
  previousLabel,
  sectionKey,
  lastChange,
}: {
  projectId: string;
  projectName: string;
  stepLine: string;
  needed: boolean;
  sectionName: string;
  initial: IntakeValues;
  nextHref: string;
  nextLabel: string;
  previousHref: string;
  previousLabel: string;
  sectionKey: string;
  lastChange: { by: string; at: string } | null;
}) {
  const router = useRouter();
  const section = INTAKE_SECTIONS.find((s) => s.name === sectionName)!;
  const [values, setValues] = React.useState<IntakeValues>(initial);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<{
    message: string;
    ref: string;
    /** False when trying again cannot possibly work (§25.4, N2). */
    retryable: boolean;
  } | null>(null);

  const set = (id: string, v: string | string[]) =>
    setValues((prev) => ({ ...prev, [id]: v }));

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
      for (const field of ALL_FIELDS) {
        if (field.type === "note") continue;
        if (field.type === "multi") {
          const got = submitted.getAll(field.id).map(String);
          const before = (prev[field.id] as string[] | undefined) ?? [];
          if (got.length !== before.length || got.some((v, i) => v !== before[i])) {
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
  const flaggedIds = flagged ? new Set(missingFields.map((f) => f.id)) : new Set<string>();

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
          if (field.type !== "multi") formData.set(field.id, "");
          continue;
        }
        const v = values[field.id];
        if (field.type === "multi") {
          for (const item of (v as string[] | undefined) ?? []) formData.append(field.id, item);
        } else {
          formData.set(field.id, (v as string | undefined) ?? "");
        }
      }
      const result = await saveIntake(projectId, formData);
      if (isFailure(result)) {
        setError({ message: result.message, ref: result.ref, retryable: result.retryable });
        return false;
      }
      setSavedAt(result.savedAt);
      return true;
    } catch (cause) {
      console.error("saveIntake transport", cause);
      setError({
        message:
          "The server couldn't be reached, so nothing was saved. Your answers are still on screen — try again in a moment.",
        ref: "OFFLINE",
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
          await save();
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
        status="Draft"
        nextLine={
          outstanding === 0
            ? "Everything we need — the risk areas come next."
            : `Tell us about the project — ${outstanding} answer${outstanding === 1 ? "" : "s"} still needed.`
        }
        currentStage={0}
      />

      <IntakeRail projectId={projectId} progress={progress} currentKey={sectionKey} />

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
            />
          ) : null,
        )}
      </div>

      <div className="savebar">
        <span className={flagged && missing.length > 0 ? "missing blocked" : "missing"}>
          {missing.length === 0 ? (
            "Nothing outstanding in this section."
          ) : flagged ? (
            <>
              Answer {missing.length === 1 ? "this first" : `these ${missing.length} first`} —{" "}
              {missing.join(", ")}
            </>
          ) : (
            <>
              <strong>{missing.length}</strong> still needed here — {missing.slice(0, 2).join(", ")}
              {missing.length > 2 && ` and ${missing.length - 2} more`}
            </>
          )}
        </span>
        <span style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
          <span role="status" aria-live="polite" className={error ? "save-failed" : "saved"}>
            {saving ? (
              "Saving…"
            ) : flagged && missing.length > 0 ? (
              `Saved. ${missing.length} answer${missing.length === 1 ? "" : "s"} still needed before the next section: ${missing.join(", ")}.`
            ) : error ? (
              <>
                {error.message} <span className="err-ref">Reference {error.ref}</span>
              </>
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
        <Link className="btn ghost" href={previousHref} onClick={() => void save()}>
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

function Field({
  field,
  values,
  set,
  flagged,
}: {
  field: IntakeField;
  values: IntakeValues;
  set: (id: string, v: string | string[]) => void;
  flagged: boolean;
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
      {field.type === "multi" ? (
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
  const body = <Control field={field} values={values} set={set} flagged={flagged} />;
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
}: {
  field: IntakeField;
  values: IntakeValues;
  set: (id: string, v: string | string[]) => void;
  flagged: boolean;
}) {
  const value = values[field.id];
  // aria-required is on every required control, always. aria-invalid appears
  // only once someone has tried to move on without it.
  const validity = {
    "aria-required": field.required || undefined,
    "aria-invalid": flagged || undefined,
    className: flagged ? "flagged" : undefined,
  } as const;
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
      <textarea
        id={field.id}
        name={field.id}
        value={(value as string) ?? ""}
        onChange={(e) => set(field.id, e.target.value)}
        {...validity}
      />
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
                  <span className="level-rank-rest">{"○".repeat(field.options!.length - i - 1)}</span>
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
              set(field.id, e.target.checked ? [...selected, o] : selected.filter((x) => x !== o))
            }
          />
          {o}
        </label>
      ))}
    </div>
  );
}
