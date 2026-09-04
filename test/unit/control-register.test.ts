/**
 * G-87 · one definition of what state a control is in.
 *
 * The screen showed the same assessment's controls three ways, each with its
 * own idea of their state. These pin the single definition — and in
 * particular the two states that were previously invisible: a Partial or No
 * is already a gap, and a control whose platform attestation lapsed came back
 * as a question with nothing saying why.
 */
import { describe, expect, it } from "vitest";
import {
  REGISTER_STATES,
  STATE_LABEL,
  registerFor,
  registerLine,
} from "@/lib/control-register";
import { PLATFORMS_QUESTION, inheritanceFor, inheritedAnswer } from "@/lib/inheritance";
import { CATEGORIES } from "@/lib/instrument";
import { SEVERITY_QUESTIONS } from "@/lib/severity";
import { accumulatedFor } from "@/lib/severity";
import { objectivesFor } from "@/lib/tier3";

const now = new Date("2026-09-04T12:00:00Z");
const said = (value: unknown) => ({ value, source: "person", confirmed: true });

/** Third party applies, logical access ticked, provider access High. */
const thirdParty = CATEGORIES.find((c) => c.key === "third-party")!;
const provider = SEVERITY_QUESTIONS.find((q) => q.path === "TPR_LA")!.questionId;
const base = {
  [thirdParty.questionId]: said("Yes"),
  [thirdParty.pathQuestion!.questionId]: said(["TPR_LA"]),
  [provider]: said("High"),
};

type Answers = Record<string, { value: unknown; source: string; confirmed: boolean }>;

const build = (stored: Answers) => {
  const owed = accumulatedFor(stored, {});
  return registerFor({
    owed,
    stored,
    inheritance: inheritanceFor({ stored, intake: {}, now }),
  });
};
const rowFor = (
  register: ReturnType<typeof build>,
  name: string | RegExp,
) =>
  register.rows.find((r) =>
    typeof name === "string" ? r.name === name : name.test(r.name),
  )!;

describe("the register as one object", () => {
  it("holds every required control exactly once, grouped by family in order", () => {
    const register = build(base);
    expect(register.total).toBeGreaterThan(0);
    expect(register.rows).toHaveLength(register.total);
    expect(new Set(register.rows.map((r) => r.objective)).size).toBe(register.total);
    // Families are named, never coded — the code may not reach a screen.
    for (const group of register.groups) {
      expect(group.name).not.toBe(group.family);
      expect(group.name.length).toBeGreaterThan(3);
    }
    // Identity comes before AI: alphabetical would put the rarest family
    // above the one nearly every assessment meets.
    const families = register.groups.map((g) => g.family);
    if (families.includes("IAM") && families.includes("AI")) {
      expect(families.indexOf("IAM")).toBeLessThan(families.indexOf("AI"));
    }
    expect(register.counts.inherited + register.counts["to-answer"]).toBeLessThanOrEqual(
      register.total,
    );
  });

  it("carries the provision, so the screen can say why it was not asked", () => {
    const register = build(base);
    const identity = register.rows.filter((r) => r.family === "IAM");
    expect(identity.length).toBeGreaterThan(0);
    expect(identity.every((r) => r.provision === "common")).toBe(true);
  });

  it("names every reason the assessment requires it, without repeating one", () => {
    const register = build(base);
    const withReasons = register.rows.filter((r) => r.because.length > 0);
    expect(withReasons.length).toBeGreaterThan(0);
    for (const row of withReasons) {
      expect(new Set(row.because).size).toBe(row.because.length);
    }
  });
});

