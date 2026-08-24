/**
 * The project header: status, the one-line "what now", and the four-stage
 * stepper. Stages are the SPEC §4.1 process, not this slice's screens —
 * the requester should see the whole journey from step one, including the
 * parts that do not exist yet (they read as upcoming, never as broken).
 */
import { ProgressMeter } from "@/app/(app)/progress-meter";

export type StageState = "done" | "current" | "upcoming";

const STAGES: { label: string; sub: string }[] = [
  { label: "Tell us about it", sub: "the project's identity record" },
  { label: "Assess", sub: "gates, severity, controls" },
  { label: "Review & attest", sub: "a Risk Assessor signs each answer" },
  { label: "Package", sub: "signed, replayable export" },
];

export function ProjectHeader({
  name,
  status,
  nextLine,
  currentStage,
  progress,
}: {
  name: string;
  status: string;
  nextLine: string;
  currentStage: number;
  /**
   * Optional: how far through the work of this screen a person is. On the
   * navy header, so it uses the dark tone — and it only appears where
   * there is a real count to show, never as decoration.
   */
  progress?: { done: number; total: number; label: string };
}) {
  return (
    <section className="projhead">
      <div className="projhead-top">
        <h1>{name}</h1>
        <span className="pill-status">{status}</span>
      </div>

      <p className="nextline">
        <span className="tag">NEXT</span>
        <span>{nextLine}</span>
      </p>

      {progress && progress.total > 0 && (
        <div className="projhead-progress">
          <ProgressMeter
            done={progress.done}
            total={progress.total}
            label={progress.label}
            tone="dark"
          />
        </div>
      )}

      <ol className="stepper" aria-label="Assessment progress">
        {STAGES.map((stage, i) => {
          const state: StageState =
            i < currentStage
              ? "done"
              : i === currentStage
                ? "current"
                : "upcoming";
          return (
            <li
              key={stage.label}
              className={`step ${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="dot" aria-hidden="true">
                {state === "done" ? "✓" : i + 1}
              </span>
              <span>
                <span className="label">{stage.label}</span>
                <br />
                <span className="sub">{stage.sub}</span>
              </span>
              {i < STAGES.length - 1 && (
                <span className="step-rule" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
