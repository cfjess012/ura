/**
 * Risk rating — bands with reasons, computed by the one engine (FR-50,
 * FR-51, G-78; settles SPEC §4.6 and §14.1).
 *
 * Two ratings, and they mean different things. **Inherent** is how risky
 * the activity is before anyone asks whether the controls exist: read from
 * the severity answers, the areas that apply and the parts that are lit.
 * **Residual** is where it stands after the control answers, the findings
 * and their settlements — it moves by whole bands from the inherent one,
 * each step naming its reason, and it changes the moment a finding is
 * settled or an acceptance lapses.
 *
 * Every rule is a condition in `rating.json`, evaluated by `matches()` over
 * a namespace this module derives — `worst.severity`, `areas.atHigh`,
 * `area.<key>.severity`, `findings.*`, `controls.*` — merged with the
 * assessment's own (intake, gates, parts). So the S14 lint refuses a rule
 * that cannot fire, the renderer can say any rule in words, and there is
 * still exactly one evaluator. **A rating is a band with its reasons —
 * never a number** (grounding.ts's argument against a "7.2/10" stands).
 *
 * Nothing here is stored (NFR-3): recomputed on every read, and frozen
 * only into the package payload at packaging, which §4.6 permits.
 *
 * Pure: no framework, no driver, no environment.
 */
import doc from "@/data/instrument/rating.json";
import { knownFields } from "./condition-known";
import { lintCondition, type FieldKind, type KnownFields } from "./condition-lint";
import {
  BANDS,
  matches,
  worstBand,
  type AnswerLookup,
  type Band,
  type Condition,
} from "./conditions";
import { CATEGORIES } from "./instrument";
import { ALL_FIELDS } from "./intake";
import { SEVERITY_QUESTIONS } from "./severity";
import type { FindingStanding } from "./submission";

export const RATING_BANDS = ["Low", "Medium", "High", "Critical"] as const;
export type RatingBand = (typeof RATING_BANDS)[number];
/** A rating band's place on its own scale — the array is the order. */
const rank = (band: RatingBand) => RATING_BANDS.indexOf(band);

/** What a person reads: the band, and every reason it holds. */
export type Rated = { band: RatingBand; because: string[] };

type Rule = { band: RatingBand; when: Condition; because: string };
type Step = { step: number; when: Condition; because: string };
type Appetite = {
  scope: string;
  max: RatingBand;
  because: string;
  escalateTo: string;
};
export type RatingDoc = {
  slug: string;
  version: string;
  bands: RatingBand[];
  inherent: { default: { band: RatingBand; because: string }; rules: Rule[] };
  controls: { defaultWeight: Band; weight: Record<string, Band> };
  residual: { rules: Step[] };
  appetite: Appetite[];
};

/* ---------- the derived namespace ---------- */

const AREA_OF_PATH = new Map<string, string>();
for (const c of CATEGORIES) {
  for (const o of c.pathQuestion?.options ?? []) AREA_OF_PATH.set(o.id, c.key);
  for (const d of c.derivedPaths ?? []) AREA_OF_PATH.set(d.id, c.key);
}
const AREA_OF_QUESTION = new Map<string, string>();
for (const q of SEVERITY_QUESTIONS) {
  const area = q.path ? AREA_OF_PATH.get(q.path) : undefined;
  if (area) AREA_OF_QUESTION.set(q.questionId, area);
}

const worst = worstBand;

/** What the inherent rules may read, beyond the assessment's own answers. */
export function inherentNamespace(
  severities: Record<string, Band | null | undefined>,
): AnswerLookup {
  const out: AnswerLookup = {};
  const all: Band[] = [];
  const byArea = new Map<string, Band[]>();
  for (const [questionId, band] of Object.entries(severities)) {
    if (!band) continue;
    all.push(band);
    const area = AREA_OF_QUESTION.get(questionId);
    if (area) byArea.set(area, [...(byArea.get(area) ?? []), band]);
  }
  const overall = worst(all);
  if (overall) out["worst.severity"] = overall;
  let atHigh = 0;
  let atMedium = 0;
  for (const [area, bands] of byArea) {
    const w = worst(bands)!;
    out[`area.${area}.severity`] = w;
    if (w === "High") atHigh += 1;
    if (w !== "Low") atMedium += 1;
  }
  out["areas.atHigh"] = String(atHigh);
  out["areas.atMedium"] = String(atMedium);
  return out;
}

export type RatedFinding = {
  objective: string;
  kind: "gap" | "enhancement" | "non-compliance";
  standing: FindingStanding;
  /** The settlement in force, if any. */
  settlementKind: string | null;
};

export type RatedControl = {
  objective: string;
  questionId: string;
  /** The answer that stands — the attested value where one exists. */
  answer: string | null;
  attested: boolean;
};

