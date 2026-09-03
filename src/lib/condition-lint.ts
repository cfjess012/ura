/**
 * What is wrong with an authored condition before it can do harm (SPEC
 * §6.3, §8 coherence gate, NFR-23).
 *
 * A rule that validates as well-formed and then never fires is the silent
 * no-op: it looks correct in the data and does nothing. A rule that cannot
 * fail is the opposite defect. Both were caught by hand once each; this is
 * where they are caught by construction, at import, so an instrument with
 * one cannot boot — let alone reach a person.
 *
 * Pure and vocabulary-agnostic: the caller says what it knows about each
 * field, so the instrument validator, the Tier-3 validator and a draft
 * edition in an authoring screen (S24) all lint through one function.
 */
import {
  BANDS,
  isNested,
  leavesOf,
  type Condition,
  type LeafCondition,
} from "./conditions";

export type FieldKind =
  /** Free text, a date, a number — anything without a fixed option set. */
  | "text"
  /** A quantity a person typed — the only kind a threshold may read. */
  | "number"
  /** One option from a fixed list. */
  | "choice"
  /** Several options from a fixed list. */
  | "multi"
  /** A risk-area gate: Yes or No. */
  | "gate"
  /** The parts that apply, flattened or per area. */
  | "paths"
  /** A severity band. */
  | "severity"
  | "unknown";

export type KnownFields = {
  kind(field: string): FieldKind;
  /** The options a field offers, when it has a fixed set; null otherwise. */
  options(field: string): string[] | null;
  /**
   * Whether `blank` may be read here. Intake visibility may reveal a note
   * because a box is empty; routing may never close an area because one
   * is (G-77).
   */
  allowsBlank: boolean;
};

const has = <K extends string>(c: object, k: K): c is Record<K, unknown> => k in c;

function lintLeaf(leaf: LeafCondition, where: string, known: KnownFields): string[] {
  const out: string[] = [];
  const kind = known.kind(leaf.field);
  const say = (why: string) => out.push(`${where}: ${why}`);

  if (kind === "unknown") {
    say(`reads "${leaf.field}", which is not an intake field, a gate, a path, or a severity question`);
    return out;
  }
  if (has(leaf, "blank") && !known.allowsBlank) {
    say(`reads "${leaf.field}" as blank — a rule here may not fire on an unanswered field (§3.2.1)`);
  }
  if (has(leaf, "severityAtLeast")) {
    if (kind !== "severity") say(`compares "${leaf.field}" as a severity, and it is not one`);
    if (!BANDS.includes(leaf.severityAtLeast as (typeof BANDS)[number])) {
      say(`"${String(leaf.severityAtLeast)}" is not a band`);
    }
  }
  if ((has(leaf, "atLeast") || has(leaf, "atMost")) && kind !== "number") {
    say(`compares "${leaf.field}" as a number, and it is not one`);
  }
  for (const op of ["equalsAny", "notEqualsAny", "includesAny", "excludesAll"] as const) {
    if (!has(leaf, op)) continue;
    const values = leaf[op] as string[];
    if (values.length === 0) say(`${op} on "${leaf.field}" names no option — it can never fire`);
    const offered = known.options(leaf.field);
    if (offered) {
      for (const value of values) {
        if (!offered.includes(value)) {
          say(`"${leaf.field}" never offers "${value}" — the rule can never fire`);
        }
      }
    }
    if ((op === "equalsAny" || op === "notEqualsAny") && (kind === "multi" || kind === "paths")) {
      say(`"${leaf.field}" holds several answers — use includesAny or excludesAll`);
    }
    if ((op === "includesAny" || op === "excludesAll") && kind === "choice") {
      say(`"${leaf.field}" holds one answer — use equalsAny or notEqualsAny`);
    }
  }
  return out;
}

