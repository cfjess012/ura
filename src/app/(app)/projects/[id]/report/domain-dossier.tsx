"use client";

/**
 * The handoff report as a dossier: one numbered document per risk area.
 *
 * A submitted assessment goes to several risk areas at once and each cares
 * about a different slice of it. Handing every reviewer the whole report
 * and asking them to find their own part is how the questionnaire sprawl
 * this product exists to replace began — so an area is a destination, not
 * a filter, and it is set out in the order a reviewer actually works:
 * what this is, what we asked, what it might mean, what we asked next,
 * what we recommend, and what is already signed.
 *
 * Everything here is passed in. The split comes from versioned data
 * (`control-domains.json`, ratified by a person — NFR-20), the scenarios
 * from the assistant, and this component decides nothing except which area
 * you are reading.
 *
 * The chosen area lives in the URL. A reviewer who sends "look at Security"
 * to a colleague should be able to send the link, and the reading survives
 * the assistant's paragraph arriving underneath it.
 */
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DomainSlice } from "@/lib/report-domains";

/**
 * Where the assistant's reading has got to. Section 3 must never be a blank
 * box: "still reading", "read it and proposed nothing" and "there is no
 * assistant" are three different statements, and only one of them is about
 * this assessment (§24.4, §24.8).
 */
export type ScenarioState = "ready" | "pending" | "unavailable";

