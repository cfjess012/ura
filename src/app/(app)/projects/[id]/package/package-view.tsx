"use client";

/**
 * The package, and the one act that records it.
 *
 * A client component only because the download is a client act: the payload
 * is already on the page, so turning it into a file is a Blob and an anchor
 * rather than a round trip. Nothing here computes what is in the package —
 * that is assembled on the server, where the gate is enforced.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { makePackage } from "@/app/package-actions";
import { packageFilename, type Package } from "@/lib/packaging";
import { isFailure } from "@/lib/errors";
import { errorRef } from "@/lib/errors";

export function PackageView({
  projectId,
  payload,
  history,
}: {
  projectId: string;
  payload: Package;
  history: Array<{
    id: string;
    packagedBy: string;
    packagedAt: string;
    answerCount: number;
  }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{
    message: string;
    ref?: string;
  } | null>(null);
  const [made, setMade] = React.useState<string | null>(null);

  const text = React.useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  /**
   * The file, built here from what is already on screen — so what somebody
   * downloads is byte-for-byte what they were shown, rather than a second
   * assembly that could differ from the first.
   */
  function download() {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = packageFilename(payload.assessment.name, new Date());
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next turn, not synchronously. Releasing the URL in the
    // same tick as the click can cancel the download before the browser has
    // started reading it — the file simply never arrives, with no error
    // anywhere to say why.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function record() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await makePackage(projectId);
      if (isFailure(outcome)) {
        // The reference is the whole point of having one: it is logged
        // server-side, and a person who cannot quote it starts a support
        // conversation by re-enacting the failure (§25.2).
        setError({ message: outcome.message, ref: outcome.ref });
        // A refusal means the record moved underneath this page. Pull the
        // new one, so the screen stops saying "Ready to package" while the
        // server is refusing to.
        router.refresh();
        return;
      }
      setMade(outcome.packagedAt);
      router.refresh();
    } catch (cause) {
      console.error("makePackage transport", cause);
      setError({
        message: "The server couldn't be reached, so nothing was recorded.",
        ref: errorRef(),
      });
    } finally {
      setBusy(false);
    }
  }

  const byKind = payload.findings.reduce<Record<string, number>>((all, f) => {
    all[f.settlement.kind] = (all[f.settlement.kind] ?? 0) + 1;
    return all;
  }, {});

  return (
    <>
      <section className="card">
        <h2>What this package contains</h2>
        <ul className="summary-list">
          <li>
            <strong>{payload.answers.length} attested control answers</strong>
            <span className="meta">
              {" "}
              — each with the reviewer who signed it, when, and what they wrote
            </span>
          </li>
          <li>
            <strong>{payload.coverage.length} risk areas</strong>
            <span className="meta">
              {" "}
              — what was asked and why, including the areas that were closed. A
              list of answers alone cannot tell a reader what was never asked,
              and &ldquo;we did not ask&rdquo; is not the same as &ldquo;they
              said no&rdquo;
            </span>
          </li>
          <li>
            <strong>
              {payload.findings.length} finding
              {payload.findings.length === 1 ? "" : "s"}, each with how it was
              settled
            </strong>
            {Object.keys(byKind).length > 0 && (
              <span className="meta">
                {" "}
                —{" "}
                {Object.entries(byKind)
                  .map(([k, n]) => `${n} ${readable(k)}`)
                  .join(", ")}
              </span>
            )}
          </li>
          <li>
            <strong>Provenance</strong>
            <span className="meta">
              {" "}
              — the instrument versions that asked these questions
              {payload.provenance.policyVersion
                ? `, and the policy edition that judged the findings (${payload.provenance.policyVersion})`
                : ""}
              . A replay against a different version is a different question, so
              a reader has to be able to tell
            </span>
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Take it</h2>
        <p className="help">
          The file is the record above, exactly as it is shown. Downloading it
          changes nothing; recording it writes a package to the register, which
          is what makes it replayable.
        </p>
        <div className="queue-actions">
          <button type="button" className="btn" onClick={download}>
            Download the payload
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void record()}
          >
            {busy ? "Recording…" : "Record this package"}
          </button>
        </div>
        <p className="help" role="status" aria-live="polite">
          {error ? (
            <span className="save-failed">
              {error.message}
              {error.ref ? (
                <span className="meta"> Reference {error.ref}</span>
              ) : null}
            </span>
          ) : made ? (
            `Recorded ${new Date(made).toLocaleString()}. A later export adds another; this one stands.`
          ) : (
            ""
          )}
        </p>
      </section>

      {/* §27.4 and §24.8: the write is not built, and nothing mimics one. */}
      <section className="card card-upcoming">
        <h2>Sending it onward</h2>
        <p>
          The payload is real and it is yours to take.{" "}
          <strong>Sending it into a downstream system is not connected</strong>{" "}
          — there is no integration behind this screen, and nothing here will
          pretend a send succeeded. A connector goes behind the same interface
          as everything else external, and it does not change what is above.
        </p>
      </section>

      {history.length > 0 && (
        <section className="card">
          <h2>Already packaged</h2>
          <p className="help">
            Insert-only, like everything else that records a claim: a re-export
            adds a record rather than replacing one, because each is a claim
            about a different moment.
          </p>
          <ul className="summary-list">
            {history.map((p) => (
              <li key={p.id}>
                <strong>{new Date(p.packagedAt).toLocaleString()}</strong>
                <span className="meta">
                  {" "}
                  — by {p.packagedBy}, {p.answerCount} attested answers
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="ledger">
        <summary>
          <span className="ledger-summary-title">The payload itself</span>
          <span className="ledger-summary-line">
            {text.length.toLocaleString()} characters of JSON — the same bytes
            the download gives you
          </span>
        </summary>
        <pre className="payload">{text}</pre>
      </details>
    </>
  );
}

function readable(kind: string): string {
  return (
    {
      remediation: "with remediation",
      "risk-accepted": "risk accepted",
      "answer-corrected": "answer corrected",
      "not-applicable": "not applicable",
    }[kind] ?? kind
  );
}
