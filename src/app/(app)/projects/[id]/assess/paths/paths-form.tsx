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
import { errorRef, isFailure } from "@/lib/errors";
import type { Category } from "@/lib/instrument";
import type { LitPath } from "@/lib/engine";

export type PathArea = {
  category: Category;
  selected: string[];
  /** Paths the engine lit without asking, with the reason to show. */
  derived: LitPath[];
  /** The gate opened only because the person said they weren't sure. */
  unsure: boolean;
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
  // Which areas this person has actually touched. An autosave writes only
  // those: ticking one box used to commit a positive "none of these apply"
  // for every other open area, so three questions nobody had answered were
  // recorded as answered. Submitting the form is a different act — it
  // covers every question on screen — so that writes them all.
  const touched = React.useRef<Set<string>>(new Set());
  const inFlight = React.useRef<Promise<boolean> | null>(null);
  const [error, setError] = React.useState<{
    message: string;
    ref: string;
    retryable: boolean;
  } | null>(null);
  const [saved, setSaved] = React.useState(false);

  // Ticks are saved as they are made, not only on submit. Leaving by the
  // rail — the primary navigation on this very screen — used to discard
  // them silently, which is the one thing §24.3 says a control must never
  // do. The submit button still exists: it saves and moves on.
  function toggle(key: string, id: string, on: boolean) {
    // Computed outside setPicked: a state updater must be pure, and saving
    // from inside one made React's double-invoke toggle the tick twice.
    const current = picked[key] ?? [];
    const next = {
      ...picked,
      [key]: on ? [...current, id] : current.filter((x) => x !== id),
    };
    setPicked(next);
    touched.current.add(key);
    const running = save(next, [...touched.current]);
    inFlight.current = running;
    void running.finally(() => {
      if (inFlight.current === running) inFlight.current = null;
    });
  }

  async function save(
    selections = picked,
    /** Which areas to write. Everything, when the person submits. */
    areaKeys: string[] = areas.map((a) => a.category.key),
  ): Promise<boolean> {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // One call covering every area: all of them land or none do, so the
      // message below can be true. Saving them in a loop meant a failure
      // halfway committed the first areas while telling the person nothing
      // had been saved — and the unsaved ticks then vanished on reload.
      const result = await answerPaths(
        projectId,
        Object.fromEntries(
          areas
            .filter((a) => areaKeys.includes(a.category.key))
            .map((a) => [a.category.key, selections[a.category.key] ?? []]),
        ),
      );
      if (isFailure(result)) {
        setError({
          message: result.message,
          ref: result.ref,
          retryable: result.retryable,
        });
        return false;
      }
      setSaved(true);
      return true;
    } catch (cause) {
      console.error("answerPaths transport", cause);
      setError({
        message:
          "The server couldn't be reached, so nothing was saved. Your selections are still on screen — try again in a moment.",
        // A per-incident reference, not a class name: support needs to
        // correlate one person's report with one moment in the log.
        ref: errorRef(),
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
        // Wait for any autosave already in flight rather than refusing the
        // press: a disabled forward control swallowed the click silently,
        // which is the one thing a control must never do (§24.3).
        if (inFlight.current) await inFlight.current;
        const done = save();
        inFlight.current = done;
        if (await done) router.push(nextHref);
        inFlight.current = null;
      }}
    >
      {areas.map((area) => (
        <section key={area.category.key} className="card patharea">
          <h3>{area.category.name}</h3>
          <p className="gate-question" id={`${area.category.key}-label`}>
            {area.category.pathQuestion!.text}
          </p>
          <p className="help gate-help">{area.category.pathQuestion!.help}</p>

          {area.unsure && (
            <p className="note" role="note">
              <span className="note-title">
                <span aria-hidden="true">✓</span> Leave this one to us
              </span>
              <span className="note-body">
                You told us you weren&rsquo;t sure about this area, and we
                haven&rsquo;t asked you to become sure. Tick anything you do know
                — a reviewer works out the rest.
              </span>
            </p>
          )}

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
                <strong>{path.name}</strong> — {path.because.join("; and ")}
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
            /* The message tells them to reload; the control has to be the
               thing the message names. */
            <button className="btn" type="button" onClick={() => router.refresh()}>
              Reload the questions
            </button>
          ) : (
            <button className="btn" type="submit">
              {"Next: how severe →"}
            </button>
          )}
        </span>
      </div>
    </form>
  );
}
