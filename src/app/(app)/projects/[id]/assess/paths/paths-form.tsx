"use client";

/**
 * Which threads apply, for every risk area that is open (FR-4).
 *
 * One screen rather than one per area, deliberately: after eleven gates
 * answered one at a time, a person needs to see the shape of what is left.
 * Each area is still its own decision with its own heading — §24.2 is about
 * pacing, not about a hard limit of one control per page.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { answerPaths } from "@/app/actions";
import { isFailure } from "@/lib/errors";
import type { Category } from "@/lib/instrument";
import type { LitPath } from "@/lib/engine";

export type PathArea = {
  category: Category;
  selected: string[];
  /** Paths the engine lit without asking, with the reason to show. */
  derived: LitPath[];
};

export function PathsForm({
  projectId,
  areas,
  nextHref,
}: {
  projectId: string;
  areas: PathArea[];
  nextHref: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<Record<string, string[]>>(
    Object.fromEntries(areas.map((a) => [a.category.key, a.selected])),
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<{
    message: string;
    ref: string;
    retryable: boolean;
  } | null>(null);
  const [saved, setSaved] = React.useState(false);

  function toggle(key: string, id: string, on: boolean) {
    setPicked((prev) => {
      const current = prev[key] ?? [];
      return {
        ...prev,
        [key]: on ? [...current, id] : current.filter((x) => x !== id),
      };
    });
    setSaved(false);
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      for (const area of areas) {
        const result = await answerPaths(
          projectId,
          area.category.key,
          picked[area.category.key] ?? [],
        );
        if (isFailure(result)) {
          setError({
            message: result.message,
            ref: result.ref,
            retryable: result.retryable,
          });
          return false;
        }
      }
      setSaved(true);
      return true;
    } catch (cause) {
      console.error("answerPaths transport", cause);
      setError({
        message:
          "The server couldn't be reached, so nothing was saved. Your selections are still on screen — try again in a moment.",
        ref: "OFFLINE",
        retryable: true,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  const chosenCount = Object.values(picked).flat().length;
  const derivedCount = areas.reduce((n, a) => n + a.derived.length, 0);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (await save()) router.push(nextHref);
      }}
    >
      {areas.map((area) => (
        <section key={area.category.key} className="card patharea">
          <h3>{area.category.name}</h3>
          <p className="gate-question" id={`${area.category.key}-label`}>
            {area.category.pathQuestion!.text}
          </p>
          <p className="help gate-help">{area.category.pathQuestion!.help}</p>

          <div
            className="checks pathopts"
            role="group"
            aria-labelledby={`${area.category.key}-label`}
          >
            {area.category.pathQuestion!.options.map((option) => (
              <label key={option.id} className="pathopt">
                <input
                  type="checkbox"
                  name={area.category.pathQuestion!.questionId}
                  value={option.id}
                  checked={(picked[area.category.key] ?? []).includes(option.id)}
                  onChange={(e) =>
                    toggle(area.category.key, option.id, e.target.checked)
                  }
                />
                <span>
                  <span className="pathopt-label">{option.label}</span>
                  {option.help && (
                    <span className="pathopt-help">{option.help}</span>
                  )}
                </span>
              </label>
            ))}
          </div>

          {area.derived.map((path) => (
            <p className="prefill derived" role="note" key={path.id}>
              <span className="prefill-tag">Added for you</span>
              <span>
                <strong>{path.name}</strong> — {path.because}.
              </span>
            </p>
          ))}
        </section>
      ))}

      <div className="savebar">
        <span className="missing">
          {chosenCount === 0
            ? "Nothing selected yet — that's a valid answer if none of them apply."
            : `${chosenCount} selected${derivedCount > 0 ? `, ${derivedCount} added from what you've already told us` : ""}.`}
        </span>
        <span style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
          <span
            role="status"
            aria-live="polite"
            className={error ? "save-failed" : "saved"}
          >
            {saving ? (
              "Saving…"
            ) : error ? (
              <>
                {error.message}{" "}
                <span className="err-ref">Reference {error.ref}</span>
              </>
            ) : saved ? (
              "Saved"
            ) : (
              ""
            )}
          </span>
          {error && !error.retryable ? (
            <Link className="btn ghost" href="/projects">
              Go to my assessments
            </Link>
          ) : (
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving…" : "See what we'll ask →"}
            </button>
          )}
        </span>
      </div>
    </form>
  );
}
