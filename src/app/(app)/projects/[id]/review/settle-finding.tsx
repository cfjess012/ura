"use client";

import * as React from "react";
import { disposeFinding } from "@/app/review-actions";
import {
  DISPOSITION_KINDS,
  DISPOSITION_LABEL,
  DISPOSITION_MEANING,
  type DispositionKind,
} from "@/lib/disposition";
import { errorRef, isFailure } from "@/lib/errors";
import { useRouter } from "next/navigation";

export type Acceptor = { id: string; name: string; title: string };

/**
 * Settling one finding, one of exactly four ways (§4.3, FR-18).
 *
 * The four are shown together with what each one commits to, because the
 * difference between "somebody is fixing it" and "we are living with it"
 * is the whole point of having four rather than a Close button. Nothing
 * here is dismissable: an obligation derived from state cannot be waved
 * away, only settled and said how (§6.4).
 */
export function SettleFinding({
  projectId,
  findingId,
  acceptors,
  directory,
}: {
  projectId: string;
  findingId: string;
  acceptors: Acceptor[];
  /** Everyone who could own a fix. FR-29: a person is chosen, not typed. */
  directory: Acceptor[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<DispositionKind>("remediation");
  const [note, setNote] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [due, setDue] = React.useState("");
  const [acceptedBy, setAcceptedBy] = React.useState("");
  const [expires, setExpires] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{
    message: string;
    ref?: string;
  } | null>(null);

  async function settle() {
    setBusy(true);
    setError(null);
    try {
      await record();
    } catch (cause) {
      // Without this the button sat on "Recording…" for ever and said
      // nothing — a dead control is worse than a refusal.
      console.error("disposeFinding transport", cause);
      setError({
        message:
          "The server couldn't be reached, so nothing was recorded. The finding is still open and what you wrote is still here.",
        ref: errorRef(),
      });
    } finally {
      setBusy(false);
    }
  }

  async function record() {
    const result = await disposeFinding(projectId, {
      findingId,
      kind,
      note,
      remediationOwner: kind === "remediation" ? owner : null,
      remediationDue: kind === "remediation" ? due : null,
      acceptedBy: kind === "risk-accepted" ? acceptedBy : null,
      expiresAt: kind === "risk-accepted" ? expires : null,
    });
    if (isFailure(result)) {
      // The finding stays open on screen because it stayed open in the
      // record — a refused write must never paint its consequence.
      // The server's own reference, not a fresh one — a number the person
      // quotes has to match the number in the log.
      setError({ message: result.message, ref: result.ref });
      return;
    }
    setOpen(false);
    setNote("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="link-button"
        onClick={() => setOpen(true)}
      >
        Settle this finding →
      </button>
    );
  }

  return (
    <div className="settle">
      <p className="settle-title">How is this being settled?</p>
      <div
        className="settle-kinds"
        role="radiogroup"
        aria-label="How is this being settled?"
      >
        {DISPOSITION_KINDS.map((option) => (
          <button
            type="button"
            key={option}
            role="radio"
            aria-checked={kind === option}
            className={`settle-kind${kind === option ? " chosen" : ""}`}
            onClick={() => setKind(option)}
          >
            <span className="settle-kind-label">
              {DISPOSITION_LABEL[option]}
            </span>
            <span className="settle-kind-meaning">
              {DISPOSITION_MEANING[option]}
            </span>
          </button>
        ))}
      </div>

      {kind === "remediation" && (
        <div className="settle-fields">
          <div className="q3-note">
            <label htmlFor={`owner-${findingId}`}>Who owns fixing it?</label>
            <select
              id={`owner-${findingId}`}
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            >
              <option value="">Choose a person</option>
              {directory.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} — {person.title}
                </option>
              ))}
            </select>
            <p className="help">
              A person, not a team. A fix owned by everybody is owned by nobody.
            </p>
          </div>
          <div className="q3-note">
            <label htmlFor={`due-${findingId}`}>By when?</label>
            <input
              id={`due-${findingId}`}
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
          </div>
        </div>
      )}

      {kind === "risk-accepted" && (
        <div className="settle-fields">
          <div className="q3-note">
            <label htmlFor={`accepted-${findingId}`}>
              Who is accepting it?
            </label>
            <select
              id={`accepted-${findingId}`}
              value={acceptedBy}
              onChange={(event) => setAcceptedBy(event.target.value)}
            >
              <option value="">Choose a second person</option>
              {acceptors.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} — {person.title}
                </option>
              ))}
            </select>
            <p className="help">
              It cannot be you. Accepting a risk takes a second, named person,
              and the database refuses it otherwise.
            </p>
          </div>
          <div className="q3-note">
            <label htmlFor={`expires-${findingId}`}>Accepted until</label>
            <input
              id={`expires-${findingId}`}
              type="date"
              value={expires}
              onChange={(event) => setExpires(event.target.value)}
            />
            <p className="help">
              When this date passes the finding reopens on its own. That is what
              makes an acceptance temporary rather than a way of closing things.
            </p>
          </div>
        </div>
      )}

      {kind !== "answer-corrected" && (
        <div className="q3-note">
          <label htmlFor={`note-${findingId}`}>Why?</label>
          <p className="help">
            Whoever reads this later won&rsquo;t have you to ask.
          </p>
          <textarea
            id={`note-${findingId}`}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder=""
          />
        </div>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error.message}
          {error.ref ? <span className="meta"> ({error.ref})</span> : null}
        </p>
      )}

      <div className="settle-actions">
        <button type="button" disabled={busy} onClick={settle}>
          {busy ? "Recording…" : "Record it"}
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => setOpen(false)}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
