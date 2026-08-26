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
import { findingIsOpen, type FindingKind } from "./submission";

/** Why an assessment cannot be packaged yet, in a person's words. */
export type Blocker = {
  kind: "unattested" | "open-finding" | "not-submitted";
  /** What to tell them. */
  says: string;
  /** How many things of this kind — 0 where the count adds nothing. */
  count: number;
  /**
   * Which ones, by the text a person recognises (§19 requires the refusal
   * name questions by text). A count says how much is left; only the names
   * say what, and "4 control answers" sends somebody back to a queue to
   * work out which four.
   */
  names: string[];
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
  /** Control questions required by the answers so far, id and text both. */
  required: Array<{ questionId: string; label: string }>;
  /** The ids of those carrying a current attestation. */
  attested: string[];
  /**
   * The findings that are open, named by the objective each is against.
   * A count was enough to refuse and not enough to act on, and deciding
   * *which* findings are open is not this module's judgement to make —
   * `findingIsOpen` owns that, and an expired acceptance is open (§4.3).
   */
  openFindings: string[];
}): Blocker[] {
  const found: Blocker[] = [];

  if (!input.submitted) {
    found.push({
      kind: "not-submitted",
      says: "This has not been submitted yet, so there is nothing signed to package.",
      count: 0,
      names: [],
      href: "/submit",
    });
    // Everything below is a consequence of that, and listing three symptoms
    // of one cause reads as three problems.
    return found;
  }

  const signed = new Set(input.attested);
  const waiting = input.required.filter((q) => !signed.has(q.questionId));
  if (waiting.length > 0) {
    const names = waiting.map((q) => q.label);
    found.push({
      kind: "unattested",
      says: `${waiting.length} control answer${waiting.length === 1 ? " has" : "s have"} not been attested — ${sentenceList(names)}. The package says a named person checked each answer, so it cannot include one nobody signed.`,
      count: waiting.length,
      names,
      href: "/review",
    });
  }

  const open = input.openFindings;
  if (open.length > 0) {
    found.push({
      kind: "open-finding",
      says: `${open.length} finding${open.length === 1 ? " is" : "s are"} still open — ${sentenceList(open)}. A package with an unsettled finding would export a question as though it were an answer.`,
      count: open.length,
      names: open,
      href: "/review",
    });
  }

  return found;
}

/**
 * Names inside a sentence, not a comma-separated dump.
 *
 * Cut past four with a count of the rest: twenty names in one sentence is
 * a wall somebody skips, and the screen lists every one of them underneath
 * regardless — the sentence is there to make the refusal specific, not to
 * be the only place the names appear.
 */
function sentenceList(names: string[], limit = 4): string {
  const shown = names.slice(0, limit);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")}, and ${rest} more`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/**
 * Which findings are open, named by the objective each is against (§4.3).
 *
 * Here, in the pure module, rather than in the action that calls it —
 * because *the action* is exactly where this lived when it was wrong. It
 * counted disposition rows: any settlement at all meant settled. A risk
 * acceptance past its expiry has a row and is open, so the review queue
 * flagged findings the packaging gate was letting through, one assessment
 * and one moment reading two ways.
 *
 * No unit test could reach it there. That is not a coincidence — it is why
 * the defect shipped, and moving it is the fix for the gap as much as for
 * the bug.
 */
export function openFindingNames(
  findings: Array<{ id: string; objectiveName: string }>,
  /** The settlement in force per finding, if there is one. */
  settlements: Map<string, { kind: string; expiresAt: Date | null }>,
  now: Date,
): string[] {
  return findings
    .filter((finding) => findingIsOpen(settlements.get(finding.id) ?? null, now))
    .map((finding) => finding.objectiveName);
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
