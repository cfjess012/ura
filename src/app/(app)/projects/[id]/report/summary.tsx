import { agentTransport } from "@/lib/agent";
import { groundedScenarios, type Report } from "@/lib/report";
import {
  domainSlices,
  severityAreaOf,
  unfiledScenarios,
  type DomainSlice,
} from "@/lib/report-domains";
import { DomainDossier } from "./domain-dossier";

/**
 * The assistant's reading, streamed in after the derived facts are already
 * on screen.
 *
 * One call, two places: the paragraph at the top, and the scenarios filed
 * into each area's dossier. It renders the dossier itself rather than
 * sitting beside it, because the scenarios belong *inside* an area's
 * reading — but the fallback renders the same dossier without them, so
 * nothing a reviewer needs is ever waiting on a model.
 *
 * Split out purely so it can suspend. A model takes as long as it takes,
 * and making somebody watch a blank page while it thinks would be the
 * friction this whole product exists to remove.
 */
export async function ReportSummary({
  projectId,
  report,
  record,
  slices,
}: {
  projectId: string;
  report: Report;
  record: string;
  /** The record-derived dossier, so the agent adds to it, never gates it. */
  slices: DomainSlice[];
}) {
  const transport = agentTransport();
  if (!transport.available) {
    return <DomainDossier slices={slices} scenarios="unavailable" />;
  }

  const writing = await transport.writeReport({
    assessment: {
      projectId,
      activity: report.activity,
      onRecord: report.controls.map((c) => ({
        label: c.name,
        value: c.answer,
      })),
      openQuestions: report.unanswered,
    },
    record,
  });
  if (!writing) return <DomainDossier slices={slices} scenarios="unavailable" />;

  const scenarios = groundedScenarios(writing.scenarios, report);
  // Filed by what each scenario cites, so an area holds the reading of its
  // own answers. One that cites nothing an area owns is still shown —
  // dropping it would lose a question because the filing failed, not
  // because the question was weak.
  const filed = domainSlices(report, scenarios, severityAreaOf);
  const unfiled = unfiledScenarios(report, scenarios);

  return (
    <>
      <section className="report-card report-summary">
        <h2>In short</h2>
        <p className="report-lede">{writing.summary}</p>
        <p className="report-byline">
          Written by the assistant from the record below. It proposes; every
          fact on this page is derived from answers a person gave.
        </p>
      </section>

      <DomainDossier slices={filed} />

      {unfiled.length > 0 && (
        <section className="report-card report-scenarios">
          <h2>Worth asking about — across areas</h2>
          <p className="report-muted report-scenarios-note">
            Proposed by the assistant from the answers named beneath each one.
            These are questions, not findings — nothing here has been decided.
          </p>
          {unfiled.map((scenario, i) => (
            <div key={i} className="report-scenario">
              <p className="report-scenario-what">{scenario.scenario}</p>
              <p className="report-scenario-ask">{scenario.ask}</p>
              <p className="report-muted">
                Read from: {scenario.from.join(", ")}
              </p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/** What sits there while it writes: the paragraph as a shimmer, and the
 *  dossier already complete beneath it. Waiting is easier when you know you
 *  are not waiting for the thing you came for. */
export function SummaryPending({ slices }: { slices: DomainSlice[] }) {
  return (
    <>
      <section className="report-card report-summary" aria-live="polite">
        <h2>In short</h2>
        <div className="report-shimmer">
          <span />
          <span />
          <span />
        </div>
        <p className="report-byline">
          The assistant is reading the record. Everything below is already
          complete and does not depend on it.
        </p>
      </section>
      <DomainDossier slices={slices} scenarios="pending" />
    </>
  );
}
