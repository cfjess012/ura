/**
 * What an activity inherits from the platforms it sits on (G-83).
 *
 * Of the fifteen control questions a requester faces, ten are about the
 * enterprise estate. This is how they stop being asked: the requester says
 * which assessed platforms the activity uses — a fact they genuinely know —
 * and the controls those platforms provide arrive with the provider's name
 * and the date they attested, rather than as questions nobody in the room
 * can answer.
 *
 * Three rules hold it honest.
 *
 * **Nothing is inherited silently** (§22.1). Coverage is shown with its
 * provider and its date, and confirmed by a person, because an answer that
 * appears from nowhere is indistinguishable from one somebody invented.
 *
 * **A lapsed attestation covers nothing.** Past its date, what a platform
 * provided is a claim with no evidence behind it, so the control goes back
 * to being asked. That is the same rule the product already applies to an
 * expired risk acceptance, which reopens its finding.
 *
 * **A platform can only cover what it could possibly know** — the
 * classification refuses a platform claiming a system-specific control at
 * import, so nothing here needs to re-check it.
 *
 * Pure: the caller fetches, this decides. Nothing is stored.
 */
import type { AnswerLookup } from "./conditions";
import { intakeValuesFrom } from "./intake-values";
import {
  dataMismatches,
  platformById,
  providedBy,
  stale,
  type Platform,
} from "./platforms";
import { accumulatedFor, controlName } from "./severity";

/** Where a requester's platform choice is recorded. */
export const PLATFORMS_QUESTION = "platforms";

type Stored = Record<string, { value: unknown; source: string; confirmed: boolean }>;

/** The platforms this assessment says it sits on. */
export function platformsChosen(stored: Stored): string[] {
  const value = stored[PLATFORMS_QUESTION]?.value;
  return Array.isArray(value) ? (value as string[]) : [];
}

export type Covered = {
  objective: string;
  name: string;
  platformName: string;
  owner: string;
  attestedOn: string;
};

export type Inheritance = {
  /** The platforms chosen, in the order the roster lists them. */
  chosen: Platform[];
  /** Chosen platforms whose attestation has lapsed — they cover nothing. */
  lapsed: Array<{ platform: Platform; because: string }>;
  /** Controls this assessment requires that a live platform provides. */
  covered: Covered[];
  /** Controls it requires that nobody covers — the questions still worth asking. */
  stillAsked: string[];
  /** Where the activity wants to put data a chosen platform is not cleared for. */
  mismatches: Array<{ platform: string; platformName: string; because: string }>;
};

/**
 * What this assessment inherits, and what it must still answer.
 *
 * Coverage is intersected with what the assessment actually requires: a
 * platform providing thirty controls is worth nothing on an activity that
 * needs three of them, and listing the other twenty-seven would be padding
 * a screen with reassurance.
 */
export function inheritanceFor(input: {
  stored: Stored;
  intake: AnswerLookup;
  /** The row as the store returns it, for what the activity wants to hold. */
  project?: Record<string, unknown>;
  now: Date;
}): Inheritance {
  const { stored, intake, now } = input;
  const ids = platformsChosen(stored);
  const chosen = ids.map(platformById).filter((p): p is Platform => p !== null);

  const lapsed = chosen
    .map((platform) => ({ platform, age: stale(platform, now) }))
    .filter((entry) => entry.age.stale)
    .map((entry) => ({ platform: entry.platform, because: entry.age.because }));

  const live = chosen.filter((p) => !lapsed.some((l) => l.platform.id === p.id)).map((p) => p.id);
  const required = new Set(accumulatedFor(stored, intake).map((c) => c.objective));

  const covered: Covered[] = providedBy(live, now)
    .filter((entry) => required.has(entry.objective))
    .map((entry) => ({
      objective: entry.objective,
      name: entry.name,
      platformName: entry.platformName,
      owner: entry.owner,
      attestedOn: entry.attestedOn,
    }));

  const coveredIds = new Set(covered.map((c) => c.objective));
  const stillAsked = [...required].filter((objective) => !coveredIds.has(objective)).sort();

  const values = input.project ? intakeValuesFrom(input.project) : {};
  const classification = typeof values.dataClassification === "string" ? values.dataClassification : "";
  const elements = Array.isArray(values.dataElements) ? (values.dataElements as string[]) : [];
  const mismatches = dataMismatches(ids, { classification, elements });

  return { chosen, lapsed, covered, stillAsked, mismatches };
}

/**
 * The answer an inherited control carries once a person confirms it.
 *
 * The note is the provenance, in the words a reviewer and an auditor read
 * later: which platform, whose attestation, and when. A bare "Yes" here
 * would be the requester asserting something they never checked.
 */
export function inheritedAnswer(covered: Covered): { answer: "Yes"; note: string } {
  return {
    answer: "Yes",
    note: `Provided by ${covered.platformName}. ${covered.owner} attested to it on ${covered.attestedOn}, and this activity sits on that platform.`,
  };
}

/**
 * Whether this control's recorded answer is the inherited one.
 *
 * The distinction the screen turns on. A control a platform *could* cover is
 * still asked; a control whose recorded answer came from that platform is
 * not. Without this, ticking a platform would take the question away before
 * anyone accepted the offer, leaving the control neither asked nor answered
 * — a silent gap, which is worse than either.
 *
 * It also keeps a person's own answer theirs: somebody who answers No to a
 * control a platform provides has disagreed, and the question stays.
 */
export function inheritedAlready(covered: Covered, value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const held = value as { answer?: unknown; note?: unknown };
  return held.answer === "Yes" && held.note === inheritedAnswer(covered).note;
}

/** How much of the burden a choice of platforms takes away, in words. */
export function relief(inheritance: Inheritance): string {
  const covered = inheritance.covered.length;
  const total = covered + inheritance.stillAsked.length;
  if (total === 0) return "Nothing is required here yet.";
  if (covered === 0) {
    return `None of the ${total} controls this needs is provided by a platform you have chosen.`;
  }
  return `${covered} of ${total} controls are provided by platforms you already sit on, so only ${inheritance.stillAsked.length} are left to answer here.`;
}

/** The names, for a screen that lists what is still owed. */
export function stillAskedNames(inheritance: Inheritance): string[] {
  return inheritance.stillAsked.map(controlName);
}
