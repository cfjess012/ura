"use client";

import * as React from "react";
import { checkDescription } from "@/app/agent-actions";
import { isFailure } from "@/lib/errors";
import type { RubricVerdict } from "@/lib/intake-rubric";

/**
 * What the description is still missing (SPEC §22.1).
 *
 * **It never blocks.** Everything here is a suggestion beside the box, not
 * a gate in front of the Next button — a person who wants to write two
 * lines and move on can, and a reviewer picks it up. The mission is
 * reducing friction, and a quality assistant that stops somebody has become
 * the thing it was meant to prevent.
 *
 * It also never runs while they are typing. Somebody mid-sentence being
 * told their sentence is incomplete is the most annoying software there is.
 */
export function DescriptionHelp({ describe }: { describe: string }) {
  const [verdict, setVerdict] = React.useState<RubricVerdict | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [checkedText, setCheckedText] = React.useState("");
  /** Whether anything actually read it, as opposed to failing open. */
  const [checked, setChecked] = React.useState(false);

  const text = describe.trim();
  const worthChecking = text.length > 0 && text !== checkedText;

  async function check() {
    if (!worthChecking || checking) return;
    setChecking(true);
    try {
      const result = await checkDescription(text);
      setCheckedText(text);
      // A pass with no asks can mean "it reads well" or "nobody could
      // look" — those are different things, and only one of them is worth
      // telling somebody. With no agent it said "That covers what the
      // platform needs", which it had not checked.
      setVerdict(isFailure(result) ? null : result.verdict);
      setChecked(!isFailure(result) && result.verdict.checkedByModel);
    } catch (cause) {
      // Fails open, like everything else about this.
      console.error("checkDescription transport", cause);
      setVerdict(null);
    } finally {
      setChecking(false);
    }
  }

  if (verdict?.passes && !checked) {
    // Nothing read it. Say so plainly rather than congratulating them on a
    // description nobody looked at.
    return (
      <p className="rubric help" role="status">
        I couldn&rsquo;t check this one just now — carry on, and a reviewer
        picks up anything that is thin.
      </p>
    );
  }

  if (verdict?.passes) {
    return (
      <p className="rubric rubric-good" role="status">
        <span aria-hidden="true">✓</span> That covers what the platform needs to
        route this properly.
      </p>
    );
  }

  return (
    <div className="rubric">
      {verdict && verdict.asks.length > 0 && (
        <div className="rubric-asks" role="status">
          {verdict.opening && (
            <p className="rubric-opening">{verdict.opening}</p>
          )}
          <ul>
            {verdict.asks.map((ask) => (
              <li key={ask.id}>
                <span className="rubric-ask">{ask.sentence}</span>
                {ask.anchor && (
                  <span className="rubric-anchor">
                    Enough would be: {ask.anchor}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="help">
            Suggestions, not requirements — you can carry on without them and a
            reviewer will pick it up.
          </p>
        </div>
      )}
      <button
        type="button"
        className="link-button"
        onClick={() => void check()}
        disabled={checking || !worthChecking}
      >
        {checking
          ? "Reading it…"
          : verdict
            ? "Check it again"
            : "How does this read?"}
      </button>
    </div>
  );
}
