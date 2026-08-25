/**
 * What a submitted assessment is still waiting for, in a reviewer's terms.
 *
 * One definition, two readers: the bell decides whether an assessment needs
 * somebody, and the reviewer's list says what specifically was identified.
 * Both were about to grow their own idea of "outstanding", which is how two
 * screens end up disagreeing about the same assessment.
 *
 * Everything here is DERIVED from what is already recorded — findings and
 * their dispositions, attestations against answered control questions, the
 * gaps named in the declaration. Nothing is stored as an alert, so there is
 * no queue to drain, nothing to mark read, and nothing that can go stale
 * against the record it describes.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */

/** The raw counts a store can produce for one submitted assessment. */
export type ReviewCounts = {
  /**
   * Control questions answered, and those already attested — as ids, not
   * counts. Whether an outstanding one is *this* reviewer's to sign depends
   * on the risk domain that owns it (FR-17), so the count cannot be taken
   * before the reader is known.
   */
  answeredIds: string[];
  attestedIds: string[];
  /**
   * Open findings — raised and not yet settled — as the objectives they
   * were raised against, by kind. Objectives rather than counts for the
   * same reason as above: a finding belongs to the risk domain that owns
   * its control, and only that domain's assessor can settle it.
   */
  openGaps: string[];
  openEnhancements: string[];
  openViolations: string[];
  /** Questions the requester left unanswered and declared as gaps. */
  declaredGaps: number;
};

/** One thing a reviewer can act on, and where to act on it. */
export type StandingItem = {
  kind:
    "attest" | "elsewhere" | "violation" | "gap" | "enhancement" | "unanswered";
  count: number;
  /** Written for somebody who has not opened the assessment yet. */
  label: string;
  href: string;
};

/**
 * Severity order, and it is the order they are shown in.
 *
 * A policy violation cites a clause the organisation wrote down, so it
 * outranks a control gap, which outranks an improvement somebody suggested.
 * Attestation comes first because nothing else can be settled until the
 * answers are signed.
 */
const ORDER: StandingItem["kind"][] = [
  "attest",
  "elsewhere",
  "violation",
  "gap",
  "enhancement",
  "unanswered",
];

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What is outstanding, most serious first. An empty list means the reviewer
 * has nothing left to do here — which is exactly when the alert disappears.
 */
export function reviewStanding(
  projectId: string,
  counts: ReviewCounts,
  /**
   * May this reader sign this control question? Defaults to yes, which is
   * right for a list that is not addressed to anybody in particular —
   * never for an alert, which is addressed to exactly one person.
   */
  mine: (questionId: string) => boolean = () => true,
  /** May this reader settle a finding raised against this objective? */
  minesObjective: (objectiveId: string) => boolean = () => true,
): StandingItem[] {
  const review = `/projects/${projectId}/review`;
  const found: StandingItem[] = [];

  const attested = new Set(counts.attestedIds);
  const outstanding = counts.answeredIds.filter((id) => !attested.has(id));
  const toAttest = outstanding.filter(mine);
  // Told apart deliberately. "Waiting for your attestation" over answers
  // another risk area owns is a false claim, and the person acts on it —
  // they open the queue, find every control greyed out, and conclude the
  // product is broken rather than that the alert was wrong.
  const theirs = outstanding.length - toAttest.length;

  if (toAttest.length > 0) {
    found.push({
      kind: "attest",
      count: toAttest.length,
      label: `${plural(toAttest.length, "control answer", "control answers")} waiting for your attestation`,
      href: review,
    });
  }
  if (theirs > 0) {
    found.push({
      kind: "elsewhere",
      count: theirs,
      label: `${plural(theirs, "control answer", "control answers")} for other risk domains to sign`,
      href: review,
    });
  }
  const violations = counts.openViolations.filter(minesObjective);
  const gaps = counts.openGaps.filter(minesObjective);
  const enhancements = counts.openEnhancements.filter(minesObjective);

  if (violations.length > 0) {
    found.push({
      kind: "violation",
      count: violations.length,
      // Named as what it is: an answer that contradicts a written clause,
      // not a generic "issue".
      label: `${plural(violations.length, "policy violation", "policy violations")} — an answer contradicts a clause`,
      href: `${review}#findings`,
    });
  }
  if (gaps.length > 0) {
    found.push({
      kind: "gap",
      count: gaps.length,
      label: `${plural(gaps.length, "control gap", "control gaps")} — a required control isn't in place`,
      href: `${review}#findings`,
    });
  }
  if (enhancements.length > 0) {
    found.push({
      kind: "enhancement",
      count: enhancements.length,
      label: `${plural(enhancements.length, "enhancement", "enhancements")} — a control is partly in place`,
      href: `${review}#findings`,
    });
  }
  if (counts.declaredGaps > 0) {
    found.push({
      kind: "unanswered",
      count: counts.declaredGaps,
      // Not a defect on the requester's part: FR-14 makes submitting with
      // gaps legitimate, and the declaration names them on purpose.
      label: `${plural(counts.declaredGaps, "question", "questions")} the requester left unanswered and declared`,
      href: `${review}#declared`,
    });
  }

  return found.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/** Does this assessment still need a reviewer? */
export function needsReviewer(
  counts: ReviewCounts,
  mine: (questionId: string) => boolean = () => true,
  minesObjective: (objectiveId: string) => boolean = () => true,
): boolean {
  const attested = new Set(counts.attestedIds);
  const outstandingMine = counts.answeredIds.some(
    (id) => !attested.has(id) && mine(id),
  );
  // Declared gaps alone are not work for a reviewer: the requester already
  // said so, a reviewer reads them, and nothing about them can be settled.
  // Treating them as outstanding would leave an alert nobody could clear.
  return (
    outstandingMine ||
    counts.openViolations.some(minesObjective) ||
    counts.openGaps.some(minesObjective) ||
    counts.openEnhancements.some(minesObjective)
  );
}
