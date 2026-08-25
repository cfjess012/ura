/**
 * The intake coherence check (FR-43, §22.1).
 *
 * The whole intake is read as one document, because **coherence is a
 * property of the set**: a description saying "internal tool" and a data
 * section listing external recipients is only incoherent when you read
 * both. That is also the one thing a person cannot check for themselves,
 * because they know what they meant.
 *
 * Three layers, and only one is a model.
 *
 * 1. **The floor** — heuristic, here, no model. Catches a product name or
 *    keyboard noise. Costs nothing and is never wrong interestingly.
 * 2. **Scoring** — a model assigns 1–4 per criterion against published
 *    anchors. That is the whole of its job.
 * 3. **Everything after** — the band, the ordering, and the exact sentence
 *    a person reads — is deterministic and lives in the rubric file.
 *
 * **It never blocks.** No agent, a slow one, a wrong one, a partial answer:
 * all pass. A quality assistant that blocks submission has become a gate,
 * and the mission is reducing friction (G-69).
 *
 * The rubric is data and visible: every ask carries the anchor it was
 * scored against, so a grade is readable rather than authoritative.
 */
import doc from "@/data/reference/intake-rubric.json";

export type Level = 1 | 2 | 3 | 4;

export type Criterion = {
  id: string;
  label: string;
  why: string;
  anchors: Record<"1" | "2" | "3" | "4", string>;
  ask: Record<"1" | "2" | "3", string>;
  /** Heading over the quoted halves, where a criterion carries conflicts. */
  conflictHeading?: string;
  /** Said when conflicts were quotable — replaces `ask`, and counts them. */
  conflictSummary?: { one: string; many: string };
  /** Said when the level claims a contradiction but none survived the gate. */
  noConflictFound?: string;
};

/** Two things in the intake that cannot both be true, in the person's words. */
export type Conflict = { one: string; two: string; why: string };

/**
 * The read of the activity a person is shown first: what the platform
 * understood this to be, and what a reviewer notices about it.
 *
 * It sits above the grades because it is the part they can check. A wrong
 * read tells them the platform misunderstood them, which is worth more than
 * any score — and it is the difference between a scorecard and being
 * actually read.
 */
export type Summary = { narrative: string[] };

type RubricDoc = {
  version: string;
  floor: {
    minWords: number;
    minDistinctRatio: number;
    minAverageWordLength: number;
  };
  engine: { failOpenOnAgentError: boolean; opening: string };
  messages: { tooShort: string; notProse: string };
  bands: Array<{ from: number; label: string; meaning: string }>;
  ceilings: { byCriterion: Record<string, Record<string, string>> };
  criteria: Criterion[];
};

const RUBRIC = doc as RubricDoc;

export const RUBRIC_VERSION = RUBRIC.version;
export const CRITERIA = RUBRIC.criteria;

/**
 * The two that decide routing rather than merely describing it. Called out
 * first when thin: a thin answer here is a wrong routing, not a vague one.
 */
const ROUTING_CRITICAL = new Set(["dataAccess", "sensitivity"]);

/** Is this prose about an activity at all? No model needed. */
export function belowFloor(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return RUBRIC.messages.tooShort;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < RUBRIC.floor.minWords) return RUBRIC.messages.tooShort;
  const distinct =
    new Set(words.map((w) => w.toLowerCase())).size / words.length;
  if (distinct < RUBRIC.floor.minDistinctRatio) return RUBRIC.messages.notProse;
  const average =
    words.reduce((total, w) => total + w.length, 0) / words.length;
  if (average < RUBRIC.floor.minAverageWordLength)
    return RUBRIC.messages.notProse;
  return null;
}

export type Scored = { id: string; level: Level; because?: string };

export type Ask = {
  id: string;
  label: string;
  level: Level;
  /** What to do about it, verbatim from the rubric. */
  sentence: string;
  /** What full marks would look like here — the grade, made readable. */
  anchor: string;
  /** Why this criterion exists at all. */
  why: string;
  /** True for the two that decide routing. */
  routing: boolean;
  /** The contradictions behind this ask, each quoted from their own answers. */
  conflicts: Conflict[];
  /** Heading over those quotes. */
  conflictHeading: string | null;
  /** Shown when the level claims a contradiction and none was quotable. */
  unquoted: string | null;
};

export type Coherence = {
  /** 5–20, or null when nothing could be scored. */
  score: number | null;
  outOf: number;
  band: string | null;
  meaning: string | null;
  opening: string | null;
  asks: Ask[];
  /** Whether a model actually read it, as opposed to failing open. */
  checkedByModel: boolean;
  /** What the platform understood this to be. Null when none was written. */
  summary: Summary | null;
  /** Every contradiction, hoisted: it is the finding, not a grade detail. */
  conflicts: Conflict[];
};

