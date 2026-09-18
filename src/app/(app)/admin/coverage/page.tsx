import { currentPerson } from "@/lib/current-person";
import { canAdminister, ROLE_LABEL } from "@/lib/people";
import {
  controlsWithoutObligation,
  coverage,
  frameworkRoster,
} from "@/lib/crosswalk";
import { frameworkStanding } from "@/lib/frameworks";

export const dynamic = "force-dynamic";

/**
 * What the control set reaches, and what it does not (FR-53).
 *
 * Two reports, and the second is the one that earns the page: which
 * requirements of a loaded framework no control addresses. A coverage
 * report that only listed successes would be a marketing slide.
 *
 * Everything here is computed from the crosswalk on read. Nothing is
 * stored, nothing is asserted, and a framework nobody has loaded is named
 * with the reason rather than left out — absence that looks like coverage
 * is the failure mode this page exists to prevent (§24.8).
 */
export default async function CoveragePage() {
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
          above to see framework coverage.
        </p>
      </main>
    );
  }

  const reports = coverage();
  const orphans = controlsWithoutObligation();
  const { notLoaded } = frameworkRoster();
  const standing = frameworkStanding(new Date());

  return (
    <main className="model-page">
      <div className="model-head">
        <p className="eyebrow">Administration</p>
        <h1 className="display" style={{ textAlign: "left" }}>
          What the controls reach.
        </h1>
        <p className="lede" style={{ textAlign: "left" }}>
          Every framework carried here was transcribed from its publisher, and
          every mapping names a requirement that framework actually contains.
          Worked out from the crosswalk each time this page is opened, so it
          cannot drift from what the assessment asks.
        </p>
      </div>

      <div className="coverage-grid">
        {reports.map((report) => {
          const total = report.covered.length + report.uncovered.length;
          const reached = Math.round((report.covered.length / total) * 100);
          const checked = standing.find((s) => s.id === report.framework);
          return (
            <section className="coverage-card" key={report.framework}>
              <h3>{report.name}</h3>
              <p className="coverage-edition">
                {report.edition}
                {checked ? ` · checked ${checked.checkedOn}` : ""}
              </p>
              <div
                className="coverage-bar"
                role="img"
                aria-label={`${report.covered.length} of ${total} requirements reached by a control`}
              >
                <span style={{ width: `${reached}%` }} />
              </div>
              <p className="coverage-count">
                <strong>{report.covered.length}</strong> of {total} requirements
                reached · <strong>{report.uncovered.length}</strong> not
              </p>
              <details>
                <summary>What no control addresses</summary>
                <p className="help">
                  Not all of these are gaps. A regulation also defines terms,
                  sets its own scope and creates institutions, and no control
                  can satisfy an article like that. Marking which requirements
                  a control could satisfy is a judgement to be made and
                  recorded, and it has not been made yet.
                </p>
                <ul className="coverage-list">
                  {report.uncovered.map((item) => (
                    <li key={item.ref}>
                      <span className="coverage-ref">{item.ref}</span> —{" "}
                      {item.heading}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          );
        })}
      </div>

      <section className="coverage-absent">
        <p>
          <strong>Controls citing no obligation at all.</strong> Not wrong on
          its own — your own standard can go further than anything you are
          measured against — but each of these is worth a second look.
        </p>
        {orphans.length === 0 ? (
          <p className="help">
            None. Every control in the catalogue cites at least one external
            requirement.
          </p>
        ) : (
          <ul>
            {orphans.map((control) => (
              <li key={control.objective}>{control.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="coverage-absent" style={{ borderLeftColor: "var(--neutral-400)" }}>
        <p>
          <strong>Frameworks this product does not carry.</strong> Named rather
          than left out, so nothing here reads as coverage it does not have.
        </p>
        <ul>
          {notLoaded.map((framework) => (
            <li key={framework.name}>
              <strong>{framework.name}</strong> ({framework.publisher}) —{" "}
              {framework.because}.
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
