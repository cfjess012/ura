/**
 * §4.4, §4.5 · the handoff report.
 *
 * The rule everything here defends: **a report is a reading of the record,
 * never a new fact.** Nothing in it may be true unless something in the
 * record made it true — that is what lets it be shown to a leadership
 * audience without a caveat.
 */
import { describe, expect, it } from "vitest";
import {
  groundedScenarios,
  reportFrom,
  standingLine,
  type Report,
} from "@/lib/report";
import type { GateState } from "@/lib/instrument";
import { OBJECTIVES } from "@/lib/tier3";

const mfa = OBJECTIVES.find((o) => o.questionId === "t3.t3_iam_02")!;
const pam = OBJECTIVES.find((o) => o.questionId === "t3.t3_iam_03")!;

const state = (name: string, over: Partial<GateState> = {}): GateState =>
  ({
    category: {
      key: name.toLowerCase(),
      name,
      short: name,
    } as GateState["category"],
    answer: "Yes",
    settled: false,
    fromIntake: false,
    because: "you told us so",
    origin: null,
    ...over,
  }) as GateState;

const build = (over: Partial<Parameters<typeof reportFrom>[0]> = {}) =>
  reportFrom({
    activity: "A claims triage assistant from Sable.",
    purpose: "Cut the time a handler spends reading a new claim.",
    states: [state("Third party"), state("Operational", { answer: "No" })],
    severityBands: [{ name: "Level of Provider Access", band: "High" }],
    required: [mfa, pam],
    values: {
      [mfa.questionId]: { answer: "Yes", note: "Enforced for admins." },
      [pam.questionId]: { answer: "No", note: "No vault in front of it." },
    },
    findings: [
      {
        questionId: pam.questionId,
        objective: pam.id,
        objectiveName: pam.name,
        kind: "non-compliance",
        note: "No vault in front of it.",
        citation: {
          policyRef: "IAM-STD-004",
          clauseId: "IAM-STD-004 §3.9",
          clauseText: "Privileged accounts shall be individually attributable.",
          expected: "Yes",
        },
      },
    ],
    asksNothingFurther: () => false,
    ...over,
  });

describe("the report reads the record and adds nothing", () => {
  it("counts what applies and what was ruled out", () => {
    const report = build();
    expect(report.counts.areasApplying).toBe(1);
    expect(report.counts.areasClosed).toBe(1);
  });

  it("carries each control with its answer, its note and its authority", () => {
    const report = build();
    const control = report.controls.find((c) => c.name === mfa.name)!;
    expect(control.answer).toBe("Yes");
    expect(control.note).toBe("Enforced for admins.");
    // The clause that requires it, so the reviewer sees the authority.
    expect(control.authority).toBe("IAM-STD-004 §3.4");
  });

  it("names what nobody answered rather than quietly counting it done", () => {
    const report = build({
      values: { [mfa.questionId]: { answer: "Yes", note: "" } },
    });
    expect(report.unanswered).toEqual([pam.name]);
    expect(report.counts.controlsAnswered).toBe(1);
    expect(report.counts.controlsRequired).toBe(2);
  });

  it("carries a breach with the clause it breaches", () => {
    const finding = build().findings[0]!;
    expect(finding.kind).toBe("non-compliance");
    expect(finding.clause).toBe("IAM-STD-004 §3.9");
    expect(finding.clauseText).toMatch(/individually attributable/);
  });

  it("marks a quiet area as recorded, not as work", () => {
    const report = build({ asksNothingFurther: () => true });
    expect(report.areasThatApply[0]!.standing).toBe("recorded");
  });
});

describe("the standing line says the true thing in one sentence", () => {
  it("says so plainly when nothing is outstanding", () => {
    expect(standingLine(build({ findings: [] }))).toMatch(
      /nothing outstanding/,
    );
  });

  it("counts findings, and says how many are against a policy", () => {
    expect(standingLine(build())).toMatch(
      /1 finding, 1 of them against a policy clause/,
    );
  });
});

describe("a proposed scenario must cite something that is really there", () => {
  const report: Report = build();
  const cite = (from: string[]) => [
    {
      scenario: "A leaver keeps admin access.",
      ask: "How fast is access revoked?",
      from,
    },
  ];

  it("keeps a scenario built on a control in the report", () => {
    expect(groundedScenarios(cite([pam.name]), report)).toHaveLength(1);
  });

  it("drops one citing something that is not there", () => {
    // Not a weaker scenario — one built on nothing. §4.4 requires the
    // citation, so a bad citation means it does not appear at all.
    expect(groundedScenarios(cite(["Disaster Recovery"]), report)).toEqual([]);
  });

  it("drops one that cites nothing at all", () => {
    expect(groundedScenarios(cite([]), report)).toEqual([]);
  });

  it("drops an empty scenario or an empty question", () => {
    expect(
      groundedScenarios(
        [{ scenario: "", ask: "How fast?", from: [pam.name] }],
        report,
      ),
    ).toEqual([]);
    expect(
      groundedScenarios(
        [{ scenario: "A leaver keeps access.", ask: "  ", from: [pam.name] }],
        report,
      ),
    ).toEqual([]);
  });

  it("requires EVERY citation to be real, not just one of them", () => {
    expect(
      groundedScenarios(cite([pam.name, "Invented Control"]), report),
    ).toEqual([]);
  });

  it("matches a citation however it is cased", () => {
    expect(
      groundedScenarios(cite([pam.name.toUpperCase()]), report),
    ).toHaveLength(1);
  });
});
