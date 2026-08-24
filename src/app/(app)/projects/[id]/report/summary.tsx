import { agentTransport } from "@/lib/agent";
import { groundedScenarios, type Report } from "@/lib/report";

/**
 * The assistant's reading of the report, streamed in after the derived
 * facts are already on screen.
 *
 * Split out purely so it can suspend. Everything a reviewer needs is
 * rendered from the record immediately; a model takes as long as it takes,
 * and making somebody watch a blank page while it thinks would be the
 * friction this whole product exists to remove.
 */
export async function ReportSummary({
  projectId,
  report,
  record,
}: {
  projectId: string;
  report: Report;
  record: string;
}) {
  const transport = agentTransport();
  if (!transport.available) return null;

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
  if (!writing) return null;

  const scenarios = groundedScenarios(writing.scenarios, report);

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

      {scenarios.length > 0 && (
        <section className="report-card report-scenarios">
          <h2>Worth asking about</h2>
          <p className="report-muted report-scenarios-note">
            Proposed by the assistant from the answers named beneath each one.
            These are questions, not findings — nothing here has been decided.
          </p>
          {scenarios.map((scenario, i) => (
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

/** What sits there while it writes. Says what is happening, and that the
 *  rest of the page is already complete — waiting is easier when you know
 *  you are not waiting for the thing you came for. */
export function SummaryPending() {
  return (
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
  );
}
