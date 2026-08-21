"use client";

/**
 * One intake section, one screen (§24.2). Saves on the way out so nothing
 * is lost between sections, and reports failure as a designed state (§25).
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveIntake } from "@/app/actions";
import { isFailure } from "@/lib/errors";
import {
  INTAKE_SECTIONS,
  isFieldVisible,
  type IntakeField,
  type IntakeValues,
} from "@/lib/intake";

export function SectionForm({
  projectId,
  sectionName,
  initial,
  nextHref,
  nextLabel,
  previousHref,
  previousLabel,
}: {
  projectId: string;
  sectionName: string;
  initial: IntakeValues;
  nextHref: string;
  nextLabel: string;
  previousHref: string;
  previousLabel: string;
}) {
  const router = useRouter();
  const section = INTAKE_SECTIONS.find((s) => s.name === sectionName)!;
  const [values, setValues] = React.useState<IntakeValues>(initial);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<{ message: string; ref: string } | null>(null);

  const set = (id: string, v: string | string[]) =>
    setValues((prev) => ({ ...prev, [id]: v }));

  const missing = section.fields
    .filter((f) => f.required && f.type !== "note" && isFieldVisible(f, values))
    .filter((f) => {
      const v = values[f.id];
      return Array.isArray(v) ? v.length === 0 : !(v as string | undefined)?.trim();
    })
    .map((f) => f.label);

  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      // Send this section only; other sections keep their stored values.
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
        setError({ message: result.message, ref: result.ref });
        return false;
      }
      setSavedAt(result.savedAt);
      return true;
    } catch (cause) {
      console.error("saveIntake transport", cause);
      setError({
        message:
          "Couldn't reach the server — your answers are still on screen. Check your connection.",
        ref: "OFFLINE",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (await save()) router.push(nextHref);
      }}
    >
      <div className="card">
        {section.fields.map((field) =>
          isFieldVisible(field, values) ? (
            <Field key={field.id} field={field} values={values} set={set} />
          ) : null,
        )}
      </div>

      <div className="savebar">
        <span className="missing">
          {missing.length === 0 ? (
            "Nothing outstanding in this section."
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
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving…" : error ? "Try again" : nextLabel}
          </button>
        </span>
      </div>

      <div className="gate-nav">
        <Link className="btn ghost" href={previousHref} onClick={() => void save()}>
          {previousLabel}
        </Link>
      </div>
    </form>
  );
}

function Field({
  field,
  values,
  set,
}: {
  field: IntakeField;
  values: IntakeValues;
  set: (id: string, v: string | string[]) => void;
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
  const body = <Control field={field} values={values} set={set} />;
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
}: {
  field: IntakeField;
  values: IntakeValues;
  set: (id: string, v: string | string[]) => void;
}) {
  const value = values[field.id];
  if (field.type === "text" || field.type === "date") {
    return (
      <input
        id={field.id}
        type={field.type}
        value={(value as string) ?? ""}
        onChange={(e) => set(field.id, e.target.value)}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        id={field.id}
        value={(value as string) ?? ""}
        onChange={(e) => set(field.id, e.target.value)}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        id={field.id}
        value={(value as string) ?? ""}
        onChange={(e) => set(field.id, e.target.value)}
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
  const selected = (value as string[] | undefined) ?? [];
  return (
    <div className="checks" role="group" aria-labelledby={`${field.id}-label`}>
      {field.options!.map((o) => (
        <label key={o}>
          <input
            type="checkbox"
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
