"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { choosePlatforms, confirmInherited } from "@/app/platform-actions";
import { isFailure } from "@/lib/errors";

/**
 * What this activity sits on, and what that answers for it (G-83).
 *
 * The bottleneck this replaces: ten of the fifteen control questions a
 * requester faces are about the enterprise estate — is multi-factor
 * authentication enforced, is privileged access separated. Nobody's project
 * decides those, so people guessed or stopped. Here they say which platforms
 * the activity uses, which is a fact they know, and the controls those
 * platforms provide arrive with the provider's name and the date they
 * attested.
 *
 * Nothing is inherited silently (§22.1). Coverage is listed, attributed and
 * confirmed by a person before it becomes an answer — an answer that appeared
 * from nowhere is indistinguishable from one somebody invented. A platform
 * whose attestation has lapsed is shown as lapsed and covers nothing.
 */

export type PlatformChoice = {
  id: string;
  name: string;
  purpose: string;
  owner: string;
  provides: number;
  attestedOn: string;
  stale: boolean;
};

export type CoveredControl = {
  objective: string;
  name: string;
  platformName: string;
  owner: string;
  attestedOn: string;
};

export function PlatformPanel({
  projectId,
  roster,
  chosen,
  covered,
  lapsed,
  mismatches,
  accepted,
  unconfirmed,
}: {
  projectId: string;
  roster: PlatformChoice[];
  chosen: string[];
  covered: CoveredControl[];
  lapsed: Array<{ name: string; because: string }>;
  mismatches: Array<{ platformName: string; because: string }>;
  /** Covered controls whose inherited answer is already recorded. */
  accepted: string[];
  /** Covered controls with no answer yet — what the confirm button acts on. */
  unconfirmed: number;
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<string[]>(chosen);
  const [find, setFind] = React.useState("");
  const [busy, setBusy] = React.useState<"saving" | "confirming" | null>(null);
  const [said, setSaid] = React.useState("");
  const [stopped, setStopped] = React.useState<{ message: string; ref?: string } | null>(
    null,
  );

  // Twenty-one platforms would swamp the questions they exist to remove, so
  // the list filters and scrolls. The order stays put while filtering: an
  // item that jumps out from under the cursor is how a mis-click happens.
  const needle = find.trim().toLowerCase();
  const shown = needle
    ? roster.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.purpose.toLowerCase().includes(needle),
      )
    : roster;

  const chosenNames = roster.filter((p) => picked.includes(p.id)).map((p) => p.name);

  async function choose(next: string[]) {
    const previous = picked;
    setPicked(next);
    setBusy("saving");
    setStopped(null);
    const result = await choosePlatforms(projectId, next);
    setBusy(null);
    if (isFailure(result)) {
      setPicked(previous);
      setStopped({ message: result.message, ref: result.ref });
      return;
    }
    setSaid("Saved");
    router.refresh();
  }

  async function confirm() {
    setBusy("confirming");
    setStopped(null);
    const result = await confirmInherited(projectId);
    setBusy(null);
    if (isFailure(result)) {
      setStopped({ message: result.message, ref: result.ref });
      return;
    }
    setSaid(
      `${result.confirmed} control${result.confirmed === 1 ? "" : "s"} recorded, each naming who provides it`,
    );
    router.refresh();
  }

  return (
    <section className="card platform-panel">
      <h2>What does this activity run on?</h2>
      <p className="help">
        Pick the platforms it uses. Each one has been assessed in its own
        right, so the controls it provides are answered by the team that runs
        it — you do not have to know whether multi-factor authentication is
        switched on across the company. Leave this empty if none of them apply,
        and answer the questions below yourself.
      </p>

      <label className="platform-find">
        <span>
          Find a platform{" "}
          <em>
            {needle
              ? `${shown.length} of ${roster.length} match`
              : `${roster.length} assessed, scroll for the rest`}
          </em>
        </span>
        <input
          type="search"
          value={find}
          placeholder="Part of a name, or what it is used for"
          onChange={(event) => setFind(event.target.value)}
        />
      </label>

      <fieldset className="platform-list">
        <legend className="sr-only">Platforms this activity uses</legend>
        {shown.length === 0 ? (
          <p className="platform-none">
            Nothing here matches “{find}”. Clear the box to see all{" "}
            {roster.length} again.
          </p>
        ) : (
          shown.map((platform) => {
            const on = picked.includes(platform.id);
            return (
              <label className="platform" key={platform.id} data-on={on}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={busy !== null}
                  onChange={() =>
                    choose(
                      on
                        ? picked.filter((id) => id !== platform.id)
                        : [...picked, platform.id],
                    )
                  }
                />
                <span className="platform-body">
                  <span className="platform-name">
                    {platform.name}
                    {platform.stale && (
                      <span className="platform-lapsed">Attestation lapsed</span>
                    )}
                  </span>
                  <span className="platform-purpose">{platform.purpose}</span>
                  <span className="platform-meta">
                    {platform.owner} · attested {platform.attestedOn} ·{" "}
                    {platform.provides > 0
                      ? `provides ${platform.provides} control${platform.provides === 1 ? "" : "s"}`
                      : "provides no controls; assessed for what may be put on it"}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </fieldset>

      <p className="platform-status" role="status">
        {busy === "saving"
          ? "Saving…"
          : busy === "confirming"
            ? "Recording…"
            : chosenNames.length === 0
              ? "Nothing chosen yet, so every control below is yours to answer."
              : `${said ? `${said}. ` : ""}Running on ${chosenNames.join(", ")}.`}
      </p>

      {stopped && (
        <p className="platform-stopped" role="alert">
          {stopped.message}
          {stopped.ref && <span className="platform-ref"> Reference {stopped.ref}</span>}
        </p>
      )}

      {lapsed.length > 0 && (
        <div className="platform-note platform-note-lapsed">
          <p className="platform-note-head">
            These attestations have run out, so they cover nothing
          </p>
          <ul>
            {lapsed.map((entry) => (
              <li key={entry.name}>{entry.because}.</li>
            ))}
          </ul>
          <p className="platform-note-tail">
            The controls they would have provided are still asked below.
          </p>
        </div>
      )}

      {mismatches.length > 0 && (
        <div className="platform-note platform-note-mismatch">
          <p className="platform-note-head">
            This activity holds more than those platforms are cleared for
          </p>
          <ul>
            {mismatches.map((entry) => (
              <li key={`${entry.platformName}-${entry.because}`}>{entry.because}.</li>
            ))}
          </ul>
          <p className="platform-note-tail">
            Nothing is blocked. A reviewer will want an answer for it, and it
            is better raised now than found later.
          </p>
        </div>
      )}

      {covered.length > 0 && (
        <div className="covered">
          <h3>
            Covered by what you chose
            <span className="covered-count">{covered.length}</span>
          </h3>
          <ul className="covered-list">
            {covered.map((control) => (
              <li key={control.objective}>
                <span className="covered-name">
                  {control.name}
                  <span className="covered-state">
                    {accepted.includes(control.objective)
                      ? "Recorded"
                      : "Offered"}
                  </span>
                </span>
                <span className="covered-source">
                  {control.platformName} · {control.owner} attested on{" "}
                  {control.attestedOn}
                </span>
              </li>
            ))}
          </ul>
          {unconfirmed > 0 ? (
            <>
              <button
                type="button"
                className="btn"
                onClick={confirm}
                disabled={busy !== null}
              >
                {busy === "confirming"
                  ? "Recording…"
                  : `Confirm ${unconfirmed} — this activity sits on those platforms`}
              </button>
              <p className="help">
                Until you confirm, each one is still asked as a question
                below. Confirming records it as in place, naming the platform,
                the person who attested and the date — you are confirming where
                this activity runs, not asserting a control you have not seen.
                Uncheck a platform and its controls come back as questions.
              </p>
            </>
          ) : (
            <p className="help">
              Recorded against this assessment, each naming who provides it and
              when they attested.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
