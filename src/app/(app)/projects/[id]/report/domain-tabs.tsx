"use client";

/**
 * The handoff summary, one tab per risk domain.
 *
 * A tab is a destination, not a filter: each one is the slice of this
 * assessment that a particular risk domain is being handed, in the same
 * format the whole report uses. The reviewer for Security opens Security
 * and sees their controls, their findings, and the scenarios read from
 * them — rather than scrolling a report written for eight domains at once.
 *
 * Everything here is passed in. The split comes from versioned data
 * (`control-domains.json`), the scenarios from the assistant, and this
 * component decides nothing except which one you are looking at.
 */
import * as React from "react";
import type { DomainSlice } from "@/lib/report-domains";

export function DomainTabs({ slices }: { slices: DomainSlice[] }) {
  const [active, setActive] = React.useState(slices[0]?.key ?? "");
  const current = slices.find((s) => s.key === active) ?? slices[0];
  const tabs = React.useRef<Array<HTMLButtonElement | null>>([]);

  if (!current) return null;

  // Arrow keys move between tabs, which is what a tab list is expected to
  // do and what a row of buttons does not do on its own.
  const onKey = (event: React.KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + slices.length) % slices.length;
    setActive(slices[next].key);
    tabs.current[next]?.focus();
  };

  return (
    <section className="report-card report-domains">
      <h2>By risk domain</h2>
      <p className="report-muted">
        Each domain is handed the part of this assessment it owns. Which domain
        owns which control is versioned data a person ratified — never a
        judgement made here.
      </p>

      <div className="domain-tablist" role="tablist" aria-label="Risk domains">
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
            className={`domain-tab${slice.key === current.key ? " on" : ""}`}
            onClick={() => setActive(slice.key)}
            onKeyDown={(event) => onKey(event, i)}
          >
            {slice.name}
            {/* The count says what is waiting, and the worst thing first —
                never colour alone (§11.1), so the word is there too. */}
            {slice.breaches > 0 ? (
              <span className="domain-tab-count breach">
                {slice.breaches} breach{slice.breaches === 1 ? "" : "es"}
              </span>
            ) : slice.findings.length > 0 ? (
              <span className="domain-tab-count finding">
                {slice.findings.length} finding
                {slice.findings.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${current.key}`}
        aria-labelledby={`tab-${current.key}`}
        className="domain-panel"
      >
        <p className="domain-why">
          <strong>{current.name}</strong> — {current.because}
        </p>

        {current.scenarios.length > 0 && (
          <div className="domain-block">
            <p className="card-part">Worth asking about</p>
            <p className="report-muted">
              Proposed by the assistant from the answers named beneath each one.
              These are questions, not findings — nothing here has been decided.
            </p>
            {current.scenarios.map((scenario, i) => (
              <div key={i} className="report-scenario">
                <p className="report-scenario-what">{scenario.scenario}</p>
                <p className="report-scenario-ask">{scenario.ask}</p>
                <p className="report-muted">
                  Read from: {scenario.from.join(", ")}
                </p>
              </div>
            ))}
          </div>
        )}

        {current.findings.length > 0 && (
          <div className="domain-block">
            <p className="card-part">Findings</p>
            <ul className="domain-list">
              {current.findings.map((finding, i) => (
                <li key={i}>
                  <strong>{finding.objectiveName}</strong>
                  <span className={`chip chip-${kindChip(finding.kind)}`}>
                    {KIND_LABEL[finding.kind]}
                  </span>
                  {finding.note && (
                    <p className="domain-note">{finding.note}</p>
                  )}
                  {finding.clauseText && (
                    <p className="domain-clause">
                      &ldquo;{finding.clauseText}&rdquo;
                      <span className="report-muted">
                        {" "}
                        — {finding.clause}
                        {finding.policyVersion
                          ? `, version ${finding.policyVersion}`
                          : ""}
                      </span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {current.severities.length > 0 && (
          <div className="domain-block">
            <p className="card-part">Severity</p>
            <ul className="report-sev">
              {current.severities.map((s) => (
                <li key={s.name}>
                  <span>{s.name}</span>
                  <span className={`band-tag band-${s.band.toLowerCase()}`}>
                    {s.band}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {current.controls.length > 0 ? (
          <div className="domain-block">
            <p className="card-part">Controls this domain owns</p>
            <ul className="domain-list">
              {current.controls.map((control) => (
                <li key={control.objective}>
                  <strong>{control.name}</strong>
                  <span className="report-muted"> — {control.answer}</span>
                  {control.note && (
                    <p className="domain-note">{control.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="report-muted">
            No control answers sit with this domain yet.
          </p>
        )}
      </div>
    </section>
  );
}

const KIND_LABEL: Record<string, string> = {
  "non-compliance": "Policy violation",
  gap: "Control gap",
  enhancement: "Enhancement",
};

function kindChip(kind: string): string {
  return kind === "non-compliance"
    ? "violation"
    : kind === "gap"
      ? "gap"
      : "enhancement";
}
