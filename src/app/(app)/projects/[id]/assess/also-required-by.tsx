import type { Obligation } from "@/lib/crosswalk";

/**
 * The external obligations a control helps satisfy (FR-52).
 *
 * `WhyAsked` answers "why am I being asked this" with the organisation's own
 * policy. This answers the question after it: "and what does that buy us
 * outside" — the frameworks and regulations a compliance team is measured
 * against.
 *
 * Three rules of the house apply here, and all three are visible:
 *
 * - **The reference is real or it is not shown.** Every line comes from a
 *   framework transcribed from its publisher, and the crosswalk refuses a
 *   mapping that does not resolve at both ends. Nothing here was recalled.
 * - **The quote is verbatim, or it is a labelled extract.** A regulation's
 *   article can run to thousands of words; showing the opening and saying so
 *   is honest, while paraphrasing a law would not be.
 * - **The claim says how big it is.** Equivalent, partial and supporting are
 *   different assertions, in words rather than a tick, because a compliance
 *   team reading a tick will believe the requirement is closed.
 */

/** The strength of the claim, as a person reads it. */
const CLAIM: Record<Obligation["relationship"], string> = {
  equivalent: "meets this in full",
  partial: "meets part of this",
  supports: "helps meet this",
};

/** Long enough to be the whole requirement; longer than this is an extract. */
const WHOLE = 600;

/** The opening of a long passage, cut at a sentence rather than mid-word. */
function opening(text: string): string {
  const cut = text.slice(0, WHOLE);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return (stop > 200 ? cut.slice(0, stop + 1) : cut).trim();
}

export function AlsoRequiredBy({ obligations }: { obligations: Obligation[] }) {
  if (obligations.length === 0) return null;
  const first = obligations[0]!;
  const others = obligations.length - 1;
  return (
    <details className="obligations">
      <summary>
        <span className="obligations-tag">Also required by</span>
        <span className="obligations-cite">
          {first.frameworkName} · {first.ref}
          {others > 0 ? ` and ${others} other${others === 1 ? "" : "s"}` : ""}
        </span>
      </summary>
      <ul className="obligations-list">
        {obligations.map((o) => (
          <li key={`${o.framework}-${o.ref}`}>
            <p className="obligations-head">
              <strong>
                {o.frameworkName} {o.edition}
              </strong>{" "}
              · {o.ref} — {o.heading}
            </p>
            <p className="obligations-claim">
              This control <strong>{CLAIM[o.relationship]}</strong>, because{" "}
              {o.because}.
            </p>
            {o.quote === null ? (
              <p className="help">
                The wording is not reproduced here: this framework is licensed,
                so the product shows the reference and the heading only.
              </p>
            ) : o.quote.length <= WHOLE ? (
              <blockquote className="obligations-quote">“{o.quote}”</blockquote>
            ) : (
              <>
                <blockquote className="obligations-quote">
                  “{opening(o.quote)} …”
                </blockquote>
                <p className="help">
                  The opening of the requirement, in its own words. It runs
                  longer than shown.
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="help">
        Transcribed from each publisher&rsquo;s own text, with the edition it
        came from. Answering here does not file anything with anyone; it records
        what a reviewer and an auditor will read.
      </p>
    </details>
  );
}