describe("the six states", () => {
  it("labels each one in words, and orders them by what needs attention", () => {
    for (const state of REGISTER_STATES) {
      expect(STATE_LABEL[state].length).toBeGreaterThan(2);
      expect(STATE_LABEL[state]).not.toContain("-");
    }
    // A gap outranks everything: it is already a finding.
    expect(REGISTER_STATES[0]).toBe("gap");
    expect(REGISTER_STATES.indexOf("to-answer")).toBeLessThan(
      REGISTER_STATES.indexOf("answered"),
    );
  });

  it("starts everything as to-answer, or as recorded when nothing asks it", () => {
    const register = build(base);
    expect(register.counts.inherited).toBe(0);
    expect(register.counts.answered).toBe(0);
    expect(register.counts.gap).toBe(0);
    const asked = new Set(
      objectivesFor(register.rows.map((r) => r.objective)).map((o) => o.id),
    );
    for (const row of register.rows) {
      expect(row.state).toBe(asked.has(row.objective) ? "to-answer" : "no-question");
      expect(row.questionId === null).toBe(!asked.has(row.objective));
    }
    // Only what a person can act on counts as owed (§24.9).
    expect(register.owed).toBe(register.counts["to-answer"]);
    expect(register.owed).toBeLessThan(register.total);
  });

  it("reads Partial and No as gaps, and Yes and N-A as answered", () => {
    const asked = objectivesFor(
      build(base).rows.map((r) => r.objective),
    );
    const [first, second] = asked;
    const register = build({
      ...base,
      [first!.questionId]: said({ answer: "No", note: "not in place" }),
      [second!.questionId]: said({ answer: "Yes", note: "" }),
    });
    expect(rowFor(register, first!.name).state).toBe("gap");
    expect(rowFor(register, first!.name).answer).toBe("No");
    expect(rowFor(register, first!.name).note).toBe("not in place");
    expect(rowFor(register, second!.name).state).toBe("answered");
    expect(register.counts.gap).toBe(1);
  });

  it("counts an N-A as answered rather than as a gap", () => {
    const [first] = objectivesFor(build(base).rows.map((r) => r.objective));
    const register = build({
      ...base,
      [first!.questionId]: said({ answer: "N-A", note: "no such interface" }),
    });
    expect(rowFor(register, first!.name).state).toBe("answered");
    expect(register.counts.gap).toBe(0);
  });
});

describe("what a platform changes", () => {
  const chosen: Answers = { ...base, [PLATFORMS_QUESTION]: said(["PL_ENTRA"]) };

  it("leaves a covered control still to answer until its answer is the inherited one", () => {
    // An offer is not an answer (G-85). Before confirming, the control is
    // owed; the register must not quietly discharge it.
    const offered = build(chosen);
    const covered = inheritanceFor({ stored: chosen, intake: {}, now }).covered;
    expect(covered.length).toBeGreaterThan(0);
    for (const one of covered) {
      const row = offered.rows.find((r) => r.objective === one.objective)!;
      expect(row.state).toBe("to-answer");
    }

    const confirmed: Answers = { ...chosen };
    for (const one of covered) {
      const objective = objectivesFor([one.objective])[0];
      if (objective) confirmed[objective.questionId] = said(inheritedAnswer(one));
    }
    const after = build(confirmed);
    for (const one of covered) {
      const row = after.rows.find((r) => r.objective === one.objective)!;
      expect(row.state).toBe("inherited");
      expect(row.provider!.name).toBe("Microsoft Entra ID");
      expect(row.provider!.attestedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(after.counts.inherited).toBe(covered.length);
    expect(after.owed).toBe(offered.owed - covered.length);
  });

  it("marks a control whose attestation lapsed, rather than letting it come back silently", () => {
    // Okta's attestation ran out in August. Its controls are owed again, and
    // a question that returns with no reason reads as a malfunction.
    const register = build({ ...base, [PLATFORMS_QUESTION]: said(["PL_OKTA"]) });
    const lapsed = register.rows.filter((r) => r.state === "lapsed");
    expect(lapsed.length).toBeGreaterThan(0);
    for (const row of lapsed) {
      expect(row.provider!.name).toBe("Okta");
      expect(row.answer).toBeNull();
    }
    // Lapsed is still work somebody has to do.
    expect(register.owed).toBe(register.counts["to-answer"] + lapsed.length);
  });

  it("prefers a person's own answer over the platform that offered one", () => {
    const covered = inheritanceFor({ stored: chosen, intake: {}, now }).covered[0]!;
    const objective = objectivesFor([covered.objective])[0]!;
    const register = build({
      ...chosen,
      [objective.questionId]: said({ answer: "No", note: "not switched on for us" }),
    });
    const row = register.rows.find((r) => r.objective === covered.objective)!;
    expect(row.state).toBe("gap");
    expect(row.note).toBe("not switched on for us");
  });
});

describe("the line a person reads at the top", () => {
  it("counts what is left for them, never a total they cannot drive to zero", () => {
    const register = build(base);
    const line = registerLine(register);
    expect(line).toMatch(/^\d+ controls — /);
    expect(line).toContain(`${register.owed} still to answer`);
    expect(line).toContain("recorded for a reviewer");
    expect(line).not.toMatch(/T[0-9]-[A-Z]{2,5}-[0-9]/);
  });

  it("says so plainly when nothing is required yet", () => {
    expect(registerLine(build({}))).toMatch(/Nothing is required here yet/);
  });
});
