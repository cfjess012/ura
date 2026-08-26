import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { agentTransport } from "@/lib/agent";
import { intakeValuesFrom } from "@/lib/intake-values";
import { gateStates } from "@/lib/instrument";
import { openProject } from "@/lib/project-access";
import { peopleStore, submissionStore } from "@/lib/repo";
import { answerStore } from "@/lib/repo-answers";
import { reviewStore } from "@/lib/repo-review";
import { accumulatedFor, asksNothingFurther, SEVERITY } from "@/lib/severity";
import { findingIsOpen } from "@/lib/submission";
import { reportFrom, standingLine } from "@/lib/report";
import { domainForObjective } from "@/lib/attestation";
import { domainSlices, severityAreaOf } from "@/lib/report-domains";
import { isTier3Value, objectivesFor, type Tier3Value } from "@/lib/tier3";
import { NotYourAssessment } from "../not-yours";
import { DomainDossier } from "./domain-dossier";
import { ReportSummary, SummaryPending } from "./summary";

export const dynamic = "force-dynamic";

/**
 * The handoff report — what a Risk Assessor is handed when an assessment
 * reaches them, and the one screen in this product built to be read by
 * somebody who was not involved (SPEC §4.4, §4.5).
 *
 * Everything on it is derived from the record. The agent may add two
 * things — a short summary and scenarios worth asking about — and the page
 * is complete without either, which is what makes it safe to show.
 */
