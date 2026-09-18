/**
 * What the lint may assume about each field, built from plain data (§6.3).
 *
 * One builder rather than one per validator: the instrument validator
 * passes the edition it is validating, the Tier-3 validator passes the
 * shipped areas, and an authoring screen (S24) passes a draft. Nothing here
 * imports an instrument module, so the modules that import this one cannot
 * form a cycle.
 *
 * Pure: no framework, no driver, no environment.
 */
import { BANDS } from "./conditions";
import type { FieldKind, KnownFields } from "./condition-lint";

export type KnownArea = {
  key: string;
  pathQuestion?: { options: Array<{ id: string }> };
  derivedPaths?: Array<{ id: string }>;
};

export type KnownIntakeField = {
  id: string;
  type: string;
  options?: string[];
  /** A reference list accepts an off-list answer (FR-30): not a closed set. */
  list?: string;
};

const GATE = "gate.";
const SEVERITY = "severity.";
const PATH = "path.";

export function knownFields(input: {
  areas: KnownArea[];
  intake: KnownIntakeField[];
  /** Severity question ids a rule may read; empty where none are resolved. */
  severityQuestionIds: string[];
  /** False where paths are not resolved yet — a gate pre-fill, say. */
  canSeePaths: boolean;
  allowsBlank: boolean;
}): KnownFields {
  const area = (key: string) => input.areas.find((a) => a.key === key) ?? null;
  const field = (id: string) => input.intake.find((f) => f.id === id) ?? null;
  const severity = new Set(input.severityQuestionIds);
  const pathIdsOf = (a: KnownArea) => [
    ...(a.pathQuestion?.options ?? []).map((o) => o.id),
    ...(a.derivedPaths ?? []).map((d) => d.id),
  ];
  const everyPath = input.areas.flatMap(pathIdsOf);

  return {
    allowsBlank: input.allowsBlank,
    kind(id): FieldKind {
      if (id.startsWith(GATE)) return area(id.slice(GATE.length)) ? "gate" : "unknown";
      if (id.startsWith(SEVERITY)) return severity.has(id.slice(SEVERITY.length)) ? "severity" : "unknown";
      if (id === "paths" || id.startsWith(PATH)) {
        if (!input.canSeePaths) return "unknown";
        return id === "paths" || area(id.slice(PATH.length)) ? "paths" : "unknown";
      }
      const f = field(id);
      if (!f) return "unknown";
      if (f.type === "multi" || f.type === "pick-many") return "multi";
      if (f.type === "choice" || f.type === "select") return "choice";
      // A threshold needs a quantity. No shipped field is one yet; the kind
      // exists so the first numeric field lints as one, and until then a
      // threshold on a date or a name is refused rather than false forever.
      if (f.type === "number") return "number";
      return "text";
    },
    options(id) {
      if (id.startsWith(GATE)) return ["Yes", "No"];
      if (id.startsWith(SEVERITY)) return [...BANDS];
      if (id === "paths") return everyPath;
      if (id.startsWith(PATH)) {
        const a = area(id.slice(PATH.length));
        return a ? pathIdsOf(a) : null;
      }
      const f = field(id);
      return f?.options && !f.list ? f.options : null;
    },
  };
}
