import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { agentTransport } from "@/lib/agent";
import { intakeValuesFrom } from "@/lib/intake-values";
import { gateStates } from "@/lib/instrument";
import { openProject } from "@/lib/project-access";
import { answerStore, peopleStore, submissionStore } from "@/lib/repo";
import { accumulatedFor, asksNothingFurther, SEVERITY } from "@/lib/severity";
import { reportFrom, standingLine } from "@/lib/report";
import { isTier3Value, objectivesFor, type Tier3Value } from "@/lib/tier3";
import { NotYourAssessment } from "../not-yours";
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

  const [stored, findings, everyone] = await Promise.all([
    answerStore().current(id),
    submissionStore().findingsFor(id),
    peopleStore().list(),
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
  });

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

      {/* Streamed: the derived report is already complete, so nobody waits
          on a model to read what a person actually answered. */}
      {transport.available && (
        <Suspense fallback={<SummaryPending />}>
          <ReportSummary projectId={id} report={report} record={record} />
        </Suspense>
      )}

      <section className="report-card">
        <h2>What this is</h2>
        <p>{report.activity}</p>
        {report.purpose && <p className="report-muted">{report.purpose}</p>}
      </section>

      <section className="report-card">
        <h2>Where it lands</h2>
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

      {report.severities.length > 0 && (
        <section className="report-card">
          <h2>Severity</h2>
          <ul className="report-sev">
            {report.severities.map((s) => (
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

      <section className="report-card">
        <h2>Controls</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th>Control</th>
              <th>Answer</th>
              <th>What they said</th>
              <th>Required by</th>
            </tr>
          </thead>
          <tbody>
            {report.controls.map((control) => (
              <tr key={control.name}>
                <td>{control.name}</td>
                <td>
                  <strong>{control.answer}</strong>
                </td>
                <td className="report-muted">{control.note || "—"}</td>
                <td className="report-muted">{control.authority ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.unanswered.length > 0 && (
          <p className="report-unanswered">
            <strong>Not answered:</strong> {report.unanswered.join(", ")}. Named
            here so nobody reads silence as a yes.
          </p>
        )}
      </section>

      {report.findings.length > 0 && (
        <section className="report-card">
          <h2>What this raises</h2>
          {report.findings.map((finding, i) => (
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
