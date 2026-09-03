/**
 * The shipped instrument's own words for the fields a condition can read
 * (NFR-23, NFR-9) — what `describe()` speaks with — and what the lint may
 * assume about them.
 *
 * S24's authoring screen builds the same two objects from a draft edition
 * instead; `knownFields` takes plain data for exactly that reason.
 *
 * Pure: reads the data modules, touches no framework, driver or env.
 */
import { knownFields } from "./condition-known";
import type { KnownFields } from "./condition-lint";
import type { Vocabulary } from "./condition-text";
import { ALL_FIELDS } from "./intake";
import { CATEGORIES } from "./instrument";
import { SEVERITY_QUESTIONS } from "./severity";

const GATE = "gate.";
const SEVERITY = "severity.";
const PATH = "path.";

const category = (key: string) => CATEGORIES.find((c) => c.key === key) ?? null;

/** Every path option and derived path the instrument names, by id. */
const PATH_LABEL = new Map<string, string>(
  CATEGORIES.flatMap((c) => [
    ...(c.pathQuestion?.options ?? []).map((o) => [o.id, o.label] as const),
    ...(c.derivedPaths ?? []).map((d) => [d.id, d.name] as const),
  ]),
);

export function instrumentVocabulary(): Vocabulary {
  return {
    field(id) {
      if (id.startsWith(GATE)) {
        const c = category(id.slice(GATE.length));
        // "the AI & Model Risk risk area" stuttered; a name that already
        // says Risk is an area, full stop.
        return c ? (/\brisk\b/i.test(c.name) ? `the ${c.name} area` : `the ${c.name} risk area`) : null;
      }
      if (id.startsWith(SEVERITY)) {
        const q = SEVERITY_QUESTIONS.find((s) => s.questionId === id.slice(SEVERITY.length));
        return q?.name ?? null;
      }
      if (id === "paths") return "the parts that apply";
      if (id.startsWith(PATH)) {
        const c = category(id.slice(PATH.length));
        return c ? `the parts of ${c.name} that apply` : null;
      }
      return ALL_FIELDS.find((f) => f.id === id)?.label ?? null;
    },
    option(field, value) {
      if (field === "paths" || field.startsWith(PATH)) {
        return PATH_LABEL.get(value) ?? null;
      }
      return null;
    },
  };
}

/** The lint's knowledge of the shipped instrument. */
export function instrumentFields(options: {
  canSeePaths: boolean;
  allowsBlank: boolean;
}): KnownFields {
  return knownFields({
    areas: CATEGORIES,
    intake: ALL_FIELDS,
    severityQuestionIds: SEVERITY_QUESTIONS.map((q) => q.questionId),
    ...options,
  });
}