/** Two leaves in one `all` that cannot both hold. */
function contradictions(siblings: LeafCondition[], where: string): string[] {
  const out: string[] = [];
  const byField = new Map<string, LeafCondition[]>();
  for (const leaf of siblings) {
    byField.set(leaf.field, [...(byField.get(leaf.field) ?? []), leaf]);
  }
  for (const [field, leaves] of byField) {
    const equals = leaves.filter((l) => has(l, "equalsAny")).map((l) => (l as { equalsAny: string[] }).equalsAny);
    const notEquals = leaves.filter((l) => has(l, "notEqualsAny")).flatMap((l) => (l as { notEqualsAny: string[] }).notEqualsAny);
    if (equals.length > 1) {
      const meet = equals.reduce((acc, set) => acc.filter((v) => set.includes(v)));
      if (meet.length === 0) out.push(`${where}: "${field}" is required to equal two different things at once`);
    }
    // Any "must be one of these" wholly inside "must not be any of these"
    // — across operator shapes too, since a single answer satisfies
    // includes/excludes as a list of one: equals Yes beside excludes Yes is
    // as empty as equals Yes beside not-equals Yes (S14 verifier, pass 2).
    const negatives = [
      ...notEquals,
      ...leaves.filter((l) => has(l, "excludesAll")).flatMap((l) => (l as { excludesAll: string[] }).excludesAll),
    ];
    const includeSets = leaves.filter((l) => has(l, "includesAny")).map((l) => (l as { includesAny: string[] }).includesAny);
    // Equals against every negative; includes against not-equals only — the
    // includes/excludes pair is said below, in §19's own words.
    const crossed =
      equals.some((set) => set.length > 0 && set.every((v) => negatives.includes(v))) ||
      includeSets.some((set) => set.length > 0 && set.every((v) => notEquals.includes(v)));
    if (crossed) {
      out.push(`${where}: "${field}" must equal a value the same rule says it must not`);
    }
    const atLeast = leaves.filter((l) => has(l, "atLeast")).map((l) => (l as { atLeast: number }).atLeast);
    const atMost = leaves.filter((l) => has(l, "atMost")).map((l) => (l as { atMost: number }).atMost);
    if (atLeast.length && atMost.length && Math.max(...atLeast) > Math.min(...atMost)) {
      out.push(`${where}: "${field}" must be at least ${Math.max(...atLeast)} and at most ${Math.min(...atMost)} — nothing is`);
    }
    if (leaves.some((l) => has(l, "blank")) && leaves.some((l) => !has(l, "blank"))) {
      out.push(`${where}: "${field}" must be blank and answered at once`);
    }
    // §19: includes X and excludes X is flagged by the contradiction lint.
    const includes = leaves.filter((l) => has(l, "includesAny")).flatMap((l) => (l as { includesAny: string[] }).includesAny);
    const excludes = leaves.filter((l) => has(l, "excludesAll")).flatMap((l) => (l as { excludesAll: string[] }).excludesAll);
    const clash = includes.filter((v) => excludes.includes(v));
    if (clash.length > 0 && includes.every((v) => excludes.includes(v))) {
      // Already refused above in general terms; §19 names this case, so it
      // is said in §19's words as well.
      out.push(`${where}: "${field}" must include ${clash.map((v) => `"${v}"`).join(", ")} and exclude it in the same rule`);
    }
  }
  return out;
}

/** The same condition however its keys are ordered. */
function canonical(condition: Condition): string {
  return JSON.stringify(condition, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** A leaf and its own negation side by side, in either kind of group. */
function selfDefeating(inner: Condition[], where: string, group: "all" | "any"): string[] {
  const out: string[] = [];
  const keys = new Set(inner.map(canonical));
  for (const c of inner) {
    if ("not" in c && keys.has(canonical(c.not))) {
      out.push(
        group === "all"
          ? `${where}: a rule and its own negation are both required — nothing satisfies it`
          : `${where}: a rule or its own negation — it holds for every answered form`,
      );
    }
  }
  if (group === "any") {
    // equals V or not-equals V on one field holds whenever it is answered.
    const leaves = inner.filter((c) => !isNested(c)) as LeafCondition[];
    for (const l of leaves) {
      if (!has(l, "equalsAny")) continue;
      const twin = leaves.find(
        (m) => m.field === l.field && has(m, "notEqualsAny") &&
          (l as { equalsAny: string[] }).equalsAny.every((v) => (m as { notEqualsAny: string[] }).notEqualsAny.includes(v)),
      );
      if (twin) out.push(`${where}: "${l.field}" equals a value or does not — it cannot fail`);
    }
  }
  return out;
}

/**
 * Everything wrong with one condition, in the words an author can act on.
 * Empty means it is well-formed, reads only what exists, and can both fire
 * and fail.
 */
export function lintCondition(
  condition: Condition,
  where: string,
  known: KnownFields,
): string[] {
  const out: string[] = [];
  if ("all" in condition || "any" in condition) {
    const inner = "all" in condition ? condition.all : condition.any;
    if (inner.length === 0) out.push(`${where}: an empty ${"all" in condition ? "all" : "any"} — it decides nothing`);
    const seen = new Set<string>();
    for (const c of inner) {
      const key = canonical(c);
      if (seen.has(key)) out.push(`${where}: the same rule appears twice`);
      seen.add(key);
      out.push(...lintCondition(c, where, known));
    }
    if ("all" in condition) {
      out.push(...contradictions(inner.filter((c) => !isNested(c)) as LeafCondition[], where));
    }
    out.push(...selfDefeating(inner, where, "all" in condition ? "all" : "any"));
    return out;
  }
  if ("not" in condition) {
    const inner = condition.not;
    if (!isNested(inner) && has(inner, "hasValue")) {
      out.push(`${where}: "not answered" can never hold — a negation needs an answer to negate; use blank where it is allowed`);
    }
    out.push(...lintCondition(inner, where, known));
    return out;
  }
  return lintLeaf(condition, where, known);
}

/** A list of conditions read as one `all`, as the instrument authors them. */
export function lintConditions(
  conditions: Condition[],
  where: string,
  known: KnownFields,
): string[] {
  // Each member on its own, then the checks that read across members — the
  // same ones an authored `all` gets. Not wrapped in a synthetic group: a
  // wrapper that then filtered its own empty-group message filtered every
  // authored empty group with it (S14 verifier, finding 1).
  const out = conditions.flatMap((c) => lintCondition(c, where, known));
  const seen = new Set<string>();
  for (const c of conditions) {
    const key = canonical(c);
    if (seen.has(key)) out.push(`${where}: the same rule appears twice`);
    seen.add(key);
  }
  out.push(...contradictions(conditions.filter((c) => !isNested(c)) as LeafCondition[], where));
  out.push(...selfDefeating(conditions, where, "all"));
  return out;
}

/** Every leaf, for callers that keep their own field-existence rules. */
export { leavesOf };
