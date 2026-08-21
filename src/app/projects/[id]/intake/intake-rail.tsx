import Link from "next/link";
import type { SectionProgress } from "@/lib/intake";

/**
 * Where the person is in intake, and what each section still needs. Same
 * shape as the gate rail so the two steps feel like one journey.
 */
export function IntakeRail({
  projectId,
  progress,
  currentKey,
}: {
  projectId: string;
  progress: SectionProgress[];
  currentKey: string;
}) {
  return (
    <nav className="rail" aria-label="Intake sections">
      <p className="rail-title">About the project</p>
      <ol>
        {progress.map((section, index) => {
          const complete = section.missing.length === 0 && section.answered > 0;
          const status = complete ? "open" : section.answered > 0 ? "prefilled" : "unanswered";
          const active = section.key === currentKey;
          return (
            <li key={section.key}>
              <Link
                href={`/projects/${projectId}/intake/${section.key}`}
                className={`rail-item ${status}${active ? " current" : ""}`}
                aria-current={active ? "step" : undefined}
              >
                <span className="rail-num" aria-hidden="true">
                  {complete ? "✓" : index + 1}
                </span>
                <span className="rail-name">{section.name}</span>
                <span className="rail-state">
                  {section.missing.length > 0
                    ? `${section.missing.length} still needed`
                    : complete
                      ? "Complete"
                      : "Nothing needed"}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
