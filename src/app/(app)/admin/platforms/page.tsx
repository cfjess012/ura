import Link from "next/link";
import { currentPerson } from "@/lib/current-person";
import { canAdminister, ROLE_LABEL } from "@/lib/people";
import { projectStore } from "@/lib/repo";
import { answerStore } from "@/lib/repo-answers";
import {
  attentionFirst,
  platformStandings,
  unsupported,
} from "@/lib/platform-standing";
import { PLATFORMS_VERSION } from "@/lib/platforms";

export const dynamic = "force-dynamic";

/**
 * Every assessed platform, how fresh its attestation is, and what is leaning
 * on it (G-83).
 *
 * Read-only, deliberately. A platform owner is an accountable person, and
 * until real sign-in exists (S21) there is nobody this product could honestly
 * record an attestation as coming from. So this shows what the records say
 * and says plainly that nobody can attest here yet, rather than offering a
 * button that would write somebody's name onto an assurance they never gave.
 *
 * The dependants column is the reason to build it now rather than later:
 * quarterly attestation with nobody able to see what depends on them is a
 * calendar reminder, not a control.
 */
export default async function PlatformsPage() {
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
          above to see the assessed platforms.
        </p>
      </main>
    );
  }

  // Dependence is a fact about the answers in force, worked out on every read
  // rather than stored (NFR-3): uncheck a platform and this changes with it.
  const projects = await projectStore().list({});
  const answers = await answerStore().currentFor(projects.map((p) => p.id));
  const standings = attentionFirst(
    platformStandings(
      projects.map((project) => ({
        id: project.id,
        name: project.projectName,
        submittedAt: project.submittedAt,
        answers: answers.get(project.id) ?? {},
      })),
      new Date(),
    ),
  );
  const lapsed = unsupported(standings);

  return (
    <main className="model-page">
      <div className="model-head">
        <p className="eyebrow">Administration</p>
        <h1 className="display" style={{ textAlign: "left" }}>
          What we have assessed once, so nobody assesses it again.
        </h1>
        <p className="lede" style={{ textAlign: "left" }}>
          Each of these has an owner accountable for two things: attesting to
          the controls it provides, and spotting new features that would change
          what it is. An activity that says it runs on one of them inherits
          those controls with the owner&rsquo;s name and the date attached.
        </p>
      </div>

      {lapsed.platforms > 0 ? (
        <div className="platform-note platform-note-lapsed" role="note">
          <p className="platform-note-head">
            {lapsed.platforms} attestation{lapsed.platforms === 1 ? " has" : "s have"}{" "}
            run out
          </p>
          <p className="platform-note-tail">
            {lapsed.assessments === 0
              ? "No assessment is leaning on them yet, so nothing has become unsupported."
              : `${lapsed.assessments} assessment${lapsed.assessments === 1 ? "" : "s"} named one of them, and the controls it provided have stopped counting for ${lapsed.assessments === 1 ? "it" : "them"}.`}
          </p>
        </div>
      ) : (
        <p className="help">Every attestation here is in force.</p>
      )}

      <table className="platform-table">
        <caption className="sr-only">
          Assessed platforms, those needing attention first
        </caption>
        <thead>
          <tr>
            <th scope="col">Platform</th>
            <th scope="col">Owner</th>
            <th scope="col">Attestation</th>
            <th scope="col">Provides</th>
            <th scope="col">Assessments on it</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((platform) => (
            <tr key={platform.id} data-stale={platform.stale}>
              <th scope="row">
                <Link href={`/admin/platforms/${platform.id}`}>
                  {platform.name}
                </Link>
                <span className="platform-purpose">{platform.purpose}</span>
              </th>
              <td>
                {platform.ownerName}
                <span className="platform-purpose">{platform.ownerTitle}</span>
              </td>
              <td>
                {/* The state is the word; the tint only follows it (§23). */}
                <span
                  className={
                    platform.stale ? "platform-lapsed" : "platform-standing"
                  }
                >
                  {platform.stale ? "Lapsed" : "In force"}
                </span>
                <span className="platform-purpose">
                  {platform.stale
                    ? `ran out ${platform.expires}`
                    : `until ${platform.expires}`}
                </span>
              </td>
              <td className="platform-number">
                {platform.provides === 0 ? "—" : platform.provides}
              </td>
              <td className="platform-number">
                {platform.dependents.length === 0
                  ? "none yet"
                  : platform.dependents.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="help">
        Nobody can attest here yet. An attestation is a named person putting
        their name to a control, and this pilot signs people in with a
        switcher rather than a real identity — so these records are seeded and
        maintained in the repository, and the screen shows what they say.
        Reference data {PLATFORMS_VERSION}.
      </p>
    </main>
  );
}
