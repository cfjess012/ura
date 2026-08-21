"use client";

/**
 * The intake form, rendered entirely from the instrument data (FR-1).
 * Conditional fields reveal live and are visually distinct with a
 * plain-language reason (SPEC §9); hidden conditional values are not
 * submitted, so a withdrawn trigger clears its dependents on save.
 */
import * as React from "react";
import {
  INTAKE_SECTIONS,
  isFieldVisible,
  missingRequired,
  type IntakeField,
  type IntakeValues,
} from "@/lib/intake";
import { saveIntake } from "@/app/actions";
import { isFailure } from "@/lib/errors";

export function IntakeForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: IntakeValues;
}) {
  const [values, setValues] = React.useState<IntakeValues>(initial);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<{ message: string; ref: string } | null>(null);

  const set = (id: string, v: string | string[]) =>
    setValues((prev) => ({ ...prev, [id]: v }));

  const missing = missingRequired(values);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const formData = new FormData();
      for (const section of INTAKE_SECTIONS) {
        for (const field of section.fields) {
          if (field.type === "note") continue; // asks nothing, stores nothing
          if (!isFieldVisible(field, values)) {
            if (field.type === "multi") continue; // absent = cleared server-side
            formData.set(field.id, "");
            continue;
          }
          const v = values[field.id];
          if (field.type === "multi") {
            for (const item of (v as string[] | undefined) ?? [])
              formData.append(field.id, item);
          } else {
            formData.set(field.id, (v as string | undefined) ?? "");
          }
        }
      }
      const result = await saveIntake(projectId, formData);
      if (isFailure(result)) {
        // Failure is a designed state: what happened, is their work safe,
        // what to do now, and a reference they can quote (§24.3, §25).
        setSaveError({ message: result.message, ref: result.ref });
      } else {
        setSavedAt(result.savedAt);
      }
    } catch (error) {
      // The action itself never reached us (offline, deploy mid-request).
      console.error("saveIntake transport", error);
      setSaveError({
        message:
          "Couldn't reach the server — your answers are still on screen. Check your connection and try again.",
        ref: "OFFLINE",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {INTAKE_SECTIONS.map((section) => (
        <section className="card" key={section.name}>
          <h2>{section.name}</h2>
          {section.fields.map((field) =>
            isFieldVisible(field, values) ? (
              <Field key={field.id} field={field} values={values} set={set} />
            ) : null,
          )}
        </section>
      ))}
      <div className="savebar">
        <span className="missing">
          {missing.length === 0 ? (
            "All required fields answered."
          ) : (
            <>
              <strong>{missing.length}</strong> still needed —{" "}
              {missing.slice(0, 2).join(", ")}
              {missing.length > 2 && ` and ${missing.length - 2} more`}
            </>
          )}
        </span>
        <span style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
          {/* One unambiguous status region — never a silent second (SPEC §9). */}
          <span
            role="status"
            aria-live="polite"
            className={saveError ? "save-failed" : "saved"}
          >
            {saving ? (
              "Saving…"
            ) : saveError ? (
              <>
                {saveError.message}{" "}
                <span className="err-ref">Reference {saveError.ref}</span>
              </>
            ) : savedAt ? (
              "All changes stored"
            ) : (
              ""
            )}
          </span>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving…" : saveError ? "Try again" : "Save intake"}
          </button>
        </span>
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
  const body = <FieldControl field={field} values={values} set={set} />;
  // A checkbox group has no single control to point at: it is named by an
  // element id via aria-labelledby, not by <label for>. Without this the
  // group has no accessible name at all.
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

function FieldControl({
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
