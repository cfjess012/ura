/**
 * The cloud-native rules as tests (SPEC §26). Prose is advice; a test is a
 * rule. These fail the build if the codebase drifts back toward code that
 * cannot be lifted onto AWS.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..", "src");

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) filesUnder(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}
const read = (p: string) => readFileSync(p, "utf8");
const rel = (p: string) => p.slice(SRC.length + 1);

describe("§26.1 pure logic is liftable", () => {
  /**
   * Every module under `lib/` except the ones that exist to touch the
   * outside world. **Derived, not listed.** The hand-maintained version of
   * this list decayed twice — engine/conditions/people were missing when
   * round-1 verification cited this test as their evidence, and severity/
   * instrument were missing again one slice later. A list of what to check
   * rots every time someone adds a file; a list of what is *exempt* fails
   * loudly when a new file appears, because the new file is checked by
   * default (S4 verification, F9).
   */
  const IMPURE = new Set([
    "lib/db.ts", // opens the connection
    "lib/repo.ts", // speaks to the driver
    "lib/repo-review.ts", // the same store seam, split for NFR-6
    "lib/session.ts", // the conversation-state seam (§6.1), swapped for AgentCore Memory
    "lib/documents.ts", // the document store — same seam, its own module
    "lib/schema.ts", // drizzle table definitions
    "lib/config.ts", // the one module that may read process.env
    "lib/current-person.ts", // reads the request's cookies
    "lib/project-access.ts", // asks the store who may open a project
  ]);
  const PURE = readdirSync(join(SRC, "lib"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `lib/${f}`)
    .filter((f) => !IMPURE.has(f));

  it("covers every module under lib/ that is not declared impure", () => {
    // The certification is only worth what it covers. If a module is added
    // and it is neither pure nor declared impure, this suite must be the
    // thing that says so — not a verifier, one slice later.
    const all = readdirSync(join(SRC, "lib")).filter((f) => f.endsWith(".ts"));
    expect(PURE.length + IMPURE.size).toBe(all.length);
    expect(PURE).toContain("lib/severity.ts");
    expect(PURE).toContain("lib/instrument.ts");
  });

  it("imports no framework, driver, or environment", () => {
    for (const file of PURE) {
      const source = read(join(SRC, file));
      expect(source, file).not.toMatch(/from "next/);
      expect(source, file).not.toMatch(/from "(drizzle-orm|postgres)/);
      expect(source, file).not.toMatch(/process\.env/);
    }
  });

  it("takes plain data, not web request shapes", () => {
    const source = read(join(SRC, "lib/intake-values.ts"));
    expect(source).not.toMatch(/\bFormData\b/);
    expect(source).not.toMatch(/\bRequest\b/);
  });
});

describe("§26.2 persistence is behind one interface", () => {
  it("only the store and the db module touch the driver", () => {
    // The store seam is two files since S8 (NFR-6); it is still the seam.
    const allowed = new Set([
      "lib/repo.ts",
      "lib/repo-review.ts",
      // The session seam is persistence too — Postgres today, AgentCore
      // Memory later. It is allowed the driver for the same reason the
      // stores are: it exists so nothing else needs it.
      "lib/session.ts",
      "lib/documents.ts",
      "lib/db.ts",
      "lib/schema.ts",
    ]);
    const offenders = filesUnder(SRC)
      .filter((f) => !allowed.has(rel(f)))
      .filter((f) => /from "drizzle-orm|from "postgres"|getDb\(/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("§26.3 configuration is read in one place", () => {
  it("no module outside the config reads process.env", () => {
    const offenders = filesUnder(SRC)
      .filter((f) => rel(f) !== "lib/config.ts")
      .filter((f) => /process\.env/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("no hardcoded connection strings or hosts anywhere in src", () => {
    for (const file of filesUnder(SRC)) {
      const source = read(file);
      expect(source, rel(file)).not.toMatch(/postgres:\/\/[^"'`\s]+/);
      expect(source, rel(file)).not.toMatch(/localhost:\d{4}/);
    }
  });
});

describe("§3.3 there is no second evaluator", () => {
  /**
   * Tier 2 shipped with a parallel implementation of the engine:
   * `firesAt.includes(band)`, a band-rank map of its own, and set
   * membership on `q.path`. Nothing in Tier 2 ever called `matches()`, and
   * no gate said so — which is why it shipped. §3.3 is explicit that
   * accumulation is "activation conditions over the same engine", and §18
   * puts one predicate under MUST EXIST NOW. These are the tests that
   * would have failed.
   */
  const severity = read(join(SRC, "lib/severity.ts"));

  it("Tier-2 routing is expressed as conditions the one predicate evaluates", () => {
    expect(severity).toMatch(
      /import \{[^}]*\bmatches\b[^}]*\} from "\.\/conditions"/s,
    );
    // The three routing decisions Tier 2 makes, each published as a
    // condition rather than decided in place.
    for (const emitter of ["askedWhen", "detailWhen", "requiredWhen"])
      expect(severity, emitter).toMatch(new RegExp(`function ${emitter}\\(`));
    expect(
      (severity.match(/\bmatches\(/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("every Tier-2 routing decision is taken by the predicate", () => {
    // Not "the file mentions matches somewhere": each of the three
    // deciding functions must reach it. The originals decided in place —
    // firesAt.includes(band), a rank comparison, a Set of lit path ids.
    for (const fn of [
      "severityQuestionsFor",
      "detailFires",
      "accumulateControls",
    ]) {
      const from = severity.indexOf(`export function ${fn}`);
      expect(from, `${fn} is gone`).toBeGreaterThan(-1);
      const body = severity.slice(from, severity.indexOf("\n}\n", from));
      expect(body, `${fn} decides without the predicate`).toMatch(/matches\(/);
    }
    expect(
      severity,
      "a band list read directly is a second evaluator",
    ).not.toMatch(/firesAt\.(includes|indexOf|some|filter)/);
  });

  it("only the engine knows the order of the bands", () => {
    // The rank map that made severityAtLeast a second implementation of an
    // operator §6.3 already assigns to the engine.
    const offenders = filesUnder(SRC)
      .filter((f) => rel(f) !== "lib/conditions.ts")
      .filter((f) => /(Low|Medium|High)"?\s*:\s*[0-9]/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("§24.3 the assessment screens autosave the same way, once", () => {
  // paths-form and severity-form hand-rolled the same in-flight ref, touched
  // set, failure shape and savebar. A defect fixed in one survived in the
  // other until a verifier found it twice.
  const FORMS = [
    "app/(app)/projects/[id]/assess/paths/paths-form.tsx",
    "app/(app)/projects/[id]/assess/severity/severity-form.tsx",
  ];

  it("both take the machinery from one place rather than repeating it", () => {
    for (const form of FORMS) {
      const source = read(join(SRC, form));
      expect(source, form).toMatch(/from "\.\.\/autosave"/);
      expect(source, form).toMatch(/<SaveBar\b/);
      // Each piece that was duplicated, named so a copy is caught by name.
      expect(source, `${form} tracks its own in-flight save`).not.toMatch(
        /inFlight/,
      );
      expect(source, `${form} renders its own save status`).not.toMatch(
        /role="status"/,
      );
      expect(source, `${form} shapes its own failure`).not.toMatch(/retryable/);
    }
  });
});

describe("§25 error handling is structural", () => {
  it("server actions return typed results rather than throwing on failure", () => {
    const source = read(join(SRC, "app/actions.ts"));
    // One deliberate throw remains: an empty project name before a row
    // exists. Everything else must flow through failure().
    // Any throw, not just `throw new Error` — a bespoke error class threw
    // straight past this guard and landed a refusal on the generic error
    // boundary (N15, N3). `redirect()` throws by design and is exempt.
    const throws = source.match(/throw new \w+/g) ?? [];
    expect(throws, "server actions return failures; they do not throw").toEqual(
      [],
    );
    expect(source).toMatch(/failure\(/);
  });
});

describe("§2 authority is checked on the object, not only on the listing", () => {
  // N1: role scoping filtered the assessment list and nothing else, so every
  // assessment was open to every persona by URL. A route that loads a
  // project must go through the one helper that decides who may see it.
  it("no project route reads the store directly instead of openProject", () => {
    const offenders = filesUnder(join(SRC, "app", "(app)", "projects"))
      .filter((f) => /page\.tsx$/.test(f))
      .filter((f) => /projects\/\[id\]/.test(rel(f)))
      .filter((f) => /projectStore\(\)\.get\(/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("every write action decides authority before it writes", () => {
    const source = read(join(SRC, "app", "actions.ts"));
    for (const action of ["saveIntake", "answerGate", "answerPaths"]) {
      const body = source.slice(
        source.indexOf(`export async function ${action}`),
      );
      const upToWrite = body.slice(0, body.indexOf("Store()."));
      expect(upToWrite, `${action} writes before checking`).toMatch(
        /editableProject/,
      );
    }
  });
});

describe("an action authorises the OBJECT, not only the id it was handed", () => {
  /**
   * `replyToHandoff` checked that the caller could open the project id they
   * PASSED, then wrote using the hand-off id they passed — the two were
   * never required to match. A requester posted into a thread on an
   * assessment the same session refused to open by URL, and it rendered
   * under their name in the owner's thread and the assessor's bell
   * (verifier F2, 2026-08-23).
   *
   * G-33 recorded this rule once already, for pages. This is the same rule
   * for actions: a fix aimed at a finding tends to stop at the finding.
   */
  /**
   * Every server-action module, not one file by name. `actions.ts` was
   * split at S8 and these checks silently stopped covering the actions that
   * moved — a rule that only holds while the code stays in one file is a
   * rule with an expiry date on it.
   */
  const actions = readdirSync(join(SRC, "app"))
    .filter((file) => file.endsWith("actions.ts"))
    .map((file) => read(join(SRC, "app", file)))
    .join("\n");

  const bodyOf = (name: string) => {
    const at = actions.indexOf(`export async function ${name}(`);
    expect(at, `${name} not found in actions.ts`).toBeGreaterThan(-1);
    const rest = actions.slice(at);
    const end = rest.indexOf("\nexport async function ", 1);
    return end === -1 ? rest : rest.slice(0, end);
  };

  it.each(["replyToHandoff", "resolveHandoff"])(
    "%s proves the hand-off belongs to the project it authorised",
    (name) => {
      const body = bodyOf(name);
      expect(body, `${name} must authorise the project`).toMatch(
        /openProject\(projectId\)/,
      );
      expect(
        body,
        `${name} takes a hand-off id from the caller and must look it up within that project`,
      ).toMatch(/handoffStore\(\)\.forProject\(projectId\)/);
    },
  );

  it("no action writes a hand-off reply without that lookup", () => {
    for (const name of ["replyToHandoff"]) {
      const body = bodyOf(name);
      const lookup = body.indexOf("forProject(projectId)");
      const write = body.indexOf("handoffStore().reply(");
      expect(lookup, `${name}: lookup missing`).toBeGreaterThan(-1);
      expect(write, `${name}: write missing`).toBeGreaterThan(-1);
      expect(
        lookup,
        `${name}: the write must come after the lookup`,
      ).toBeLessThan(write);
    }
  });
});

describe("a submitted assessment is closed to writing (S7, FR-37)", () => {
  /**
   * `editableAfter` was written and unit-tested at S7 and called from
   * nowhere — so a person could edit answers after declaring them accurate,
   * making the declaration describe a record that no longer exists. A rule
   * nothing enforces is decoration; that is FR-28's whole lesson.
   */
  const access = read(join(SRC, "lib", "project-access.ts"));

  it("the write gate consults the submission stamp", () => {
    expect(access).toMatch(/editableAfter\(project\.submittedAt\)/);
  });

  it("only the submission act itself may bypass it", () => {
    expect(access).toMatch(/submitting/);
    const actions = read(join(SRC, "app", "actions.ts"));
    const bypasses = [...actions.matchAll(/editableProject\([^)]*,\s*true\)/g)];
    expect(bypasses).toHaveLength(1);
    const at = actions.indexOf(
      'editableProject(projectId, "submitAssessment", true)',
    );
    expect(at, "the bypass must be submitAssessment's").toBeGreaterThan(-1);
  });
});

describe("authority is never read from the caller's payload", () => {
  /**
   * `attestAnswer` checked the caller's authority against an `objective`
   * the caller put in the request, then wrote the row against the
   * `questionId` they also put in the request. Nothing tied the two
   * together, so a Data-Privacy assessor named a Privacy objective and
   * signed a Security control: the check ran, passed, and protected
   * nothing (independent verification of S8, 2026-08-23, G-60).
   *
   * The rule this pins: **a permission check reading a value the requester
   * chose is not a permission check.** The objective must be derived from
   * the question being signed.
   */
  const modules = readdirSync(join(SRC, "app"))
    .filter((file) => file.endsWith("actions.ts"))
    .map((file) => ({ file, source: read(join(SRC, "app", file)) }));

  it("no action asks attestationRefusal about something from the request", () => {
    for (const { file, source } of modules) {
      const calls = [
        ...source.matchAll(
          /attestationRefusal\(\s*[a-zA-Z.]+\s*,\s*([^)]+)\)/g,
        ),
      ];
      for (const call of calls) {
        expect(
          call[1]!.trim(),
          `${file} decides authority from the caller's own payload`,
        ).not.toMatch(/^input\./);
      }
    }
  });

  it("the wire carries no objective for the reviewer's acts", () => {
    const review = read(join(SRC, "app", "review-actions.ts"));
    // If the field does not exist, a forged request cannot supply one.
    expect(review).not.toMatch(/^\s*objective: string;/m);
    expect(review, "the objective is derived from the question").toMatch(
      /objectiveForQuestion\(/,
    );
  });
});

describe("§6.1 the three seams are not scattered", () => {
  /**
   * The whole portability claim rests on three modules: how the agent is
   * reached, where conversation state lives, and the fact that a model
   * exists at all. Each is one file, and these tests are what stop a second
   * one appearing the first time somebody is in a hurry.
   */
  const files = filesUnder(SRC);

  it("only the agent seam knows how the agent is reached", () => {
    const offenders = files
      .filter((file) => rel(file) !== "lib/agent.ts")
      .filter((file) => {
        const source = read(file);
        // Addressing the agent means fetching it or reading its address.
        return /process\.env\.AGENT_URL|AGENT_TRANSPORT/.test(source);
      })
      .map(rel)
      // config.ts is the one place the environment is read at all (§26.3).
      .filter((name) => name !== "lib/config.ts");
    expect(offenders, "these address the agent directly").toEqual([]);
  });

  it("only the session seam reads conversation state", () => {
    const offenders = files
      .filter((file) => rel(file) !== "lib/session.ts")
      .filter((file) =>
        /schema\.conversationTurns|conversation_turns/.test(read(file)),
      )
      .map(rel)
      .filter((name) => name !== "lib/schema.ts");
    expect(
      offenders,
      "these reach conversation state without the seam",
    ).toEqual([]);
  });

  it("the web application never imports a model SDK", () => {
    // Only the agent service may know a model exists (§6.1). It is a
    // separate image; nothing under src/ may pull one in.
    const sdks = /from "(@anthropic-ai\/|openai|@aws-sdk\/client-bedrock)/;
    const offenders = files.filter((file) => sdks.test(read(file))).map(rel);
    expect(offenders, "the web app must never import a model SDK").toEqual([]);
  });

  it("the wire contract carries no field that could record an attestation", () => {
    // A drafted answer is a proposal. If the type could carry a signature,
    // something would eventually set it (SPEC §7).
    const contract = read(join(SRC, "lib", "agent-contract.ts"));
    for (const forbidden of [
      "attested",
      "attestedBy",
      "declaredBy",
      "approved",
    ]) {
      expect(
        contract,
        `the contract must not carry "${forbidden}"`,
      ).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });
});

describe("an accepted proposal is an answer to a question that was asked", () => {
  /**
   * A drafted answer can outlive the question it was drafted for: change
   * the intake and a gate can become derived, settled, or gone. Accepting a
   * stale proposal would then record an answer to something nobody was
   * asked — which is what G-42 forbids, arriving by the back door.
   *
   * Pinned as source structure rather than behaviour because the action is
   * a server action: what matters is that the check exists ahead of the
   * write, and that the version pin is derived rather than assumed.
   */
  const actions = read(join(SRC, "app", "agent-actions.ts"));
  const accept = actions.slice(
    actions.indexOf("export async function acceptDraft"),
  );
  const body = accept.slice(0, accept.indexOf("\nexport async function ", 1));

  it("checks the question is still being asked before it writes", () => {
    expect(body, "acceptDraft must confirm the question is asked").toMatch(
      /gateStates\(/,
    );
    const upToWrite = body.slice(0, body.indexOf("answerStore().record"));
    expect(upToWrite, "the check must come before the write").toMatch(
      /gateStates\(/,
    );
  });

  it("refuses rather than proceeding when it is not", () => {
    expect(body).toMatch(/not asked/);
  });

  it("derives the instrument version from the question, never assumes it", () => {
    // Drafts are Tier-1 gates today. Assuming that in a version pin goes
    // quietly wrong the first time one is for anything else.
    expect(body.replace(/\s+/g, " ")).toMatch(
      /questionId\.startsWith\("t3\."\) \? "tier3-objectives" : "tier1-gates"/,
    );
  });
});
