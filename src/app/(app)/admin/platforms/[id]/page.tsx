import Link from "next/link";
import { notFound } from "next/navigation";
import { currentPerson } from "@/lib/current-person";
import { canAdminister, ROLE_LABEL } from "@/lib/people";
import { projectStore } from "@/lib/repo";
import { answerStore } from "@/lib/repo-answers";
import {
  clearance,
  dependentsByPlatform,
  providedControls,
} from "@/lib/platform-standing";
import { platformById, stale } from "@/lib/platforms";
import { obligationsFor } from "@/lib/crosswalk";

export const dynamic = "force-dynamic";

/**
 * One platform's assessment: what it is for, who owns it, what it provides,
 * what it may hold, and what is leaning on it (G-83).
 *
 * The last of those is the blast radius. An owner about to let an attestation
 * run out needs to see what depends on them before it happens, and the risk
 * team needs to see what became unsupported when it did.
 */
export default async function PlatformPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const person = await currentPerson();
  if (!canAdminister(person.role)) {
    return (
      <main>
        <p className="eyebrow">Administration</p>
        <h1 className="display" style={{ textAlign: "left" }}>
          This page is for administrators.
        </h1>
        <p className="lede" style={{ textAlign: "left" }}>
          You are currently working as <strong>{person.name}</strong> (
          {ROLE_LABEL[person.role]}). Switch to an administrator in the bar
          above to see this platform&rsquo;s assessment.
        </p>
      </main>
    );
  }

  const { id } = await params;
  const platform = platformById(id);
  if (!platform) notFound();

  const now = new Date();
  const age = stale(platform, now);
  const provides = providedControls(platform, now);

  const projects = await projectStore().list({});
  const answers = await answerStore().currentFor(projects.map((p) => p.id));
  const dependents =
    dependentsByPlatform(
      projects.map((project) => ({
        id: project.id,
        name: project.projectName,
        submittedAt: project.submittedAt,
        answers: answers.get(project.id) ?? {},
      })),
    ).get(platform.id) ?? [];

  return (
    <main className="model-page">
      <div className="model-head">
        <p className="eyebrow">
          <Link href="/admin/platforms">Assessed platforms</Link>
        </p>
        <h1 className="display" style={{ textAlign: "left" }}>
          {platform.name}
        </h1>
        <p className="lede" style={{ textAlign: "left" }}>
          {platform.purpose}
        </p>
      </div>

      <section className="card">
        <h2>Who is accountable</h2>
        <p>
          <strong>{platform.owner.name}</strong>, {platform.owner.title}. They
          attest to what this provides and are responsible for spotting new
          features, especially ones that add AI.
        </p>
        {/* Age is part of the fact. A control attested in March and read in
            September is six months old, and the screen says so rather than
            implying live assurance. */}
        <p className={age.stale ? "platform-lapsed-line" : "help"}>
          <strong>{age.stale ? "Lapsed." : "In force."}</strong> {age.because}.
        </p>
        <p className="help">
          Attested {platform.attestation.cadence}. Nobody can attest on this
          screen: that takes a real signed-in identity, which this pilot does
          not have yet.
        </p>
      </section>

      <section className="card">
        <h2>What it may hold</h2>
        <ul className="clearance-list">
          {clearance(platform).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="help">
          An assessment that says it runs on this and involves more than the
          above is told so on its control screen — named, never blocked, for a
          reviewer to settle.
        </p>
      </section>

      <section className="card">
        <h2>
          What it provides
          {provides.length > 0 && (
            <span className="covered-count">{provides.length}</span>
          )}
        </h2>
        {provides.length === 0 ? (
          <p>
            Nothing. This is assessed for what may be put on it rather than for
            what it answers on somebody else&rsquo;s behalf — an activity that
            runs here still answers every control itself.
          </p>
        ) : (
          <>
            <ul className="covered-list">
              {provides.map((control) => (
                <li key={control.objective}>
                  <span className="covered-name">
                    {control.name}
                    {!control.counts && (
                      <span className="covered-state">Not counting</span>
                    )}
                  </span>
                  <span className="covered-source">
                    {obligationsFor(control.objective)
                      .slice(0, 2)
                      .map((o) => `${o.frameworkName} · ${o.ref}`)
                      .join(" · ") || "No framework requirement mapped yet"}
                  </span>
                </li>
              ))}
            </ul>
            {age.stale && (
              <p className="platform-lapsed-line">
                None of these is counting. Past its date, what a platform
                provided is a claim with no evidence behind it, so every
                assessment leaning on it is asked those controls again.
              </p>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>
          What is leaning on it
          {dependents.length > 0 && (
            <span className="covered-count">{dependents.length}</span>
          )}
        </h2>
        {dependents.length === 0 ? (
          <p>
            No assessment names this platform yet. When one does, it appears
            here — so an owner can see what a lapsed attestation would take
            with it before it happens.
          </p>
        ) : (
          <ul className="dependents-list">
            {dependents.map((dependent) => (
              <li key={dependent.id}>
                <Link href={`/projects/${dependent.id}`}>{dependent.name}</Link>
                <span className="covered-source">
                  {dependent.submittedAt
                    ? `Submitted ${dependent.submittedAt.toISOString().slice(0, 10)}`
                    : "Still being answered"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
