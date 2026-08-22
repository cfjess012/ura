import { redirect } from "next/navigation";
import { peopleStore } from "@/lib/repo";
import { cookies } from "next/headers";
import { PERSON_COOKIE } from "@/lib/current-person";
import { ROLES, ROLE_LABEL, ROLE_SUMMARY } from "@/lib/people";
import { choosePerson } from "./actions";
import { TypedLine } from "./typed-line";

export const dynamic = "force-dynamic";

/**
 * The front door. A deliberate entry point rather than a screen inside the
 * product: it states what the platform promises, then asks who you are.
 *
 * The claims on the left are limited to what is built — this page must not
 * promise a capability the product does not have (§24.7).
 */
export default async function Landing() {
  const people = await peopleStore().signIns();
  // The raw cookie, not currentPerson(): that one always resolves to
  // somebody, so it cannot tell "nobody has chosen yet" from "Priya is
  // chosen" — and the front door needs to know the difference before it
  // highlights a row.
  const currentId = (await cookies()).get(PERSON_COOKIE)?.value ?? null;
  if (people.length === 0) redirect("/projects");

  const initials = (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <main className="landing">
      <section className="landing-pitch">
        <p className="wordmark landing-mark">
          Risk Assessment <span>Advisor</span>
        </p>

        <p className="landing-eyebrow">Universal Risk Assessment</p>
        <h1 className="landing-headline">
          <TypedLine text="One front door, not seven." />
        </h1>
        <p className="landing-lede">
          A business user describes the activity once. Every risk area — third party, security,
          privacy, AI, legal — works from the same answers, and nobody has to ask again. The
          assessment only shows what applies, and says why it is asking.
        </p>

        <ol className="landing-steps">
          <li>
            <span className="step-n">1</span>
            <span>
              <strong>Tell us about it</strong>
              <span>Four short sections — the project&rsquo;s identity record</span>
            </span>
          </li>
          <li>
            <span className="step-n">2</span>
            <span>
              <strong>Assess</strong>
              <span>Eleven risk areas; answer one, and the rest narrow</span>
            </span>
          </li>
          <li>
            <span className="step-n">3</span>
            <span>
              <strong>Review &amp; attest</strong>
              <span>A Risk Assessor signs each answer before it counts</span>
            </span>
          </li>
          <li>
            <span className="step-n">4</span>
            <span>
              <strong>Package</strong>
              <span>A signed, replayable export for the destination system</span>
            </span>
          </li>
        </ol>

        <p className="landing-foot">
          Pilot environment — synthetic data only. Nothing counts until a named person attests it.
        </p>
      </section>

      <section className="landing-choose">
        <div className="landing-choose-inner">
          <p className="eyebrow">Pilot sign-in</p>
          <h2 className="display" style={{ textAlign: "left", fontSize: "1.9rem" }}>
            Choose a persona to continue.
          </h2>
          <p className="lede" style={{ textAlign: "left", margin: "0 0 1.4rem" }}>
            Roles are enforced for real, not simulated — the interface changes with the persona
            because the server checks it on every action. This picker is a demonstration device,
            not a sign-in: anyone can choose any role.
          </p>

          {ROLES.map((role) => {
            const inRole = people.filter((person) => person.role === role);
            if (inRole.length === 0) return null;
            return (
              <div className="persona-group" key={role}>
                <p className="persona-group-title">{ROLE_LABEL[role]}</p>
                <p className="persona-group-desc">{ROLE_SUMMARY[role]}</p>
                {inRole.map((person) => {
                  const current = person.id === currentId;
                  return (
                    <form action={choosePerson} key={person.id}>
                      <input type="hidden" name="personId" value={person.id} />
                      <button
                        type="submit"
                        className={`persona-card${current ? " current" : ""}`}
                        aria-current={current ? "true" : undefined}
                      >
                        <span className="persona-avatar" aria-hidden="true">
                          {initials(person.name)}
                        </span>
                        <span className="persona-body">
                          <span className="persona-line">
                            <span className="persona-card-name">{person.name}</span>
                            {/* What they cover, not what their role is called —
                                the group heading already said the role. */}
                            {person.title && (
                              <span className="persona-tag">{person.title}</span>
                            )}
                          </span>
                        </span>
                        <span className="persona-arrow" aria-hidden="true">
                          {current ? "in use" : "→"}
                        </span>
                      </button>
                    </form>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
