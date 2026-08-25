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
  /** Control answers recorded, and how many carry a current attestation. */
  answered: number;
  attested: number;
  /** Open findings — raised and not yet settled — by kind. */
  openGaps: number;
  openEnhancements: number;
  openViolations: number;
  /** Questions the requester left unanswered and declared as gaps. */
  declaredGaps: number;
};

/** One thing a reviewer can act on, and where to act on it. */
export type StandingItem = {
  kind: "attest" | "violation" | "gap" | "enhancement" | "unanswered";
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
): StandingItem[] {
  const review = `/projects/${projectId}/review`;
  const found: StandingItem[] = [];

  const toAttest = Math.max(0, counts.answered - counts.attested);
  if (toAttest > 0) {
    found.push({
      kind: "attest",
      count: toAttest,
      label: `${plural(toAttest, "control answer", "control answers")} waiting for your attestation`,
      href: review,
    });
  }
  if (counts.openViolations > 0) {
    found.push({
      kind: "violation",
      count: counts.openViolations,
      // Named as what it is: an answer that contradicts a written clause,
      // not a generic "issue".
      label: `${plural(counts.openViolations, "policy violation", "policy violations")} — an answer contradicts a clause`,
      href: `${review}#findings`,
    });
  }
  if (counts.openGaps > 0) {
    found.push({
      kind: "gap",
      count: counts.openGaps,
      label: `${plural(counts.openGaps, "control gap", "control gaps")} — a required control isn't in place`,
      href: `${review}#findings`,
    });
  }
  if (counts.openEnhancements > 0) {
    found.push({
      kind: "enhancement",
      count: counts.openEnhancements,
      label: `${plural(counts.openEnhancements, "enhancement", "enhancements")} — a control is partly in place`,
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
export function needsReviewer(counts: ReviewCounts): boolean {
  // Declared gaps alone are not work for a reviewer: the requester already
  // said so, a reviewer reads them, and nothing about them can be settled.
  // Treating them as outstanding would leave an alert nobody could clear.
  return (
    counts.answered > counts.attested ||
    counts.openViolations > 0 ||
    counts.openGaps > 0 ||
    counts.openEnhancements > 0
  );
}