/** The band a total falls in. Bands are data; this only looks it up. */
export function bandFor(score: number): { label: string; meaning: string } {
  const band =
    RUBRIC.bands.find((b) => score >= b.from) ??
    RUBRIC.bands[RUBRIC.bands.length - 1]!;
  return { label: band.label, meaning: band.meaning };
}

/**
 * Turn levels into what a person reads. Deterministic: the same levels
 * always produce the same words, and those words live in the rubric file.
 */
export function coherenceFrom(
  scored: Scored[],
  conflicts: Conflict[] = [],
  summary: Summary | null = null,
): Coherence {
  const outOf = CRITERIA.length * 4;
  if (scored.length === 0) {
    return {
      score: null,
      outOf,
      band: null,
      meaning: null,
      opening: null,
      asks: [],
      checkedByModel: false,
      summary: null,
      conflicts: [],
    };
  }

  let total = 0;
  const asks: Ask[] = [];
  for (const criterion of CRITERIA) {
    const found = scored.find((s) => s.id === criterion.id);
    // A criterion nobody scored counts as met rather than as a demand: the
    // fail-open direction, applied one criterion at a time.
    const level = found?.level ?? 4;
    total += level;
    if (level >= 4) continue;
    // Conflicts belong to the criterion that is about contradiction. They
    // are already verbatim — the agent discarded any it could not quote.
    const mine = criterion.id === "consistency" ? conflicts : [];
    asks.push({
      id: criterion.id,
      label: criterion.label,
      level,
      // With conflicts in hand the count is known, so say it rather than
      // saying "two" over four of them. Still deterministic, still from
      // the rubric — only the number comes from the data.
      sentence:
        conflictSentence(criterion, mine) ??
        criterion.ask[String(level) as "1" | "2" | "3"],
      anchor: criterion.anchors["4"],
      why: criterion.why,
      routing: ROUTING_CRITICAL.has(criterion.id),
      conflicts: mine,
      conflictHeading:
        mine.length > 0 ? (criterion.conflictHeading ?? null) : null,
      // The copy for levels 1 and 2 promises the halves are quoted below.
      // When none survived the gate, say something true instead of leaving
      // a person hunting for a list that is not there.
      unquoted:
        mine.length === 0 && level <= 2
          ? (criterion.noConflictFound ?? null)
          : null,
    });
  }

  // Routing-critical shortfalls first, then by how thin. What decides where
  // an assessment goes is worth more of somebody's attention than what
  // merely describes it.
  asks.sort((a, b) => {
    if (a.routing !== b.routing) return a.routing ? -1 : 1;
    return a.level - b.level;
  });

  const band = ceilingApplied(bandFor(total), scored);
  return {
    score: total,
    outOf,
    band: band.label,
    meaning: band.meaning,
    opening: asks.length === 0 ? null : RUBRIC.engine.opening,
    asks,
    checkedByModel: true,
    summary,
    conflicts,
  };
}

/** The count-aware line, when conflicts were quotable. Null otherwise. */
function conflictSentence(
  criterion: Criterion,
  conflicts: Conflict[],
): string | null {
  if (conflicts.length === 0 || !criterion.conflictSummary) return null;
  if (conflicts.length === 1) return criterion.conflictSummary.one;
  return criterion.conflictSummary.many.replace(
    "{n}",
    String(conflicts.length),
  );
}

/**
 * Lower a band when a criterion is bad enough that the sum lies.
 *
 * Five criteria summed will call a self-contradicting intake "Workable" so
 * long as the other four are strong — but the contradiction is not offset
 * by them, it undermines them: every one of those four answers might be the
 * half that is wrong. The ceiling is per criterion and lives in the rubric.
 */
function ceilingApplied(
  band: { label: string; meaning: string },
  scored: Scored[],
): { label: string; meaning: string } {
  const order = RUBRIC.bands.map((b) => b.label);
  let capped = band;
  for (const s of scored) {
    const ceiling = RUBRIC.ceilings?.byCriterion?.[s.id]?.[String(s.level)];
    if (!ceiling) continue;
    // Bands are listed best first, so a later index is a worse band.
    if (order.indexOf(ceiling) > order.indexOf(capped.label)) {
      const found = RUBRIC.bands.find((b) => b.label === ceiling);
      if (found) capped = { label: found.label, meaning: found.meaning };
    }
  }
  return capped;
}

/** What to say when the model could not be asked. It passes, explicitly. */
export function coherenceWhenUnavailable(): Coherence {
  return {
    score: null,
    outOf: CRITERIA.length * 4,
    band: null,
    meaning: null,
    opening: null,
    asks: [],
    checkedByModel: false,
    summary: null,
    conflicts: [],
  };
}

/** Every criterion, as the model is asked to score them. */
export function scoringBrief(): Array<{
  id: string;
  label: string;
  anchors: Criterion["anchors"];
}> {
  return CRITERIA.map((c) => ({
    id: c.id,
    label: c.label,
    anchors: c.anchors,
  }));
}
