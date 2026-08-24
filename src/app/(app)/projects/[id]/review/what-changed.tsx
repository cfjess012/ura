/**
 * What a correction actually changed (§4.2).
 *
 * An attested answer is corrected by attesting again and the record keeps
 * both — but "both are on record" is not the same as a person being able to
 * see the difference.
 *
 * **Two panes, not one stream.** The prior platform rendered this side by
 * side and it was right: interleaving removals and additions inline reads
 * as one jumbled sentence the moment a correction is a rewrite rather than
 * a word swap — "Yes — Enforced for every session, including Recertification
 * runs quarterly via the vendor's" is two answers shuffled together. Each
 * pane reads as a sentence somebody actually wrote.
 *
 * Never colour alone: removals are struck through, additions underlined, so
 * the two read apart in greyscale (§23, NFR-10).
 */
import { diffWords, isUnchanged } from "@/lib/diff";

export function WhatChanged({
  before,
  after,
}: {
  before: string;
  after: string;
}) {
  const ops = diffWords(before, after);
  if (isUnchanged(ops)) return null;
  return (
    <div className="changed">
      <p className="changed-title">What changed</p>
      <div className="changed-panes">
        <div>
          <p className="changed-label">What was answered</p>
          <p className="changed-body">
            {ops
              .filter((op) => op.type !== "added")
              .map((op, i) => (
                <span
                  key={`b-${i}-${op.text}`}
                  className={
                    op.type === "removed" ? "changed-removed" : undefined
                  }
                >
                  {op.text}{" "}
                </span>
              ))}
          </p>
        </div>
        <div>
          <p className="changed-label">What it was corrected to</p>
          <p className="changed-body">
            {ops
              .filter((op) => op.type !== "removed")
              .map((op, i) => (
                <span
                  key={`a-${i}-${op.text}`}
                  className={op.type === "added" ? "changed-added" : undefined}
                >
                  {op.text}{" "}
                </span>
              ))}
          </p>
        </div>
      </div>
      <p className="help">
        Both versions stay on the record; nothing was erased.
      </p>
    </div>
  );
}