/** What the residual steps may read. Numbers, as strings the engine parses. */
export function residualNamespace(input: {
  findings: RatedFinding[];
  controls: RatedControl[];
}): AnswerLookup {
  const weightOf = (objective: string): Band =>
    RATING.controls.weight[objective] ?? RATING.controls.defaultWeight;
  const open = input.findings.filter(
    (f) => f.standing === "open" || f.standing === "reopened",
  );
  const n = (x: number) => String(x);
  return {
    "findings.open.any": n(open.length),
    "findings.open.gap": n(open.filter((f) => f.kind === "gap").length),
    "findings.open.enhancement": n(open.filter((f) => f.kind === "enhancement").length),
    "findings.open.nonCompliance": n(open.filter((f) => f.kind === "non-compliance").length),
    "findings.open.gapOnHighWeight": n(
      open.filter((f) => f.kind !== "enhancement" && weightOf(f.objective) === "High").length,
    ),
    "findings.accepted": n(
      input.findings.filter((f) => f.standing === "settled" && f.settlementKind === "risk-accepted").length,
    ),
    "findings.overdue": n(input.findings.filter((f) => f.standing === "overdue").length),
    "controls.required.unattested": n(input.controls.filter((c) => !c.attested).length),
    "controls.attested.highWeightYes": n(
      input.controls.filter((c) => c.attested && c.answer === "Yes" && weightOf(c.objective) === "High").length,
    ),
  };
}

/* ---------- the ratings ---------- */

export function inherentRating(
  assessment: AnswerLookup,
  severities: Record<string, Band | null | undefined>,
): Rated {
  const lookup = { ...assessment, ...inherentNamespace(severities) };
  let band = RATING.inherent.default.band;
  const because: string[] = [];
  for (const rule of RATING.inherent.rules) {
    if (!matches(rule.when, lookup)) continue;
    // Worst matching rule wins; every matching rule's reason is kept,
    // because a reviewer reading one reason is reading an incomplete record.
    if (rank(rule.band) > rank(band)) band = rule.band;
    because.push(rule.because);
  }
  return {
    band,
    because: because.length > 0 ? because : [RATING.inherent.default.because],
  };
}

export function residualRating(
  inherent: Rated,
  input: { findings: RatedFinding[]; controls: RatedControl[] },
): Rated {
  const lookup = residualNamespace(input);
  let at = rank(inherent.band);
  const because = [`inherent rating ${inherent.band}`];
  for (const step of RATING.residual.rules) {
    if (!matches(step.when, lookup)) continue;
    at = Math.max(0, Math.min(RATING_BANDS.length - 1, at + step.step));
    because.push(step.because);
  }
  return { band: RATING_BANDS[at]!, because };
}

/** The band an area sits at before controls: its worst severity, as a rating. */
export function areaRatings(
  severities: Record<string, Band | null | undefined>,
): Record<string, Rated> {
  const out: Record<string, Rated> = {};
  const ns = inherentNamespace(severities);
  for (const [field, value] of Object.entries(ns)) {
    const m = /^area\.(.+)\.severity$/.exec(field);
    if (!m || typeof value !== "string") continue;
    out[m[1]!] = { band: value as RatingBand, because: [`the worst severity answer in this area is ${value}`] };
  }
  return out;
}

export type AppetiteBreach = {
  scope: string;
  /** The scope in words — "the assessment", or the area's short name — so no screen prints a key (NFR-9). */
  label: string;
  band: RatingBand;
  max: RatingBand;
  because: string;
  escalateTo: string;
};

/** "the assessment", or the area's short name — validate() has already refused any other scope. */
function scopeLabel(scope: string): string {
  if (scope === "assessment") return "the assessment";
  return CATEGORIES.find((c) => c.key === scope.slice(5))?.short ?? "a risk area";
}

/** Every place a rating exceeds the stated appetite, with where it escalates. */
export function appetiteBreaches(rated: {
  residual: Rated;
  areas: Record<string, Rated>;
}): AppetiteBreach[] {
  const out: AppetiteBreach[] = [];
  for (const line of RATING.appetite) {
    const held =
      line.scope === "assessment"
        ? rated.residual
        : line.scope.startsWith("area:")
          ? rated.areas[line.scope.slice("area:".length)]
          : undefined;
    if (!held) continue;
    if (rank(held.band) > rank(line.max)) {
      out.push({ scope: line.scope, label: scopeLabel(line.scope), band: held.band, max: line.max, because: line.because, escalateTo: line.escalateTo });
    }
  }
  return out;
}

/** The weight a control carries in the residual, from the edition. */
export function controlWeight(objective: string): Band {
  return RATING.controls.weight[objective] ?? RATING.controls.defaultWeight;
}

/* ---------- validation at import ---------- */

