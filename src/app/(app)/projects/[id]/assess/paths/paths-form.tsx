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
import { answerPaths } from "@/app/actions";
import type { Category } from "@/lib/instrument";
import type { LitPath } from "@/lib/engine";
import { SaveBar, useAutosave } from "../autosave";

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
  const [picked, setPicked] = React.useState<Record<string, string[]>>(
    Object.fromEntries(areas.map((a) => [a.category.key, a.selected])),
  );
  const autosave = useAutosave({
    where: "answerPaths",
    transportMessage:
      "The server couldn't be reached, so nothing was saved. Your selections are still on screen — try again in a moment.",
  });
  const everyArea = areas.map((a) => a.category.key);

  // One call covering every area named: all of them land or none do, so the
  // message below can be true. Saving them in a loop meant a failure halfway
  // committed the first areas while telling the person nothing had been
  // saved — and the unsaved ticks then vanished on reload.
  const write = (selections: Record<string, string[]>, areaKeys: string[]) =>
    answerPaths(
      projectId,
      Object.fromEntries(
        areas
          .filter((a) => areaKeys.includes(a.category.key))
          .map((a) => [a.category.key, selections[a.category.key] ?? []]),
      ),
    );

  // Ticks are saved as they are made, not only on submit. Leaving by the
  // rail — the primary navigation on this very screen — used to discard them
  // silently, which is the one thing §24.3 says a control must never do. The
  // submit button still exists: it saves and moves on.
  function toggle(key: string, id: string, on: boolean) {
    // Computed outside setPicked: a state updater must be pure, and saving
    // from inside one made React's double-invoke toggle the tick twice.
    const current = picked[key] ?? [];
    const next = {
      ...picked,
      [key]: on ? [...current, id] : current.filter((x) => x !== id),
    };
    setPicked(next);
    autosave.touched.current.add(key);
    // Only the areas this person has touched: ticking one box used to commit
    // a positive "none of these apply" for every other open area.
    autosave.save(() => write(next, [...autosave.touched.current]));
  }

  const chosenCount = Object.values(picked).flat().length;
  const derivedCount = areas.reduce((n, a) => n + a.derived.length, 0);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // Submitting is a different act from autosaving: it covers every
        // question on screen, touched or not.
        void autosave.submit(() => write(picked, everyArea), nextHref);
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
                haven&rsquo;t asked you to become sure. Tick anything you do
                know — a reviewer works out the rest.
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
                  checked={(picked[area.category.key] ?? []).includes(
                    option.id,
                  )}
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

      <SaveBar
        state={autosave}
        submitLabel="Next: how severe →"
        status={
          chosenCount === 0
            ? "Nothing selected yet — that's a valid answer if none of them apply."
            : `${chosenCount} selected${derivedCount > 0 ? `, ${derivedCount} added from what you've already told us` : ""}.`
        }
      />
    </form>
  );
}
