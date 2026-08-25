/**
 * S? — packaging: the assessment as a record another system can replay.
 *
 * SPEC §4.5 sets three conditions and they are the whole design: every
 * visible question attested, zero open findings, zero open conflicts. Not
 * because packaging is a reward for tidiness, but because the export is a
 * *claim* — it says a named person checked each of these answers — and an
 * export assembled over an unattested answer would make that claim on
 * somebody's behalf without their signature.
 *
 * So the gate is not a courtesy and the reasons are named individually. A
 * screen that says "not ready" without saying what is missing is a locked
 * door, and this product does not have those (FR-14 is the same instinct
 * one stage earlier).
 *
 * What goes in is also spec'd: every attested value including explicit N-A
 * strings, plus the coverage of what was asked and why. The coverage is the
 * part people forget — a record of answers alone cannot tell a downstream
 * reader what was *not* asked, and "we never asked" is different from "they
 * said no".
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import type { FindingKind } from "./submission";

/** Why an assessment cannot be packaged yet, in a person's words. */
export type Blocker = {
  kind: "unattested" | "open-finding" | "not-submitted";
  /** What to tell them. */
  says: string;
  /** How many things of this kind — 0 where the count adds nothing. */
  count: number;
  /** Where they go to clear it. Relative to the project. */
  href: string;
};

/** One attested answer, as the payload carries it. */
export type PackagedAnswer = {
  questionId: string;
  /** The objective's own id, so a downstream reader is not parsing ours. */
  objective: string;
  label: string;
  /**
   * What was attested. An N-A is the string "N-A" rather than an omission:
   * §4.5 is explicit, and a missing key reads as "never asked" when it
   * means "asked, and does not apply here".
   */
  value: string;
  /** The reviewer's own words at the moment of signing. */
  note: string;
  attestedBy: string;
  attestedAt: string;
  /** approve | correct | not-applicable — the act, not just the outcome. */
  act: string;
};

/** What was asked of this assessment, and why it was asked. */
export type Coverage = {
  area: string;
  standing: "applies" | "closed" | "recorded";
  because: string;
};

/** A finding and how it was settled. Unsettled ones block the package. */
export type PackagedFinding = {
  objective: string;
  objectiveName: string;
  kind: FindingKind;
  note: string;
  /** Present exactly when the finding cited a clause. */
  clause?: { reference: string; clauseId: string; version: string; text: string };
  settlement: {
    kind: string;
    note: string;
    resolvedBy: string;
    resolvedAt: string;
    /** Remediation only. */
    owner?: string;
    due?: string;
    /** Risk acceptance only — four eyes, and when it lapses. */
    acceptedBy?: string;
    expiresAt?: string;
  };
};

export type Package = {
  /** Identity, so a replayed record can be matched to its source. */
  assessment: {
    id: string;
    name: string;
    submittedBy: string;
    submittedAt: string;
    classification: string;
  };
  /** What the instrument asked, and why — the part a bare answer list loses. */
  coverage: Coverage[];
  answers: PackagedAnswer[];
  findings: PackagedFinding[];
  /**
   * What produced this. A replay against a different instrument version is
   * a different question, and a reader has to be able to tell.
   */
  provenance: {
    packagedAt: string;
    packagedBy: string;
    instrumentVersions: Record<string, string>;
    /** Which edition of the policy library judged the findings (§22.5). */
    policyVersion: string | null;
  };
};

/**
 * What stands between this assessment and a package.
 *
 * An empty array means it can be packaged. Each blocker names its own count
 * and where to go, because "3 answers still need attesting" is actionable
 * and "not ready" is not.
 */
export function blockers(input: {
  submitted: boolean;
  /** Control questions required by the answers so far. */
  required: string[];
  /** Those carrying a current attestation. */
  attested: string[];
  /** Findings raised and not yet settled. */
  openFindings: number;
}): Blocker[] {
  const found: Blocker[] = [];

  if (!input.submitted) {
    found.push({
      kind: "not-submitted",
      says: "This has not been submitted yet, so there is nothing signed to package.",
      count: 0,
      href: "/submit",
    });
    // Everything below is a consequence of that, and listing three symptoms
    // of one cause reads as three problems.
    return found;
  }

  const signed = new Set(input.attested);
  const waiting = input.required.filter((id) => !signed.has(id)).length;
  if (waiting > 0) {
    found.push({
      kind: "unattested",
      says: `${waiting} control answer${waiting === 1 ? " has" : "s have"} not been attested. The package says a named person checked each answer, so it cannot include one nobody signed.`,
      count: waiting,
      href: "/review",
    });
  }

  if (input.openFindings > 0) {
    found.push({
      kind: "open-finding",
      says: `${input.openFindings} finding${input.openFindings === 1 ? " is" : "s are"} still open. A package with an unsettled finding would export a question as though it were an answer.`,
      count: input.openFindings,
      href: "/review",
    });
  }

  return found;
}

/** Can this be packaged? The same rule, said the short way. */
export function canPackage(input: Parameters<typeof blockers>[0]): boolean {
  return blockers(input).length === 0;
}

/**
 * A stable filename for the download.
 *
 * Dated and slugged from the name, so somebody with four of these in a
 * downloads folder can tell them apart without opening them.
 */
export function packageFilename(name: string, at: Date): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "assessment";
  const day = at.toISOString().slice(0, 10);
  return `${slug}-${day}.json`;
}