export function DomainDossier({
  slices,
  scenarios = "ready",
}: {
  slices: DomainSlice[];
  scenarios?: ScenarioState;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const wanted = params.get("area");
  const current = slices.find((s) => s.key === wanted) ?? slices[0];

  if (!current) return null;

  const show = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("area", key);
    // Replace, not push: flicking between areas to read them is one visit,
    // and it should not take eleven Backs to leave the page.
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const onKey = (event: React.KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + slices.length) % slices.length;
    show(slices[next].key);
    tabs.current[next]?.focus();
  };

  const index = slices.findIndex((s) => s.key === current.key);
  const recommendations = current.findings;
  const attested = current.controls.filter((c) => c.attestation !== null);
  // Who signed this area's controls, and when they last did. Named rather
  // than counted: a reviewer reading somebody else's area wants the person
  // to go back to, and "4 attested" is not a person (NFR-9).
  const assessors = [
    ...new Set(attested.map((c) => c.attestation!.by).filter(Boolean)),
  ];
  const lastSigned = attested
    .map((c) => c.attestation!.at)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <section className="dossier">
      <div className="dossier-tablist" role="tablist" aria-label="Risk areas">
        {slices.map((slice, i) => (
          <button
            key={slice.key}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${slice.key}`}
            aria-selected={slice.key === current.key}
            aria-controls={`panel-${slice.key}`}
            tabIndex={slice.key === current.key ? 0 : -1}
            className={`dossier-tab${slice.key === current.key ? " on" : ""}`}
            onClick={() => show(slice.key)}
            onKeyDown={(event) => onKey(event, i)}
          >
            <span className="dossier-tab-name">{slice.name}</span>
            {/* What is waiting, worst first — and never colour alone
                (§11.1), so the word is there beside the count. */}
            {slice.breaches > 0 ? (
              <span className="dossier-tab-count breach">
                {slice.breaches} breach{slice.breaches === 1 ? "" : "es"}
              </span>
            ) : slice.findings.length > 0 ? (
              <span className="dossier-tab-count finding">
                {slice.findings.length} finding
                {slice.findings.length === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="dossier-tab-count clear">clear</span>
            )}
          </button>
        ))}
      </div>

      <article
        role="tabpanel"
        id={`panel-${current.key}`}
        aria-labelledby={`tab-${current.key}`}
        className="dossier-sheet"
      >
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">Risk area</p>
            <h2 className="dossier-title">{current.name}</h2>
            <p className="dossier-standfirst">{current.because}</p>
          </div>
          <p className="dossier-count" aria-hidden="true">
            <span className="dossier-count-n">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="dossier-count-of">
              of {String(slices.length).padStart(2, "0")}
            </span>
          </p>
        </header>

        <Part n={1} title="Risk identification summary">
          <dl className="dossier-facts">
            <div>
              <dt>Standing</dt>
              <dd>{current.because}</dd>
            </div>
            <div>
              <dt>Controls this area owns</dt>
              <dd>
                {current.controls.length} required · {attested.length} attested
              </dd>
            </div>
            <div>
              <dt>Assessed by</dt>
              <dd>
                {assessors.length > 0 ? (
                  <>
                    {assessors.join(", ")}
                    {lastSigned && (
                      <span className="dossier-muted"> · {lastSigned}</span>
                    )}
                  </>
                ) : (
                  <span className="dossier-muted">
                    Nobody has signed in this area yet
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Open findings</dt>
              <dd>
                {current.findings.length === 0
                  ? "None raised"
                  : `${current.findings.length} raised, ${current.breaches} citing a clause`}
              </dd>
            </div>
          </dl>
        </Part>

        <Part n={2} title="Scoping question asked">
          {current.question ? (
            <table className="dossier-table">
              <thead>
                <tr>
                  <th scope="col">Scoping question</th>
                  <th scope="col">Answer</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{current.question}</td>
                  <td className="dossier-cell-tight">{current.answer}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>
              This area was not gated by a question of its own. It is here
              because it owns controls this activity requires.
            </Empty>
          )}
        </Part>

        <Part n={3} title="Risk scenarios">
          {scenarios === "pending" ? (
            <p className="dossier-pending" aria-live="polite">
              The assistant is reading the record. Everything else on this
              page is already complete and does not depend on it.
            </p>
          ) : scenarios === "unavailable" ? (
            <Empty>
              The assistant is not available, so nothing has been proposed
              here. Nothing else on this page depends on it — every other
              section is derived from the record.
            </Empty>
          ) : current.scenarios.length === 0 ? (
            <Empty>
              The assistant proposed nothing here. Scenarios are questions
              read from answers already given — none of this area&rsquo;s
              answers raised one.
            </Empty>
          ) : (
            <>
              <p className="dossier-note">
                Proposed by the assistant from the answers named beneath each
                one. These are questions, not findings — nothing here has been
                decided, and none of it is signed.
              </p>
              {current.scenarios.map((scenario, i) => (
                <div key={i} className="dossier-scenario">
                  <p className="dossier-scenario-what">{scenario.scenario}</p>
                  <p className="dossier-scenario-ask">{scenario.ask}</p>
                  <p className="dossier-muted">
                    Read from: {scenario.from.join(", ")}
                  </p>
                </div>
              ))}
            </>
          )}
        </Part>

        <Part n={4} title="Follow-up scoping questions">
          {current.severities.length === 0 ? (
            <Empty>
              Nothing further was asked in this area — the scoping answer
              settled it.
            </Empty>
          ) : (
            <table className="dossier-table">
              <thead>
                <tr>
                  <th scope="col">Follow-up question (conditional)</th>
                  <th scope="col">Response</th>
                </tr>
              </thead>
              <tbody>
                {current.severities.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="dossier-cell-tight">
                      <span className={`band-tag band-${s.band.toLowerCase()}`}>
                        {s.band}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Part>

        <Part n={5} title="Control recommendations">
          {recommendations.length === 0 ? (
            <Empty>
              Nothing is recommended here. Every control this area owns was
              answered in a way that raised no finding.
            </Empty>
          ) : (
            <table className="dossier-table">
              <thead>
                <tr>
                  <th scope="col">Recommended control</th>
                  <th scope="col">Basis</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Target owner</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((finding, i) => (
                  <tr key={finding.id || i}>
                    <td>
                      <strong>{finding.objectiveName}</strong>
                      {finding.note && (
                        <p className="dossier-muted">{finding.note}</p>
                      )}
                      {finding.clauseText && (
                        <p className="dossier-clause">
                          &ldquo;{finding.clauseText}&rdquo;
                        </p>
                      )}
                    </td>
                    <td className="dossier-cell-tight">
                      {/* What kind of thing this is, in words. It read as a
                          priority chip alone for a while, which told a
                          reader how urgent it was and never what it was —
                          "High" is not a synonym for "breaches policy". */}
                      {KIND_LABEL[finding.kind]}
                      {finding.clause && (
                        <p className="dossier-muted">
                          {finding.clause}
                          {finding.policyVersion
                            ? ` v${finding.policyVersion}`
                            : ""}
                        </p>
                      )}
                    </td>
                    <td className="dossier-cell-tight">
                      <span className={`chip chip-${kindChip(finding.kind)}`}>
                        {PRIORITY[finding.kind]}
                      </span>
                    </td>
                    <td className="dossier-cell-tight">
                      {/* Never invented. A finding nobody has settled has
                          no owner, and writing one in would put a name
                          against work nobody agreed to do. */}
                      {finding.settlement?.open ? (
                        // A settlement that has lapsed is not a settlement.
                        // Showing "risk accepted" here would tell a reader
                        // somebody has this in hand when nobody does.
                        <span className="chip chip-gap">
                          Acceptance lapsed
                        </span>
                      ) : finding.settlement?.owner ? (
                        <>
                          {finding.settlement.owner}
                          {finding.settlement.due && (
                            <span className="dossier-muted">
                              {" "}
                              by {finding.settlement.due}
                            </span>
                          )}
                        </>
                      ) : finding.settlement ? (
                        <span className="dossier-muted">
                          {SETTLEMENT_LABEL[finding.settlement.kind] ??
                            finding.settlement.kind}
                        </span>
                      ) : (
                        <span className="dossier-muted">Not yet settled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Part>

        <Part n={6} title="Controls attested already">
          {current.controls.length === 0 ? (
            <Empty>No control answers sit with this area.</Empty>
          ) : (
            <table className="dossier-table">
              <thead>
                <tr>
                  <th scope="col">Control</th>
                  <th scope="col">Answer</th>
                  <th scope="col">Attested by</th>
                  <th scope="col">Status</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {current.controls.map((control) => (
                  <tr key={control.objective}>
                    <td>
                      <strong>{control.name}</strong>
                      {control.note && (
                        <p className="dossier-muted">{control.note}</p>
                      )}
                    </td>
                    <td className="dossier-cell-tight">{control.answer}</td>
                    <td className="dossier-cell-tight">
                      {control.attestation?.by ?? (
                        <span className="dossier-muted">—</span>
                      )}
                    </td>
                    <td className="dossier-cell-tight">
                      {/* An unsigned answer says so. This is the whole
                          point of the column: "answered" and "checked by
                          a named person" are different claims. */}
                      {control.attestation ? (
                        <span className="chip chip-signed">
                          {ACT_LABEL[control.attestation.act] ??
                            control.attestation.act}
                        </span>
                      ) : (
                        <span className="chip chip-unsigned">Not attested</span>
                      )}
                    </td>
                    <td className="dossier-cell-tight">
                      {control.attestation?.at ?? (
                        <span className="dossier-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Part>
      </article>
    </section>
  );
}

/** A numbered part of the dossier — the number is decoration, so it is
 *  hidden from the reading order and the heading carries the name. */
function Part({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dossier-part">
      <h3 className="dossier-part-head">
        <span className="dossier-part-n" aria-hidden="true">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Says what is not there and why. An empty box reads as broken. */
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="dossier-empty">{children}</p>;
}

/** The words the rest of the product uses — the review rail says
 *  "Breaches policy", so the report does not invent a second name. */
const KIND_LABEL: Record<string, string> = {
  "non-compliance": "Breaches policy",
  gap: "Control gap",
  enhancement: "Enhancement",
};

const PRIORITY: Record<string, string> = {
  "non-compliance": "High",
  gap: "Medium",
  enhancement: "Low",
};

const ACT_LABEL: Record<string, string> = {
  approve: "Approved",
  correct: "Corrected",
  "answer-corrected": "Corrected",
  "not-applicable": "Not applicable",
};

const SETTLEMENT_LABEL: Record<string, string> = {
  "risk-accepted": "Risk accepted",
  "answer-corrected": "Answer corrected",
  "not-applicable": "Not applicable",
  remediation: "Remediation",
};

function kindChip(kind: string): string {
  return kind === "non-compliance"
    ? "violation"
    : kind === "gap"
      ? "gap"
      : "enhancement";
}
