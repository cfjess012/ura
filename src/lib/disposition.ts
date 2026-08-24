/**
 * The four governed dispositions (§4.3, FR-18).
 *
 * A finding is never edited and never simply closed: it is settled by a row
 * that says which of four ways it was settled, by whom, and — where the way
 * demands it — with an owner, a date, or a second person's name.
 *
 * Every rule here is also a CHECK constraint in migration 0021. That is
 * deliberate duplication of a very particular kind: the database refuses a
 * bad row no matter what calls it, and this file exists so a person finds
 * out *on the screen they are looking at* instead of through a failed
 * write. The pure half is what the tests can exercise exhaustively; the
 * constraint is what makes it true for callers that don't exist yet.
 */

export const DISPOSITION_KINDS = [
  "answer-corrected",
  "not-applicable",
  "remediation",
  "risk-accepted",
] as const;

export type DispositionKind = (typeof DISPOSITION_KINDS)[number];

/** Human words. The stored value is never shown to a person (§24.2). */
export const DISPOSITION_LABEL: Record<DispositionKind, string> = {
  "answer-corrected": "The answer was wrong — it has been corrected",
  "not-applicable": "This doesn't apply here",
  remediation: "Somebody is fixing it",
  "risk-accepted": "The risk is accepted, for now",
};

/** What each way commits the organisation to, said before it is chosen. */
export const DISPOSITION_MEANING: Record<DispositionKind, string> = {
  "answer-corrected":
    "The control is in place after all, and the answer has been put right. Correct the answer itself first — this records why the finding went away.",
  "not-applicable":
    "The control doesn't apply to this activity. Say why, in a sentence.",
  remediation:
    "The gap is real and someone owns closing it. Needs a name and a date.",
  "risk-accepted":
    "The gap is real and stays open on purpose. Needs a second person to accept it — never you — and a date it comes back.",
};

export type DispositionInput = {
  kind: DispositionKind;
  note: string;
  remediationOwner: string | null;
  remediationDue: string | null;
  acceptedBy: string | null;
  expiresAt: string | null;
};

/**
 * What is wrong with this disposition, in the words the person will read,
 * or null if it is well-formed. `resolvedBy` is the person settling it —
 * needed because four-eyes is a fact about two people, not one field.
 */
export function dispositionProblem(
  input: DispositionInput,
  who: {
    /** The person settling it. */
    resolvedBy: string;
    /**
     * Everyone who may accept a risk here — real people with the authority
     * to attest, minus the resolver. Passed in rather than read, because
     * this file stays pure; the point is that the second person is checked
     * against the directory and never against whatever string arrived.
     */
    acceptors?: string[];
    /** Everyone who could own a fix (FR-29: chosen, not typed). */
    people?: string[];
  },
): string | null {
  const resolvedBy = who.resolvedBy;
  const eligibleAcceptors = who.acceptors ?? [];
  const knownPeople = who.people ?? [];
  if (!DISPOSITION_KINDS.includes(input.kind)) {
    return "Choose one of the four ways a finding can be settled.";
  }

  // Everything except a correction owes an explanation. A correction speaks
  // for itself: the corrected answer is the explanation.
  if (input.kind !== "answer-corrected" && input.note.trim() === "") {
    return "Say why, in a sentence — whoever reads this later won't have you to ask.";
  }

  if (input.kind === "remediation") {
    if (!input.remediationOwner || input.remediationOwner.trim() === "") {
      return "Remediation needs an owner. A fix nobody owns is a wish.";
    }
    if (
      !knownPeople.some(
        (id) =>
          id.toLowerCase() === input.remediationOwner!.trim().toLowerCase(),
      )
    ) {
      return "Choose the owner from the list — a fix is owned by a person, not by typed-in text.";
    }
    if (!input.remediationDue || !isRealDate(input.remediationDue)) {
      return "Remediation needs a date it is due by.";
    }
    if (!inTheFuture(input.remediationDue)) {
      return "A due date in the past can't be a plan. Pick a date ahead of today.";
    }
  }

  if (input.kind === "risk-accepted") {
    if (!input.acceptedBy || input.acceptedBy.trim() === "") {
      return "A risk acceptance needs a second person to accept it.";
    }
    // Four-eyes. Compared without case, because "A.PRIVACY" and "a.privacy"
    // are one person, and a case-sensitive comparison is a way around the
    // rule rather than the rule itself. The database CHECK is the last line
    // of defence, but it compares strings — so identity has to be settled
    // before it gets there.
    const accepted = input.acceptedBy.trim().toLowerCase();
    if (accepted === resolvedBy.trim().toLowerCase()) {
      return "You can't accept your own risk. It takes a second, named person.";
    }
    // And that person has to be real and able to sign off risk here. A name
    // typed into a request is not a second pair of eyes.
    if (!eligibleAcceptors.some((id) => id.toLowerCase() === accepted)) {
      return "Choose the person accepting this from the list — it has to be someone who can sign off risk here.";
    }
    if (!input.expiresAt || !isRealDate(input.expiresAt)) {
      return "A risk acceptance needs a date it expires — that is what makes it temporary.";
    }
    if (!inTheFuture(input.expiresAt)) {
      return "An acceptance that has already expired settles nothing. Pick a date ahead of today.";
    }
  }

  return null;
}

