/**
 * A condition as one English sentence (SPEC §6.3, NFR-23) — the
 * explainability surface. "Shown because the data is not public" is a
 * sentence an author wrote; this is the sentence the engine can write for
 * any rule, so a rule never has to be explained by its JSON.
 *
 * It never utters an identifier (NFR-9). The words come from a vocabulary
 * the caller supplies — the instrument's own labels — and a field the
 * vocabulary does not know is named as "a question", never by its id.
 *
 * Pure: no framework, no driver, no environment, no instrument import —
 * the vocabulary is an argument so this can render a draft edition too.
 */
import type { Condition, LeafCondition } from "./conditions";

export type Vocabulary = {
  /** The label a person knows the field by, or null if unknown. */
  field(id: string): string | null;
  /** The label of one option of a field, when options carry ids. */
  option?(field: string, value: string): string | null;
};

const quote = (s: string) => `“${s}”`;

function list(items: string[], joiner: "or" | "and", bare = false): string {
  const said = bare ? items : items.map(quote);
  if (said.length <= 1) return said.join("");
  return `${said.slice(0, -1).join(", ")} ${joiner} ${said.at(-1)}`;
}

function nameOf(field: string, vocabulary: Vocabulary): string {
  const label = vocabulary.field(field);
  if (label) return label;
  if (field.startsWith("gate.")) return "a risk area";
  if (field.startsWith("severity.")) return "a severity question";
  if (field === "paths" || field.startsWith("path.")) return "the parts that apply";
  return "a question";
}

function optionsOf(field: string, values: string[], vocabulary: Vocabulary): string[] {
  const parts = field === "paths" || field.startsWith("path.");
  return values.map(
    (value) =>
      vocabulary.option?.(field, value) ??
      // An intake option is its own label; a part is an id, and an id the
      // instrument does not know must not reach a sentence (NFR-9).
      (parts ? "a part nobody offers" : value),
  );
}

function leaf(condition: LeafCondition, vocabulary: Vocabulary): string {
  const field = condition.field;
  const raw = nameOf(field, vocabulary);
  // A label written as a question reads as one: "the answer to “Does this
  // use AI?” is “Yes”", not "Does this use AI? is “Yes”". Answered and
  // blank are about the question itself, so they take the label bare.
  const asked = "hasValue" in condition || "blank" in condition;
  const name = raw.endsWith("?") && !asked ? `the answer to ${quote(raw)}` : raw;
  if (asked && raw.endsWith("?")) {
    return `${quote(raw)} is ${"blank" in condition ? "blank" : "answered"}`;
  }
  const gate = field.startsWith("gate.");
  const parts = field === "paths" || field.startsWith("path.");

  if ("hasValue" in condition) return `${name} is answered`;
  if ("blank" in condition) return `${name} is blank`;
  if ("equalsAny" in condition) {
    const values = condition.equalsAny;
    if (gate && values.length === 1 && values[0] === "Yes") return `${name} applies`;
    if (gate && values.length === 1 && values[0] === "No") return `${name} does not apply`;
    // A band reads bare, as severityAtLeast renders it.
    return `${name} is ${list(optionsOf(field, values, vocabulary), "or", field.startsWith("severity."))}`;
  }
  if ("notEqualsAny" in condition) {
    const values = condition.notEqualsAny;
    if (gate && values.length === 1 && values[0] === "Yes") return `${name} does not apply`;
    return `${name} is not ${list(optionsOf(field, values, vocabulary), "or")}`;
  }
  if ("includesAny" in condition) {
    const said = list(optionsOf(field, condition.includesAny, vocabulary), "or");
    return parts ? `${said} ${condition.includesAny.length === 1 ? "is a part that applies" : "are among the parts that apply"}` : `${name} includes ${said}`;
  }
  if ("excludesAll" in condition) {
    const said = list(optionsOf(field, condition.excludesAll, vocabulary), "and");
    return parts ? `none of ${said} is a part that applies` : `${name} includes neither ${said}`;
  }
  if ("atLeast" in condition) return `${name} is at least ${condition.atLeast}`;
  if ("atMost" in condition) return `${name} is at most ${condition.atMost}`;
  return `${name} is ${condition.severityAtLeast} or higher`;
}

/**
 * The sentence, without a capital or a full stop, so it can sit after
 * "Shown because" or stand alone. Nested groups are bracketed only where
 * the reading would otherwise be ambiguous.
 */
export function describe(condition: Condition, vocabulary: Vocabulary): string {
  if ("all" in condition) {
    return condition.all.map((c) => wrap(c, "any", vocabulary)).join(" and ");
  }
  if ("any" in condition) {
    return condition.any.map((c) => wrap(c, "all", vocabulary)).join(" or ");
  }
  if ("not" in condition) {
    return `it is not the case that ${wrap(condition.not, "both", vocabulary)}`;
  }
  return leaf(condition, vocabulary);
}

function wrap(
  condition: Condition,
  bracketWhen: "all" | "any" | "both",
  vocabulary: Vocabulary,
): string {
  const said = describe(condition, vocabulary);
  const grouped =
    (bracketWhen === "both" && ("all" in condition || "any" in condition)) ||
    bracketWhen in condition;
  return grouped ? `(${said})` : said;
}

/** "Shown because …" — the reveal note, ready for a screen. */
export function shownBecause(condition: Condition, vocabulary: Vocabulary): string {
  return `Shown because ${describe(condition, vocabulary)}.`;
}