/** What a rating rule may read: the derived names, plus everything the assessment holds. */
export function ratingFields(): KnownFields {
  const base = knownFields({
    areas: CATEGORIES,
    intake: ALL_FIELDS,
    severityQuestionIds: SEVERITY_QUESTIONS.map((q) => q.questionId),
    canSeePaths: true,
    allowsBlank: false,
  });
  const areaKeys = new Set(CATEGORIES.map((c) => c.key));
  const derived = (field: string): FieldKind | null => {
    if (field === "worst.severity") return "severity";
    if (field === "areas.atHigh" || field === "areas.atMedium") return "number";
    const m = /^area\.(.+)\.severity$/.exec(field);
    if (m) return areaKeys.has(m[1]!) ? "severity" : "unknown";
    if (field.startsWith("findings.") || field.startsWith("controls.")) {
      return NUMERIC.has(field) ? "number" : "unknown";
    }
    return null;
  };
  return {
    allowsBlank: false,
    kind: (field) => derived(field) ?? base.kind(field),
    options: (field) => {
      const kind = derived(field);
      if (kind === "severity") return [...BANDS];
      if (kind === "number" || kind === "unknown") return null;
      return base.options(field);
    },
  };
}

const NUMERIC = new Set(Object.keys(residualNamespace({ findings: [], controls: [] })));

export function validate(candidate: RatingDoc): RatingDoc {
  const problems: string[] = [];
  if (!candidate.slug || !candidate.version) problems.push("missing slug or version");
  if (JSON.stringify(candidate.bands) !== JSON.stringify(RATING_BANDS)) {
    problems.push(`bands must be exactly ${RATING_BANDS.join(", ")}, worst last`);
  }
  const known = ratingFields();
  // The rule's own fields are checked here; the lint below checks only its
  // condition. G-78 makes editing these an act of ratification by someone
  // who will not be reading this file — so a rule with no band, or a step
  // that is not a whole number of bands, is refused with a sentence.
  const furthest = RATING_BANDS.length - 1;
  const rules: Array<{ where: string; when: Condition; band?: unknown; step?: unknown; because: string }> = [
    ...candidate.inherent.rules.map((r, i) => ({ where: `inherent rule ${i + 1}`, when: r.when, band: r.band, because: r.because })),
    ...candidate.residual.rules.map((r, i) => ({ where: `residual rule ${i + 1}`, when: r.when, step: r.step, because: r.because })),
  ];
  for (const rule of rules) {
    if (!rule.because?.trim()) problems.push(`${rule.where}: has no reason`);
    if ("band" in rule && !RATING_BANDS.includes(rule.band as RatingBand)) {
      problems.push(`${rule.where}: "${String(rule.band)}" is not a rating band`);
    }
    if ("step" in rule) {
      const step = rule.step;
      if (typeof step !== "number" || !Number.isInteger(step) || Math.abs(step) > furthest) {
        problems.push(`${rule.where}: step must be a whole number of bands, between -${furthest} and ${furthest} — got ${JSON.stringify(step)}`);
      }
    }
    problems.push(...lintCondition(rule.when, rule.where, known));
  }
  for (const [objective, weight] of Object.entries(candidate.controls.weight)) {
    if (!BANDS.includes(weight)) problems.push(`control ${objective}: weight "${weight}" is not a band`);
  }
  for (const line of candidate.appetite) {
    if (!RATING_BANDS.includes(line.max)) problems.push(`appetite ${line.scope}: "${line.max}" is not a rating band`);
    if (line.scope !== "assessment" && !line.scope.startsWith("area:")) {
      problems.push(`appetite ${line.scope}: scope must be "assessment" or "area:<key>"`);
    }
    if (line.scope.startsWith("area:") && !areaKeysOf(candidate).has(line.scope.slice(5))) {
      problems.push(`appetite ${line.scope}: no such risk area`);
    }
    if (!line.because?.trim()) problems.push(`appetite ${line.scope}: has no reason`);
    // A breach escalates to a person: an administrator, or the assessor for
    // a risk area. Anything else would render as a fallback sentence and
    // send the breach to nobody.
    const target = line.escalateTo ?? "";
    const toArea = target.startsWith("domain:") && areaKeysOf(candidate).has(target.slice(7));
    if (target !== "role:admin" && !toArea) {
      problems.push(
        `appetite ${line.scope}: escalates to "${target}", which is neither an administrator nor a risk area\x27s assessor`,
      );
    }
  }
  if (problems.length > 0) throw new Error(`Rating edition is invalid:\n- ${problems.join("\n- ")}`);
  return candidate;
}
const areaKeysOf = (_: RatingDoc) => new Set(CATEGORIES.map((c) => c.key));

export const RATING: RatingDoc = validate(doc as unknown as RatingDoc);
export const RATING_VERSION = RATING.version;
/** The edition as the seed and the package name it: slug@version. */
export const RATING_EDITION = `${RATING.slug}@${RATING.version}`;
