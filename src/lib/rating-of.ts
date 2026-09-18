/**
 * The rating of one assessment, from what is on record (FR-50, FR-51).
 *
 * The composition the screens share: take the stored answers, the intake,
 * the findings with their settlements and the attestations, and hand back
 * the inherent and residual bands, the per-area bands and any appetite
 * breach — each with its reasons. One function, so the ledger, the
 * submitted view, the review, the report, the queue and the package
 * cannot rate the same record differently.
 *
 * Pure: the caller fetches, this decides. Nothing is stored (NFR-3).
 */
import { assessmentLookup, litPaths, pathSelectionsFrom } from "./engine";
import { CATEGORIES, gateStates } from "./instrument";
import { BANDS, type AnswerLookup, type Band } from "./conditions";
import { assessJourney } from "./assess-journey";
import {
  appetiteBreaches,
  areaRatings,
  inherentRating,
  RATING_EDITION,
  residualRating,
  type AppetiteBreach,
  type Coverage,
  type Rated,
  type RatedControl,
  type RatedFinding,
} from "./rating";
import { accumulatedFor, severityQuestionsFor } from "./severity";
import { findingStanding } from "./submission";
import { isTier3Value, objectivesFor } from "./tier3";

export type Rating = {
  inherent: Rated;
  residual: Rated;
  areas: Record<string, Rated>;
  breaches: AppetiteBreach[];
  /** How much of what the rating reads is answered — for the screens, not the reasons. */
  coverage: Coverage;
  /** The edition whose rules produced this — slug@version, as the seed names it. */
  edition: string;
};

type Stored = Record<string, { value: unknown; source: string; confirmed: boolean }>;

/** What the record lights: the gates, the ticked parts, and the paths lit. */
function litFor(stored: Stored, intake: AnswerLookup) {
  const gates = gateStates(stored, intake);
  const selections = pathSelectionsFrom(CATEGORIES, stored);
  const paths = litPaths(CATEGORIES, gates, selections, intake).map((p) => p.id);
  return { gates, selections, paths };
}

/**
 * The severity bands a person set, on the questions the assessment is
 * asking. Three things are not a band: a proposal (§7); a word outside the
 * scale — the action refuses one, and so does this, so a stray value can
 * never reach an area chip; and an answer to a question the record no
 * longer asks. Unticking a path hides its severity question everywhere
 * else (§19: activation goes, the stored answer stays), and a rating that
 * kept reading it would rate an area the person had just said does not
 * apply — with no screen left to change the answer on (verifier S15-B2).
 */
export function severitiesOf(stored: Stored, intake: AnswerLookup): Record<string, Band> {
  const out: Record<string, Band> = {};
  for (const q of severityQuestionsFor(litFor(stored, intake).paths)) {
    const held = stored[q.questionId];
    if (!held || (held.source === "drafted" && !held.confirmed)) continue;
    if (typeof held.value === "string" && BANDS.includes(held.value as Band))
      out[q.questionId] = held.value as Band;
  }
  return out;
}

export function rateAssessment(input: {
  stored: Stored;
  intake: AnswerLookup;
  findings: Array<{ id: string; objective: string; kind: RatedFinding["kind"] }>;
  /** Newest first, as the stores return them. */
  dispositions: Array<{
    findingId: string;
    kind: string;
    expiresAt: Date | null;
    remediationDue: Date | null;
  }>;
  /** Newest first. */
  attestations: Array<{ questionId: string; act: string; correctedAnswer: string | null }>;
  now: Date;
}): Rating {
  const { stored, intake, now } = input;
  const { gates, selections, paths } = litFor(stored, intake);
  const asked = severityQuestionsFor(paths);
  const severities = severitiesOf(stored, intake);
  // What the rating reads, and how much of it has an answer. Both halves
  // come from derivations that already exist — the journey counts what the
  // assess stage still owes, and the severity reader is the one definition of a
  // severity answer that counts (a drafted proposal does not).
  const journey = assessJourney(stored, intake);
  const coverage: Coverage = {
    areasUnanswered: journey.gatesRemaining,
    partsUnnarrowed: journey.partsRemaining,
    severityAsked: asked.length,
    severityAnswered: Object.keys(severities).length,
  };
  const lookup = assessmentLookup({
    intake,
    gates,
    pathSelections: selections,
    severities,
  });

  const inherent = inherentRating(lookup, severities, coverage);
  const areas = areaRatings(severities, asked.map((q) => q.questionId));

  // Findings, with the settlement in force — the newest row per finding.
  const inForce = new Map<string, (typeof input.dispositions)[number]>();
  for (const row of input.dispositions) {
    if (!inForce.has(row.findingId)) inForce.set(row.findingId, row);
  }
  const findings: RatedFinding[] = input.findings.map((f) => {
    const settled = inForce.get(f.id) ?? null;
    return {
      objective: f.objective,
      kind: f.kind,
      standing: findingStanding(settled, now),
      settlementKind: settled?.kind ?? null,
    };
  });

  // Required controls, with the answer that stands: the attested value
  // where a reviewer has signed, the submitted one otherwise.
  const required = objectivesFor(
    accumulatedFor(stored, intake).map((c) => c.objective),
  );
  const signed = new Map<string, (typeof input.attestations)[number]>();
  for (const row of input.attestations) {
    if (!signed.has(row.questionId)) signed.set(row.questionId, row);
  }
  const controls: RatedControl[] = required.map((objective) => {
    const value = stored[objective.questionId]?.value;
    const given = isTier3Value(value) ? value.answer : null;
    const signature = signed.get(objective.questionId);
    const answer = signature
      ? signature.act === "not-applicable"
        ? "N-A"
        : (signature.correctedAnswer ?? given)
      : given;
    return {
      objective: objective.id,
      questionId: objective.questionId,
      answer,
      attested: signature !== undefined,
    };
  });

  const residual = residualRating(inherent, { findings, controls, coverage });
  return {
    inherent,
    residual,
    areas,
    breaches: appetiteBreaches({ residual, areas }),
    coverage,
    edition: RATING_EDITION,
  };
}
