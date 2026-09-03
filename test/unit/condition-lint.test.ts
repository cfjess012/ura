/**
 * §6.3, §8 · a rule that cannot fire, or cannot fail, is refused at import.
 */
import { describe, expect, it } from "vitest";
import { lintCondition, lintConditions } from "@/lib/condition-lint";
import { knownFields } from "@/lib/condition-known";
import { instrumentFields } from "@/lib/condition-vocabulary";
import { ALL_FIELDS, validateReveals } from "@/lib/intake";
import { CATEGORIES } from "@/lib/instrument";
import { OBJECTIVES } from "@/lib/tier3";
import type { Condition } from "@/lib/conditions";

const routing = instrumentFields({ canSeePaths: true, allowsBlank: false });
const intake = instrumentFields({ canSeePaths: false, allowsBlank: true });
const lint = (c: Condition, known = routing) => lintCondition(c, "rule", known);
/** No shipped intake field is a quantity yet; this is what one will lint as. */
const numeric = knownFields({
  areas: [],
  intake: [{ id: "n", type: "number" }],
  severityQuestionIds: [],
  canSeePaths: false,
  allowsBlank: false,
});

describe("a rule that can never fire", () => {
  it("names an option the field never offers", () => {
    expect(lint({ field: "usesAi", equalsAny: ["Yep"] })).toEqual([
      'rule: "usesAi" never offers "Yep" — the rule can never fire',
    ]);
    expect(lint({ field: "paths", includesAny: ["NOT_A_PATH"] })[0]).toMatch(/never offers/);
    expect(lint({ field: "gate.ai", equalsAny: ["Maybe"] })[0]).toMatch(/never offers "Maybe"/);
  });

  it("names nothing at all", () => {
    expect(lint({ field: "usesAi", equalsAny: [] })[0]).toMatch(/names no option/);
  });

  it("reads a field that does not exist", () => {
    expect(lint({ field: "nope", hasValue: true })[0]).toMatch(/not an intake field, a gate, a path, or a severity question/);
    expect(lint({ field: "paths", includesAny: ["PRIV"] }, intake)[0]).toMatch(/not an intake field/);
  });

  it("uses the wrong shape of operator for the field", () => {
    expect(lint({ field: "dataElements", equalsAny: ["Customer personal information"] })[0]).toMatch(/holds several answers/);
    expect(lint({ field: "usesAi", includesAny: ["Yes"] })[0]).toMatch(/holds one answer/);
    expect(lint({ field: "usesAi", atLeast: 3 })[0]).toMatch(/as a number/);
    expect(lint({ field: "usesAi", severityAtLeast: "High" })[0]).toMatch(/as a severity/);
  });
});

describe("a rule that contradicts itself", () => {
  it("two equals on one field with nothing in common", () => {
    expect(
      lint({ all: [{ field: "usesAi", equalsAny: ["Yes"] }, { field: "usesAi", equalsAny: ["No"] }] }),
    ).toEqual(['rule: "usesAi" is required to equal two different things at once']);
  });

  it("equal and not-equal the same value", () => {
    expect(
      lint({ all: [{ field: "usesAi", equalsAny: ["Yes"] }, { field: "usesAi", notEqualsAny: ["Yes"] }] })[0],
    ).toMatch(/must equal a value the same rule says it must not/);
  });

  it("a floor above a ceiling", () => {
    expect(lint({ all: [{ field: "n", atLeast: 5 }, { field: "n", atMost: 2 }] }, numeric)[0]).toMatch(
      /at least 5 and at most 2/,
    );
  });

  it("includes X and excludes X on one field (§19)", () => {
    expect(
      lint({
        all: [
          { field: "dataElements", includesAny: ["Customer personal information"] },
          { field: "dataElements", excludesAll: ["Customer personal information"] },
        ],
      })[0],
    ).toMatch(/must include .* and exclude it/);
    // Through the list form the validators use, too.
    expect(
      lintConditions(
        [
          { field: "dataElements", includesAny: ["Customer personal information"] },
          { field: "dataElements", excludesAll: ["Customer personal information"] },
        ],
        "rule",
        routing,
      )[0],
    ).toMatch(/must include .* and exclude it/);
  });

  it("a contradiction across operator shapes, now that one answer is a list of one", () => {
    expect(lint({ all: [{ field: "gate.ai", equalsAny: ["Yes"] }, { field: "gate.ai", excludesAll: ["Yes"] }] })[0]).toMatch(
      /must equal a value the same rule says it must not/,
    );
    expect(
      lint({ all: [{ field: "paths", includesAny: ["PRIV"] }, { field: "paths", excludesAll: ["PRIV", "SR_EXT"] }] })[0],
    ).toMatch(/must equal a value|must include/);
    // Still satisfiable: excluded only one of two ways in.
    expect(lint({ all: [{ field: "paths", includesAny: ["PRIV", "SR_EXT"] }, { field: "paths", excludesAll: ["PRIV"] }] })).toEqual([]);
  });

  it("a rule beside its own negation, and a tautology in any", () => {
    const yes: Condition = { field: "usesAi", equalsAny: ["Yes"] };
    expect(lint({ all: [yes, { not: yes }] })[0]).toMatch(/nothing satisfies it/);
    expect(lint({ any: [yes, { not: yes }] })[0]).toMatch(/holds for every answered form/);
    expect(lint({ any: [yes, { field: "usesAi", notEqualsAny: ["Yes"] }] })[0]).toMatch(/cannot fail/);
  });

  it("blank and answered at once", () => {
    expect(
      lint({ all: [{ field: "vendorNames", blank: true }, { field: "vendorNames", hasValue: true }] }, intake)[0],
    ).toMatch(/blank and answered at once/);
  });

  it("a negation of “answered”", () => {
    expect(lint({ not: { field: "usesAi", hasValue: true } })[0]).toMatch(/can never hold/);
  });
});

