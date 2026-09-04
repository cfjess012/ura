import Link from "next/link";
import { redirect } from "next/navigation";
import { CATEGORIES } from "@/lib/instrument";
import { litPaths, pathSelectionsFrom } from "@/lib/engine";
import { accumulatedFor, asksNothingFurther } from "@/lib/severity";
import { firstIncompleteSection } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { NotYourAssessment } from "../../not-yours";
import { answerStore } from "@/lib/repo-answers";
import { stageOf } from "@/lib/submission";
import { ProjectHeader } from "../../project-header";
import { AssessRail } from "../assess-rail";
import { assessJourney } from "@/lib/assess-journey";
import { STANDING_LABEL, standingFor } from "@/lib/assess-standing";
import { Detail } from "./detail";

export const dynamic = "force-dynamic";

/**
 * Where this assessment stands (G-91).
 *
 * Four rows of status and one next action. It was 1,067 words, 45 bullets and
 * three scrolls, at the moment a person wants to finish — every part of it
 * true, and together it read as the system explaining its own workings. The
 * question somebody arrives with is *am I done, and what do I press?*
 *
 * Nothing was deleted. The risk-area map, the control derivation and the
 * what-happens-next explanation moved behind disclosure, closed by default,
 * because a reviewer and an auditor genuinely want them and a requester
 * finishing their work does not.
 */
export default async function GatesCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Authority is checked on the object, not only on the listing (N1).
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  const intake = intakeValuesFrom(
    project as unknown as Record<string, unknown>,
  );
  // The risk areas reason from the identity record, so an incomplete one is
  // not a cosmetic problem: nothing pre-fills and the person is asked
  // everything. Enforced here rather than only in the form, because the UI
  // is never the enforcement point (FR-28, §2).
  const incomplete = firstIncompleteSection(intake);
  if (incomplete) redirect(`/projects/${id}/intake/${incomplete}?needed=1`);

  const stored = await answerStore().current(id);
  const journey = assessJourney(stored, intake);
  // One derivation of where things stand, shared with the rail beside it —
  // two readings of the same assessment that disagree is the defect this
  // replaces (the page said "8 of 11 apply" while the rail said "10").
  const standing = standingFor({ journey, projectId: id });

  // Everything behind the disclosures. Recomputed here, never stored (NFR-3).
  const applies = journey.gates.filter((g) => g.answer === "Yes");
  const closed = journey.gates.filter((g) => g.answer === "No");
  const selections = pathSelectionsFrom(CATEGORIES, stored);
  const lit = litPaths(CATEGORIES, journey.gates, selections, intake);
  const owed = accumulatedFor(stored, intake);

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status={stageOf(project.submittedAt)}
        nextLine={
          standing.next
            ? standing.next.label.replace(/ →$/, "")
            : "Nothing outstanding — it is ready to hand over."
        }
        currentStage={1}
      />

      <div className="assess-layout">
        <AssessRail projectId={id} journey={journey} at={null} />

        <section>
          <p className="eyebrow">Where this assessment stands</p>
          <h2 className="display">{standing.headline}</h2>
          <p className="lede">{standing.lede}</p>

          <div className="standing">
            {standing.rows.map((row) => (
              <div className="standing-row" key={row.label}>
                <span className="standing-label">{row.label}</span>
                <span className="standing-detail">{row.detail}</span>
                {/* The state is the word. The tint only follows it (§23). */}
                <span className="standing-state" data-state={row.state}>
                  {STANDING_LABEL[row.state]}
                </span>
              </div>
            ))}
          </div>

          {/* One decision per screen (§24.2). Submission is always reachable
              — gaps are allowed and named, not a locked door (FR-14) — but it
              is the alternative until there is nothing left to do, at which
              point it becomes the act itself. */}
          <div className="standing-actions">
            {standing.next ? (
              <>
                <Link className="btn btn-lead" href={standing.next.href}>
                  {standing.next.label}
                </Link>
                <p className="standing-or">
                  Or{" "}
                  <Link href={`/projects/${id}/submit`}>hand it over now</Link>{" "}
                  with that left unanswered — a reviewer sees the list exactly
                  as it stands, and nothing is hidden from them.
                </p>
              </>
            ) : (
              <>
                <Link className="btn btn-lead" href={`/projects/${id}/submit`}>
                  Read them and hand it over &rarr;
                </Link>
                <p className="standing-or">
                  You declare your answers accurate, and anything still
                  unanswered is named so a reviewer sees it as it is. Handing
                  it over is one-way.
                </p>
              </>
            )}
          </div>

          <div className="standing-more">
            <Detail
              summary="Which risk areas apply, and why the others closed"
              count={`${journey.gates.length} areas`}
            >
              <ul className="summary-list">
                {applies.map((s) => (
                  <li key={s.category.key}>
                    <strong>{s.category.name}</strong>
                    {asksNothingFurther(s.category.key) && !s.settled && (
                      <span className="meta">
                        {" "}
                        — recorded for a reviewer; nothing further is asked here
                      </span>
                    )}
                    {s.settled && s.because && (
                      <span className="meta"> — {s.because}</span>
                    )}
                    {s.fromIntake && s.because && (
                      <span className="meta">
                        {" — answered from "}
                        {s.origin === "answers"
                          ? "your answers"
                          : "your intake"}
                        {" because "}
                        {s.because}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {closed.length > 0 && (
                <>
                  <p className="card-part">Closed — not applicable</p>
                  <ul className="summary-list closed">
                    {closed.map((s) => (
                      <li key={s.category.key}>{s.category.name}</li>
                    ))}
                  </ul>
                </>
              )}
              {lit.length > 0 && (
                <>
                  <p className="card-part">The parts in play</p>
                  <ul className="summary-list">
                    {lit.map((path) => (
                      <li key={`${path.categoryKey}.${path.id}`}>
                        <strong>{path.name}</strong>
                        {path.source === "derived" &&
                          path.because.length > 0 && (
                            <span className="meta">
                              {" "}
                              — added because {path.because.join("; and ")}
                            </span>
                          )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Detail>

            {owed.length > 0 && (
              <Detail
                summary="Why these controls, and which answers pulled them in"
                count={`${owed.length} control${owed.length === 1 ? "" : "s"}`}
              >
                <p className="help">
                  Assembled from your severity answers. A reviewer reads this
                  to see how the list was arrived at.
                </p>
                <ul className="summary-list">
                  {owed.map((control) => (
                    <li key={control.objective}>
                      <strong>{control.name}</strong>
                      <span className="meta">
                        {" "}
                        — {control.because.join("; and ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </Detail>
            )}

            <Detail summary="What happens after you hand it over">
              <p>
                A Risk Assessor attests every answer and settles the findings
                this raises — one of four ways, each of which says what it
                commits to. They then produce the report, and a structured
                extract of this assessment for each risk domain that applies,
                to carry into their own system.
              </p>
              {/* §24.8: an unbuilt write says so rather than being mimicked. */}
              <p className="help">
                The extract is assembled and downloadable here. Sending it into
                a downstream system isn&rsquo;t connected yet.
              </p>
            </Detail>
          </div>
        </section>
      </div>
    </main>
  );
}
