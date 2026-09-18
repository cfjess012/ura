/**
 * §6.3 · the one predicate, at its full vocabulary (FR-49).
 *
 * Two rules this file exists to hold. The four operators the instrument
 * already uses behave as before, with one named change — a scalar now
 * satisfies includes/excludes as a list of one (§19). And positive evidence only:
 * an unanswered field satisfies nothing — not a negative, not a negation —
 * because otherwise a rule could waive a control by somebody leaving a box
 * empty. `blank` is the one deliberate exception, and the lint decides
 * where it may appear.
 */
import { describe, expect, it } from "vitest";
import { fieldsOf, leavesOf, matches, type Condition } from "@/lib/conditions";

const answers = {
  usesAi: "Yes",
  dataElements: ["Customer PI", "Employee PI"],
  headcount: "12",
  "gate.ai": "Yes",
  "severity.sev.tpr_la_1": "Medium",
  empty: "",
};

describe("the operators the instrument already uses are unchanged", () => {
  it("hasValue, equalsAny, includesAny, severityAtLeast", () => {
    expect(matches({ field: "usesAi", hasValue: true }, answers)).toBe(true);
    expect(matches({ field: "empty", hasValue: true }, answers)).toBe(false);
    expect(matches({ field: "usesAi", equalsAny: ["Yes", "Maybe"] }, answers)).toBe(true);
    expect(matches({ field: "usesAi", equalsAny: ["No"] }, answers)).toBe(false);
    expect(matches({ field: "dataElements", includesAny: ["Employee PI"] }, answers)).toBe(true);
    expect(matches({ field: "dataElements", includesAny: ["Applicant PI"] }, answers)).toBe(false);
    expect(matches({ field: "severity.sev.tpr_la_1", severityAtLeast: "Medium" }, answers)).toBe(true);
    expect(matches({ field: "severity.sev.tpr_la_1", severityAtLeast: "High" }, answers)).toBe(false);
  });

  it("a single answer satisfies includes and excludes as a list of one (§19) — the one change", () => {
    // The old predicate read a scalar as an empty list, so includesAny on a
    // single-choice field was false forever. No shipped rule reads one that
    // way (the lint refuses it), and §19 names the scalar case explicitly.
    expect(matches({ field: "usesAi", includesAny: ["Yes"] }, answers)).toBe(true);
    expect(matches({ field: "usesAi", excludesAll: ["No"] }, answers)).toBe(true);
    expect(matches({ field: "usesAi", excludesAll: ["Yes"] }, answers)).toBe(false);
  });

  it("does not throw on a field that is not an answer at all", () => {
    expect(matches({ field: "constructor", hasValue: true }, {})).toBe(false);
    expect(matches({ field: "toString", blank: true }, {})).toBe(true);
  });

  it("an unknown band is not a low one", () => {
    expect(
      matches({ field: "severity.sev.tpr_la_1", severityAtLeast: "Low" }, { "severity.sev.tpr_la_1": "Severe" }),
    ).toBe(false);
  });
});

describe("the operators §6.3 promised", () => {
  it("notEqualsAny and excludesAll read an answer, and only an answer", () => {
    expect(matches({ field: "usesAi", notEqualsAny: ["No"] }, answers)).toBe(true);
    expect(matches({ field: "usesAi", notEqualsAny: ["Yes"] }, answers)).toBe(false);
    expect(matches({ field: "dataElements", excludesAll: ["Applicant PI"] }, answers)).toBe(true);
    expect(matches({ field: "dataElements", excludesAll: ["Employee PI"] }, answers)).toBe(false);
    // Positive evidence only: nothing was said, so nothing is "not" anything.
    expect(matches({ field: "nothing", notEqualsAny: ["No"] }, answers)).toBe(false);
    expect(matches({ field: "nothing", excludesAll: ["X"] }, answers)).toBe(false);
    expect(matches({ field: "empty", notEqualsAny: ["No"] }, answers)).toBe(false);
  });

  it("blank is the one operator that reads absence", () => {
    expect(matches({ field: "nothing", blank: true }, answers)).toBe(true);
    expect(matches({ field: "empty", blank: true }, answers)).toBe(true);
    expect(matches({ field: "usesAi", blank: true }, answers)).toBe(false);
  });

  it("numeric thresholds read a number the person typed, not a list or a word", () => {
    expect(matches({ field: "headcount", atLeast: 10 }, answers)).toBe(true);
    expect(matches({ field: "headcount", atLeast: 13 }, answers)).toBe(false);
    expect(matches({ field: "headcount", atMost: 12 }, answers)).toBe(true);
    expect(matches({ field: "usesAi", atLeast: 0 }, answers)).toBe(false);
    expect(matches({ field: "dataElements", atLeast: 1 }, answers)).toBe(false);
  });

  it("all, any and not nest", () => {
    const both: Condition = {
      all: [{ field: "usesAi", equalsAny: ["Yes"] }, { field: "gate.ai", equalsAny: ["Yes"] }],
    };
    const either: Condition = {
      any: [{ field: "usesAi", equalsAny: ["No"] }, { field: "headcount", atLeast: 10 }],
    };
    expect(matches(both, answers)).toBe(true);
    expect(matches(either, answers)).toBe(true);
    expect(matches({ all: [both, { not: either }] }, answers)).toBe(false);
    expect(matches({ any: [] }, answers)).toBe(false);
    expect(matches({ all: [] }, answers)).toBe(true);
  });

  it("a negation needs an answer to negate", () => {
    // `not X` on an unanswered field would make an empty form satisfy a
    // rule — the waiver-by-omission the positive-evidence rule forbids.
    expect(matches({ not: { field: "usesAi", equalsAny: ["No"] } }, answers)).toBe(true);
    expect(matches({ not: { field: "nothing", equalsAny: ["No"] } }, answers)).toBe(false);
    expect(
      matches({ not: { all: [{ field: "usesAi", equalsAny: ["Yes"] }, { field: "nothing", hasValue: true }] } }, answers),
    ).toBe(false);
  });
});

describe("reading a condition without evaluating it", () => {
  it("lists every leaf and every field once", () => {
    const rule: Condition = {
      all: [
        { field: "usesAi", equalsAny: ["Yes"] },
        { any: [{ field: "usesAi", notEqualsAny: ["No"] }, { not: { field: "gate.ai", hasValue: true } }] },
      ],
    };
    expect(leavesOf(rule)).toHaveLength(3);
    expect(fieldsOf(rule)).toEqual(["usesAi", "gate.ai"]);
  });
});