describe("where blank may be read (G-77)", () => {
  it("is refused in routing", () => {
    expect(lint({ field: "vendorNames", blank: true })[0]).toMatch(/may not fire on an unanswered field/);
  });
  it("is allowed in intake visibility", () => {
    expect(lint({ field: "vendorNames", blank: true }, intake)).toEqual([]);
  });
});

describe("a nest that decides nothing", () => {
  it("an empty group, and a rule written twice", () => {
    expect(lint({ any: [] })[0]).toMatch(/empty any/);
    expect(lint({ all: [{ field: "usesAi", equalsAny: ["Yes"] }, { field: "usesAi", equalsAny: ["Yes"] }] })[0]).toMatch(
      /appears twice/,
    );
  });

  it("an empty group nested inside an authored list is refused, not filtered (verifier F1)", () => {
    // The validators lint a list of conditions; the wrapper used to drop
    // every "decides nothing" message with its own.
    expect(lintConditions([{ any: [] }], "rule", routing)).toEqual(["rule: an empty any — it decides nothing"]);
    expect(lintConditions([{ field: "usesAi", equalsAny: ["Yes"] }, { all: [] }], "rule", routing)[0]).toMatch(/empty all/);
  });

  it("a duplicate is a duplicate however its keys are ordered", () => {
    expect(
      lint({ all: [{ field: "usesAi", equalsAny: ["Yes"] }, { equalsAny: ["Yes"], field: "usesAi" } as Condition] })[0],
    ).toMatch(/appears twice/);
  });
});

describe("the shape of a field decides the operator", () => {
  it("equals on the parts that apply can never fire — they are a list", () => {
    expect(lint({ field: "paths", equalsAny: ["PRIV"] })[0]).toMatch(/holds several answers/);
  });
  it("a threshold reads only a quantity", () => {
    expect(lint({ field: "projectName", atLeast: 1 })[0]).toMatch(/as a number, and it is not one/);
    expect(lint({ field: "targetGoLive", atMost: 1 })[0]).toMatch(/as a number, and it is not one/);
    expect(lint({ field: "n", atLeast: 1 }, numeric)).toEqual([]);
  });
});

describe("the shipped instrument lints clean", () => {
  it("every gate rule, derived path and follow-up", () => {
    const gates = instrumentFields({ canSeePaths: false, allowsBlank: false });
    for (const c of CATEGORIES) {
      for (const rule of c.prefill ?? []) expect(lintConditions([rule.when], c.key, gates)).toEqual([]);
      for (const d of c.derivedPaths ?? []) expect(lintConditions(d.when, d.id, routing)).toEqual([]);
    }
    for (const o of OBJECTIVES) {
      for (const child of o.children) expect(lintConditions(child.when ?? [], child.id, routing)).toEqual([]);
    }
  });

  it("every intake reveal", () => {
    for (const field of ALL_FIELDS) {
      if (!field.conditional) continue;
      const { visibleWhen, ...rule } = field.conditional;
      expect(lintCondition({ field: visibleWhen, ...rule } as Condition, field.id, intake)).toEqual([]);
    }
  });
});

describe("the intake sections have a validator of their own", () => {
  it("refuses a reveal that reads an option the field never offers", () => {
    const fields = [
      { id: "usesAi", label: "Uses AI?", type: "choice", options: ["Yes", "No"] },
      { id: "aiUseCase", label: "What does it do?", type: "textarea", conditional: { visibleWhen: "usesAi", equalsAny: ["Yep"] } },
    ] as unknown as Parameters<typeof validateReveals>[0];
    expect(() => validateReveals(fields)).toThrow(/Intake is invalid[\s\S]*never offers "Yep"/);
  });
  it("accepts a reveal on a blank box — the one place blank may be read", () => {
    const fields = [
      { id: "vendorNames", label: "Vendors", type: "pick-many", list: "vendors" },
      { id: "note", label: "A note", type: "note", conditional: { visibleWhen: "vendorNames", blank: true } },
    ] as unknown as Parameters<typeof validateReveals>[0];
    expect(() => validateReveals(fields)).not.toThrow();
  });
});