/** What a settled finding reads as, for the person looking at it later. */
export function dispositionSummary(row: {
  kind: string;
  resolvedBy: string;
  remediationOwner?: string | null;
  remediationDue?: Date | null;
  acceptedBy?: string | null;
  expiresAt?: Date | null;
}): string {
  switch (row.kind) {
    case "answer-corrected":
      return `Answer corrected by ${row.resolvedBy}`;
    case "not-applicable":
      return `Marked not applicable by ${row.resolvedBy}`;
    case "remediation":
      return row.remediationOwner && row.remediationDue
        ? `${row.remediationOwner} is fixing it by ${asDay(row.remediationDue)}`
        : `Remediation planned by ${row.resolvedBy}`;
    case "risk-accepted":
      return row.acceptedBy && row.expiresAt
        ? `Accepted by ${row.acceptedBy} until ${asDay(row.expiresAt)}`
        : `Risk accepted by ${row.resolvedBy}`;
    default:
      return `Settled by ${row.resolvedBy}`;
  }
}

/**
 * An expired acceptance reopens — this says so in words, so the queue can
 * explain a finding that came back rather than silently re-listing it.
 */
export function reopenedBecause(
  row: { kind: string; expiresAt: Date | null } | null,
  now: Date,
): string | null {
  if (!row || row.kind !== "risk-accepted" || !row.expiresAt) return null;
  if (row.expiresAt > now) return null;
  return `The acceptance expired on ${asDay(row.expiresAt)}, so this is open again.`;
}

function isRealDate(value: string): boolean {
  const at = new Date(value);
  return !Number.isNaN(at.getTime());
}

function inTheFuture(value: string): boolean {
  // Compared by day, not by instant: someone picking today's date from a
  // date field means "today", not "midnight this morning, which has passed".
  const at = new Date(value);
  const today = new Date();
  return at.toISOString().slice(0, 10) >= today.toISOString().slice(0, 10);
}

/**
 * One date format on this screen. The panel beside it renders attestation
 * dates with toLocaleDateString, so ISO strings here read as a different
 * kind of thing to a person reading both in one card.
 */
function asDay(at: Date): string {
  // Read back in UTC, because that is how it was stored. A date field sends
  // "2027-06-30", which parses to UTC midnight; formatting that in a
  // timezone behind UTC printed 29 June — the record showing a person a
  // different day from the one they picked.
  return at.toLocaleDateString(undefined, { timeZone: "UTC" });
}
