/**
 * The whole of the Assess stage, worked out from the answers (SPEC §4.1).
 *
 * Four steps, each derived from the one before: which risk areas apply,
 * which parts of them, how severe, and whether the controls exist. Every
 * screen in the stage used to compute only its own slice of this and draw a
 * rail of only that slice — the parts screen rendered the risk-areas rail
 * with nothing highlighted, "Next" on the last area jumped to a step the
 * rail had never mentioned, and at severity the rail was swapped for a
 * different one. The owner's words: "it just randomly takes you to this
 * narrow section." One derivation, so every screen draws the same map and
 * points at the same next stop.
 *
 * Pure: answers in, journey out. Nothing here is stored (NFR-3), and it is
 * recomputed on every render like everything else derived (NFR-4).
 */
import type { AnswerLookup } from "./conditions";
import { litPaths, pathSelectionsFrom } from "./engine";
import {
  askableCategories,
  CATEGORIES,
  gateStates,
  unansweredCount,
  type Category,
  type GateState,
} from "./instrument";
import { accumulatedFor, groupsFor, severityQuestionsFor } from "./severity";
import { isTier3Value, objectivesFor } from "./tier3";

export type StoredAnswers = Record<
  string,
  { value: unknown; source: string; confirmed: boolean }
>;

export type JourneyPart = {
  category: Category;
  /** The number the risk-areas list gave it, so the two read against each other. */
  number: number;
  ticked: number;
  total: number;
  /** Answered at all — a deliberate "none of these" is an answer. */
  answered: boolean;
};

export type JourneySeverity = {
  key: string;
  name: string;
  done: number;
  total: number;
};

export type AssessJourney = {
  gates: GateState[];
  /** The areas a person walks, in order — everything not settled. */
  walk: GateState[];
  gatesRemaining: number;
  /** Open areas that ask which of their parts apply. */
  parts: JourneyPart[];
  partsRemaining: number;
  severity: JourneySeverity[];
  severityRemaining: number;
  controls: { total: number; answered: number };
  /**
   * Which steps can be opened now. A step is a link only once the ones
   * before it are answered — the screens redirect otherwise, and a link
   * that bounces is worse than none (§24.4).
   */
  reach: { parts: boolean; severity: boolean; controls: boolean };
};

export function assessJourney(
  stored: StoredAnswers,
  intake: AnswerLookup,
): AssessJourney {
  const gates = gateStates(stored, intake);
  const walk = gates.filter((g) => !g.settled);
  const gatesRemaining = unansweredCount(gates);

  const selections = pathSelectionsFrom(CATEGORIES, stored);

  const parts: JourneyPart[] = askableCategories()
    .filter(
      (c) =>
        c.pathQuestion &&
        gates.find((g) => g.category.key === c.key)?.answer === "Yes",
    )
    .map((category) => ({
      category,
      number: walk.findIndex((g) => g.category.key === category.key) + 1,
      ticked: selections[category.key]?.length ?? 0,
      total: category.pathQuestion!.options.length,
      answered: selections[category.key] !== undefined,
    }));
  const partsRemaining = parts.filter((p) => !p.answered).length;

  const lit = litPaths(CATEGORIES, gates, selections, intake);
  const questions = severityQuestionsFor(lit.map((p) => p.id));
  const severity: JourneySeverity[] = groupsFor(questions).map((group) => ({
    key: group.key,
    name: group.name,
    done: group.questions.filter(
      (q) => typeof stored[q.questionId]?.value === "string",
    ).length,
    total: group.questions.length,
  }));
  const severityRemaining = severity.reduce(
    (sum, g) => sum + (g.total - g.done),
    0,
  );

  const objectives = objectivesFor(
    accumulatedFor(stored, intake).map((c) => c.objective),
  );
  const controls = {
    total: objectives.length,
    answered: objectives.filter((o) =>
      isTier3Value(stored[o.questionId]?.value),
    ).length,
  };

  const areasDone = gatesRemaining === 0;
  return {
    gates,
    walk,
    gatesRemaining,
    parts,
    partsRemaining,
    severity,
    severityRemaining,
    controls,
    reach: {
      parts: areasDone,
      severity: areasDone && partsRemaining === 0,
      // The controls screen says "nothing to answer yet" for itself; it is
      // reachable as soon as severity is, and honest when it is early.
      controls: areasDone && partsRemaining === 0,
    },
  };
}

/**
 * Where "Next" on the last risk area goes, and what it says.
 *
 * It said "Next →" and went to the parts screen whether or not there was
 * anything to narrow, so the person left a numbered list for a page the
 * list did not contain. Now the label names the destination the way every
 * other step already does ("Next: how severe →"), and the parts screen is
 * skipped when no area asks for it.
 *
 * `currentHasParts` is the area being answered right now: the screen is
 * rendered before the answer is given, and a Yes on an area with parts
 * makes the parts screen the right next stop even though this journey,
 * computed a moment earlier, does not know that yet.
 */
export function afterAreas(
  journey: AssessJourney,
  currentHasParts: boolean,
): { path: string; label: string } {
  if (journey.parts.length > 0 || currentHasParts) {
    return { path: "paths", label: "Next: which parts apply →" };
  }
  const first = journey.severity[0];
  if (first) {
    return { path: `severity/${first.key}`, label: "Next: how severe →" };
  }
  return { path: "complete", label: "Next: where this stands →" };
}