export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;
  if (!project) notFound();

  const [stored, findings, everyone, attested, disposed] = await Promise.all([
    answerStore().current(id),
    submissionStore().findingsFor(id),
    peopleStore().list(),
    reviewStore().attestationsFor(id),
    reviewStore().dispositionsFor(id),
  ]);

  const intake = intakeValuesFrom(
    project as unknown as Record<string, unknown>,
  );
  const states = gateStates(stored, intake);
  const accumulated = accumulatedFor(stored, intake);
  const required = objectivesFor(accumulated.map((c) => c.objective));

  const values: Record<string, Tier3Value> = {};
  for (const [questionId, answer] of Object.entries(stored)) {
    if (questionId.startsWith("t3.") && isTier3Value(answer.value)) {
      values[questionId] = answer.value;
    }
  }

  const severityBands: Array<{ name: string; band: string }> = [];
  for (const question of SEVERITY.questions ?? []) {
    const held = stored[question.questionId];
    // A proposal is not a severity a person set.
    if (held && held.source === "drafted" && !held.confirmed) continue;
    const answer = held?.value;
    if (typeof answer === "string")
      severityBands.push({ name: question.name, band: answer });
  }

  const named = (personId: string | null) =>
    personId
      ? (everyone.find((someone) => someone.id === personId)?.name ?? personId)
      : "";

  // The most recent signature per question is the one that stands, and the
  // most recent settlement per finding — both tables are insert-only and
  // arrive newest-first, so the first one seen wins (§4.2, §5.1).
  const signatures = new Map<string, { by: string; act: string; at: string }>();
  for (const row of attested) {
    if (signatures.has(row.questionId)) continue;
    signatures.set(row.questionId, {
      by: named(row.attestedBy),
      act: row.act,
      at: row.attestedAt.toLocaleDateString(),
    });
  }
  const settlements = new Map<
    string,
    {
      kind: string;
      by: string;
      owner: string | null;
      due: string | null;
      open: boolean;
    }
  >();
  const now = new Date();
  for (const row of disposed) {
    if (settlements.has(row.findingId)) continue;
    settlements.set(row.findingId, {
      kind: row.kind,
      by: named(row.resolvedBy),
      owner: row.remediationOwner ? named(row.remediationOwner) : null,
      due: row.remediationDue ? row.remediationDue.toLocaleDateString() : null,
      // The one rule for "open" (§4.3). A settled row is not a settled
      // finding: an acceptance past its expiry reopens, and a report that
      // read the row alone would say "risk accepted" about a live gap.
      open: findingIsOpen(row, now),
    });
  }

  const report = reportFrom({
    activity:
      typeof intake.projectDescription === "string"
        ? intake.projectDescription
        : project.projectName,
    // The purpose is part of the description now. Older assessments answered
    // a separate box, so read that when it holds something the merged field
    // does not — a record written under the old instrument is still a record.
    purpose:
      typeof intake.businessPurpose === "string" &&
      intake.businessPurpose.trim() !== "" &&
      intake.businessPurpose !== intake.projectDescription
        ? intake.businessPurpose
        : "",
    states,
    severityBands,
    required,
    values,
    findings,
    asksNothingFurther,
    attestations: signatures,
    settlements,
  });

  // The dossier is built from the record, so it is complete before the
  // assistant has said anything. It used to be rendered inside the summary,
  // which returns null when the agent is unavailable — so the whole
  // per-area reading vanished whenever the model was down, on a page whose
  // own promise is that it is complete without one.
  const slices = domainSlices(report, [], severityAreaOf);

  // Anything the per-area dossiers cannot hold, so nothing falls between
  // them. A report that quietly drops a finding is worse than one that
  // files it awkwardly.
  const filedAreas = new Set(slices.map((slice) => slice.key));
  const assessmentWide = report.severities.filter(
    (severity) => !filedAreas.has(severityAreaOf(severity.name) ?? ""),
  );
  const unfiledFindings = report.findings.filter(
    (finding) => !filedAreas.has(domainForObjective(finding.objective) ?? ""),
  );

  const transport = agentTransport();
  const record = asPlainText(report, intake);

  const nameOf = (personId: string | null) =>
    everyone.find((someone) => someone.id === personId)?.name ?? "—";

  return (
    <main className="report">
      <header className="report-head">
        <div>
          <p className="report-eyebrow">Risk assessment · handoff summary</p>
          <h1>{project.projectName}</h1>
          <p className="report-standing">{standingLine(report)}</p>
        </div>
        <dl className="report-facts">
          <div>
            <dt>Submitted by</dt>
            <dd>{nameOf(project.submittedBy)}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>
              {project.submittedAt
                ? project.submittedAt.toLocaleDateString()
                : "Not yet"}
            </dd>
          </div>
          <div>
            <dt>Classification</dt>
            <dd>{String(intake.dataClassification ?? "—")}</dd>
          </div>
        </dl>
      </header>

      <section className="report-card">
        <h2>What this is</h2>
        <p>{report.activity}</p>
        {report.purpose && <p className="report-muted">{report.purpose}</p>}
      </section>

      <section className="report-card">
        <h2>Where it lands</h2>
        <p className="report-muted">
          Every risk area the instrument covers, including the ones ruled
          out. An area that was never in scope is worth seeing: it is the
          difference between &ldquo;we asked and it does not apply&rdquo; and
          &ldquo;nobody asked&rdquo;.
        </p>
        <ul className="report-areas">
          {report.areasThatApply.map((area) => (
            <li
              key={area.name}
              className={`report-area report-${area.standing}`}
            >
              <span className="report-area-name">{area.name}</span>
              <span className="report-area-standing">
                {area.standing === "applies"
                  ? "Applies"
                  : area.standing === "recorded"
                    ? "Recorded for a reviewer"
                    : "Not applicable"}
              </span>
              <span className="report-area-why">{area.because}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Streamed: the dossier below is derived from the record and is
          already complete, so nobody waits on a model to read what a
          person actually answered. */}
      {transport.available ? (
        <Suspense fallback={<SummaryPending slices={slices} />}>
          <ReportSummary
            projectId={id}
            report={report}
            record={record}
            slices={slices}
          />
        </Suspense>
      ) : (
        <DomainDossier slices={slices} scenarios="unavailable" />
      )}

      {report.unanswered.length > 0 && (
        <section className="report-card">
          <h2>Not answered</h2>
          <p className="report-unanswered">
            <strong>Not answered:</strong> {report.unanswered.join(", ")}.{" "}
            <span className="report-muted">
              Named here so nobody reads silence as a yes. An unanswered
              control has no row in any area&rsquo;s dossier, because there
              is nothing to show and nothing to sign.
            </span>
          </p>
        </section>
      )}

      {/* Where this goes next. The stepper promised a fourth stage from

          the beginning; this is the link to it. */}

      <p className="report-next">
        <Link href={`/projects/${id}/package`}>Package this assessment →</Link>
      </p>

      {/* Only what no single area owns. The rest are asked and answered
          inside their area's dossier, and showing them twice would be the
          report repeating itself (§24.6) — but dropping these three
          entirely would lose them, because they belong to no area. */}
      {assessmentWide.length > 0 && (
        <section className="report-card">
          <h2>Severity across the assessment</h2>
          <ul className="report-sev">
            {assessmentWide.map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                <span className={`band-tag band-${s.band.toLowerCase()}`}>
                  {s.band}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Same rule as severity: an area's findings are recommendations in
          its own dossier. One whose objective no area owns would otherwise
          disappear, so it is named here. */}
      {unfiledFindings.length > 0 && (
        <section className="report-card">
          <h2>Raised, and owned by no single area</h2>
          {unfiledFindings.map((finding, i) => (
            <div
              key={`${finding.objectiveName}-${i}`}
              className="report-finding"
            >
              <p className="report-finding-head">
                <span
                  className={`band-tag band-${finding.kind === "enhancement" ? "medium" : "high"}`}
                >
                  {finding.kind === "gap"
                    ? "Gap"
                    : finding.kind === "enhancement"
                      ? "Enhancement"
                      : "Breaches policy"}
                </span>{" "}
                {finding.objectiveName}
              </p>
              <p>{finding.note}</p>
              {finding.clauseText && (
                <blockquote className="report-clause">
                  “{finding.clauseText}”{" "}
                  <span className="report-muted">
                    — {finding.clause}
                    {finding.policyVersion
                      ? `, version ${finding.policyVersion}`
                      : ""}
                  </span>
                </blockquote>
              )}
            </div>
          ))}
        </section>
      )}

      <footer className="report-foot">
        <Link className="btn ghost" href={`/projects/${id}/review`}>
          ← Back to the review queue
        </Link>
        <p className="report-muted">
          Every figure on this page is derived from the record and recomputed
          when you open it. Nothing here is stored.
        </p>
      </footer>
    </main>
  );
}

/** A reference answer renders as its label; anything else as itself. */
function labelish(value: unknown): string {
  if (value && typeof value === "object" && "label" in value) {
    return String((value as { label: unknown }).label);
  }
  return String(value);
}

/**
 * The record as prose, for the agent to read. Names only, never ids.
 *
 * Everything the assessment holds, not only what the report renders: the
 * scenarios are an inference across the whole thing, and a model asked to
 * reason about an activity from its control answers alone will write
 * scenarios about controls. What the activity *is* — how it was described,
 * what data it touches, what it uses AI for — is where a specific scenario
 * comes from.
 */
function asPlainText(
  report: ReturnType<typeof reportFrom>,
  context: Record<string, unknown> = {},
): string {
  const said = (key: string) => {
    const value = context[key];
    if (Array.isArray(value)) return value.map((v) => labelish(v)).join(", ");
    return typeof value === "string" ? value : value ? labelish(value) : "";
  };
  const lines = [
    `Activity: ${report.activity}`,
    `Purpose: ${report.purpose}`,
    ...(said("projectDescription")
      ? ["", `How it was described: ${said("projectDescription")}`]
      : []),
    ...(said("aiUseCase") ? [`What the AI does: ${said("aiUseCase")}`] : []),
    ...(said("dataElements") ? [`Data involved: ${said("dataElements")}`] : []),
    ...(said("dataClassification")
      ? [`Classification: ${said("dataClassification")}`]
      : []),
    ...(said("thirdPartyInvolved")
      ? [`Third party involved: ${said("thirdPartyInvolved")}`]
      : []),
    ...(said("initiativeType")
      ? [`Initiative type: ${said("initiativeType")}`]
      : []),
    "",
    "Risk areas:",
    ...report.areasThatApply.map(
      (a) => `- ${a.name}: ${a.standing} (${a.because})`,
    ),
    "",
    "Severity:",
    ...report.severities.map((s) => `- ${s.name}: ${s.band}`),
    "",
    "Controls:",
    ...report.controls.map(
      (c) => `- ${c.name}: ${c.answer}${c.note ? ` — "${c.note}"` : ""}`,
    ),
    "",
    "Findings:",
    ...report.findings.map(
      (f) => `- ${f.objectiveName} (${f.kind}): ${f.note}`,
    ),
  ];
  if (report.unanswered.length > 0) {
    lines.push("", `Not answered: ${report.unanswered.join(", ")}`);
  }
  return lines.join("\n");
}
