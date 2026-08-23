/**
 * S4 — Tier 2. The §19 acceptance criteria for severity and control
 * accumulation, written as tests before the layer is called done.
 */
import { describe, expect, it } from "vitest";
import { matches } from "../../src/lib/conditions";
import { ALL_PATHS, SEVERITY_OF, assessmentLookup } from "../../src/lib/engine";
import {
  BANDS,
  SEVERITY,
  SEVERITY_QUESTIONS,
  accumulateControls,
  askedWhen,
  deriveBand,
  detailFires,
  detailWhen,
  requiredWhen,
  severityQuestionsFor,
  CONTROLS,
  controlName,
  severitySubmissionProblems,
  writableSeverityAnswers,
  validate,
  type Band,
  type SeverityDoc,
  type SeverityQuestion,
} from "../../src/lib/severity";

const byId = (id: string) => SEVERITY_QUESTIONS.find((q) => q.id === id)!;

describe("FR-6 · rubric anchors ARE the options", () => {
  it("every band on every question carries an observable anchor", () => {
    // A band labelled only "Medium" is a bare word, and two assessors read
    // a bare word differently. The anchor is what makes them comparable.
    for (const q of SEVERITY_QUESTIONS) {
      for (const band of ["Low", "Medium", "High"] as const) {
        expect(q.bands[band]?.length, `${q.id} ${band}`).toBeGreaterThan(10);
      }
    }
  });

  it("uses the owner's own wording, not a paraphrase", () => {
    expect(byId("T2-TPR-LA-1").bands.High).toBe(
      "Privileged / admin access to production and/or broad access across environments",
    );
    expect(byId("T2-SH-1").bands.High).toContain("0–72 hours");
  });

  it("asks only what the lit paths call for", () => {
    const asked = severityQuestionsFor(["TPR_LA"]).map((q) => q.id);
    expect(asked).toContain("T2-TPR-LA-1");
    expect(asked).not.toContain("T2-AI-DEC-1");
    // The always-asked few come regardless.
    expect(asked).toContain("T2-SH-1");
  });
});

describe("§19 · unknown severity fails closed", () => {
  // The threshold is an operator of the one engine (§6.3), so these are
  // assertions about `matches`, not about a comparator Tier 2 owns.
  const atLeast = (band: Band | null, threshold: Band) =>
    matches(
      { field: SEVERITY_OF("q"), severityAtLeast: threshold },
      assessmentLookup({ severities: { q: band } }),
    );

  it("severity_at_least(Medium) is false given unknown severity", () => {
    expect(atLeast(null, "Medium")).toBe(false);
    expect(atLeast(null, "Low")).toBe(false);
  });

  it("compares bands as an order, not as strings", () => {
    expect(atLeast("High", "Medium")).toBe(true);
    expect(atLeast("Medium", "Medium")).toBe(true);
    expect(atLeast("Low", "Medium")).toBe(false);
  });

  it("an unanswered question requires nothing at all", () => {
    expect(accumulateControls([byId("T2-TPR-LA-1")], {}, {})).toEqual([]);
  });
});

describe("§19 · control accumulation", () => {
  const q = byId("T2-TPR-LA-1");

  it("Medium accumulates Low and Medium thresholds, never High", () => {
    const owed = accumulateControls([q], { [q.questionId]: "Medium" }, {}).map((c) => c.objective);
    const highOnly = q.requires.filter((r) => r.atLeast === "High").map((r) => r.objective);
    expect(owed.length).toBeGreaterThan(0);
    for (const objective of highOnly) expect(owed).not.toContain(objective);
    for (const r of q.requires.filter((x) => x.atLeast !== "High"))
      expect(owed).toContain(r.objective);
  });

  it("High accumulates everything Medium did, and more", () => {
    const medium = accumulateControls([q], { [q.questionId]: "Medium" }, {}).map((c) => c.objective);
    const high = accumulateControls([q], { [q.questionId]: "High" }, {}).map((c) => c.objective);
    for (const objective of medium) expect(high).toContain(objective);
    expect(high.length).toBeGreaterThan(medium.length);
  });

  it("every accumulated objective carries at least one human-readable reason", () => {
    const owed = accumulateControls([q], { [q.questionId]: "High" }, {});
    for (const control of owed) {
      expect(control.because.length).toBeGreaterThan(0);
      for (const why of control.because) {
        expect(why).not.toMatch(/T[23]-[A-Z]/); // no identifiers in a reason
        expect(why.length).toBeGreaterThan(15);
      }
    }
  });

  it("keeps BOTH reasons when two questions require the same control", () => {
    const a = byId("T2-TPR-LA-1");
    const b = byId("T2-SR-PAM-1");
    const shared = a.requires
      .map((r) => r.objective)
      .filter((o) => b.requires.some((r) => r.objective === o));
    expect(shared.length, "expected these two to share a control").toBeGreaterThan(0);
    const owed = accumulateControls(
      [a, b],
      { [a.questionId]: "High", [b.questionId]: "High" },
      {},
    );
    const both = owed.find((c) => c.objective === shared[0])!;
    expect(both.because.length).toBe(2);
  });
});

describe("FR-8 · the four kinds of conditional", () => {
  const q = byId("T2-TPR-LA-1");

  const at = (band: Band | null) =>
    detailFires(q, assessmentLookup({ severities: { [q.questionId]: band } }));

  it("severity-fired: the detail appears at Medium and High, not at Low", () => {
    expect(at("Low")).toBe(false);
    expect(at("Medium")).toBe(true);
    expect(at("High")).toBe(true);
  });

  it("unanswered fires nothing", () => {
    expect(at(null)).toBe(false);
  });

  it("nested: an option inside the detail requires controls of its own", () => {
    const owed = accumulateControls(
      [q],
      { [q.questionId]: "High" },
      { [q.detail!.questionId]: ["Admin / privileged"] },
    );
    const pam = owed.find((c) => c.objective === "T3-IAM-03")!;
    expect(pam.because.some((w) => w.includes("Admin / privileged"))).toBe(true);
  });

  it("cross-tier: a Tier-1 path decides whether the question is asked at all", () => {
    expect(severityQuestionsFor([]).some((x) => x.id === "T2-TPR-LA-1")).toBe(false);
    expect(severityQuestionsFor(["TPR_LA"]).some((x) => x.id === "T2-TPR-LA-1")).toBe(true);
  });

  it("always-fired: the shared questions are asked whatever is lit", () => {
    const always = SEVERITY_QUESTIONS.filter((x) => x.path === null);
    expect(always.length).toBeGreaterThan(1);
    for (const x of always) expect(severityQuestionsFor([]).map((y) => y.id)).toContain(x.id);
  });
});

describe("§3.3 · Tier-2 routing is conditions over the one engine", () => {
  it("publishes a condition for every routing decision, in the shared namespace", () => {
    for (const q of SEVERITY_QUESTIONS as SeverityQuestion[]) {
      // A question lit by a path names that path; the always-asked few
      // carry no condition at all.
      const asked = askedWhen(q);
      expect(asked === null, q.id).toBe(q.path === null);
      if (asked) {
        expect(matches(asked, { [ALL_PATHS]: [q.path!] }), q.id).toBe(true);
        expect(matches(asked, { [ALL_PATHS]: [] }), q.id).toBe(false);
      }
      expect(detailWhen(q) === null, q.id).toBe(q.detail === undefined);
      for (const requirement of q.requires) {
        expect(requiredWhen(q, requirement), q.id).toEqual({
          field: SEVERITY_OF(q.questionId),
          severityAtLeast: requirement.atLeast,
        });
      }
    }
  });

  it("accumulation owes exactly what those conditions say it owes", () => {
    // Evaluated here straight from the published conditions, so a rule that
    // stops going through `matches()` disagrees with this and fails.
    const bands = Object.fromEntries(
      SEVERITY_QUESTIONS.map((q) => [q.questionId, "Medium" as const]),
    );
    const answers = assessmentLookup({ severities: bands });
    const expected = new Set(
      SEVERITY_QUESTIONS.flatMap((q) =>
        q.requires
          .filter((r) => matches(requiredWhen(q, r), answers))
          .map((r) => r.objective),
      ),
    );
    expect(expected.size).toBeGreaterThan(0);
    const owed = accumulateControls(SEVERITY_QUESTIONS, bands, {}).map((c) => c.objective);
    expect(owed.sort()).toEqual([...expected].sort());
  });
});

describe("FR-7 · a band worked out rather than asked", () => {
  it("derives the data-handling band from the classification already given", () => {
    const q = byId("T2-TPR-DH-1");
    expect(deriveBand(q, { dataClassification: "Restricted" })).toEqual({
      band: "High",
      because: "you told us the most sensitive data involved is Restricted",
    });
    expect(deriveBand(q, { dataClassification: "Internal" })?.band).toBe("Low");
  });

  it("takes the worst thing in a list, not the first", () => {
    const q = byId("T2-PRIV-1");
    const derived = deriveBand(q, {
      dataElements: ["Partner/Vendor contact personal information", "Employee personal information"],
    })!;
    expect(derived.band).toBe("Medium");
  });

  it("derives nothing from an unanswered fact — positive evidence only", () => {
    expect(deriveBand(byId("T2-TPR-DH-1"), {})).toBeNull();
    expect(deriveBand(byId("T2-SH-1"), { dataClassification: "High" })).toBeNull();
  });
});

/**
 * B2 (S4 verification) — an empty list is a substantive answer in this
 * instrument, so a screen may only write questions that were on it. The
 * old rule wrote every detail question in the group on submit, hidden or
 * not, which recorded "none of these apply" against questions nobody was
 * ever shown. Insert-only means those rows are permanent.
 */
describe("a severity screen writes only what was on screen", () => {
  const parent = SEVERITY_QUESTIONS.find((q) => q.detail)! as SeverityQuestion;
  const detailId = parent.detail!.questionId;
  const everything = [parent.questionId, detailId];

  it("does not write a detail question whose parent is unanswered", () => {
    const payload = writableSeverityAnswers([parent], {}, { [detailId]: [] }, everything);
    expect(payload).toEqual({});
  });

  it("does not write a detail question below its threshold", () => {
    // Low is beneath every shipped detail's firesAt, so the detail is not
    // on screen even though its parent has been answered.
    expect(parent.detail!.firesAt).not.toContain("Low");
    const payload = writableSeverityAnswers(
      [parent],
      { [parent.questionId]: "Low" },
      { [detailId]: [] },
      everything,
    );
    expect(payload).toEqual({ [parent.questionId]: "Low" });
    expect(payload[detailId]).toBeUndefined();
  });

  it("writes an empty detail only when the question is actually showing", () => {
    const band = parent.detail!.firesAt[0]!;
    const payload = writableSeverityAnswers(
      [parent],
      { [parent.questionId]: band },
      { [detailId]: [] },
      everything,
    );
    // Now it IS a real answer: the person saw the question and ticked
    // nothing. That is "none of these apply", and it must persist.
    expect(payload).toEqual({ [parent.questionId]: band, [detailId]: [] });
  });

  it("writes nothing for a question the person never touched", () => {
    const band = parent.detail!.firesAt[0]!;
    const payload = writableSeverityAnswers(
      [parent],
      { [parent.questionId]: band },
      { [detailId]: ["whatever"] },
      [],
    );
    expect(payload).toEqual({});
  });
});

/**
 * F2 (S4 verification) — the refusal rule was pinned by nothing, exactly
 * as `pathSubmissionProblems` had been one slice earlier. §25.5: every
 * error path carries a test.
 */
describe("severitySubmissionProblems refuses what the instrument does not contain", () => {
  const parent = SEVERITY_QUESTIONS.find((q) => q.detail)! as SeverityQuestion;

  it("accepts a real band and a real detail option", () => {
    expect(
      severitySubmissionProblems({
        [parent.questionId]: "High",
        [parent.detail!.questionId]: [parent.detail!.options[0]!],
      }),
    ).toEqual([]);
  });

  it("refuses a question that is not in the instrument", () => {
    const problems = severitySubmissionProblems({ "sev.not_a_question": "High" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("no such question");
  });

  it("refuses a value that is not a band", () => {
    const problems = severitySubmissionProblems({ [parent.questionId]: "Catastrophic" });
    expect(problems[0]).toContain("not one of Low, Medium or High");
  });

  it("refuses a list where a band belongs", () => {
    const problems = severitySubmissionProblems({
      [parent.questionId]: ["High"] as unknown as string,
    });
    expect(problems[0]).toContain("not one of Low, Medium or High");
  });

  it("refuses a detail option the question does not offer", () => {
    const problems = severitySubmissionProblems({
      [parent.detail!.questionId]: [parent.detail!.options[0]!, "invented"],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("unknown option");
    expect(problems[0]).toContain("invented");
  });

  it("accepts an empty detail list — none of these apply is an answer", () => {
    expect(severitySubmissionProblems({ [parent.detail!.questionId]: [] })).toEqual([]);
  });
});

/**
 * B1 (S4 verification) — NFR-9: no internal identifier in any user-facing
 * text. The shipped screen printed "T3-GOV-03 — Business Criticality is
 * High — oversight" as the label of a required control.
 *
 * It slipped because the test that existed asserted no identifier appears
 * in the *reason*, and the identifier was in the *label* — a guard on the
 * field next door. So this suite asserts over every user-facing string an
 * accumulated control has, by name, and the last case fails if a new one
 * is added and left uncovered.
 */
describe("NFR-9 · a person never reads a control code", () => {
  const CODE = /T[0-9]-[A-Z]{2,5}-[0-9]/;

  it("every control a question can require has a name in the catalogue", () => {
    for (const q of SEVERITY_QUESTIONS as SeverityQuestion[]) {
      for (const requirement of q.requires) {
        expect(CONTROLS[requirement.objective]?.name, requirement.objective).toBeTruthy();
      }
      for (const objectives of Object.values(q.detail?.optionRequires ?? {})) {
        for (const objective of objectives) {
          expect(CONTROLS[objective]?.name, objective).toBeTruthy();
        }
      }
    }
  });

  it("no catalogue name is itself a code", () => {
    for (const [code, control] of Object.entries(CONTROLS)) {
      expect(control.name, code).not.toMatch(CODE);
      expect(control.name.length, code).toBeGreaterThan(3);
    }
  });

  it("accumulation carries a name, and nothing a person reads is a code", () => {
    // Every question at its worst band, so every reachable control appears.
    const owed = accumulateControls(
      SEVERITY_QUESTIONS as SeverityQuestion[],
      Object.fromEntries(SEVERITY_QUESTIONS.map((q) => [q.questionId, "High" as const])),
      Object.fromEntries(
        SEVERITY_QUESTIONS.filter((q) => q.detail).map((q) => [
          q.detail!.questionId,
          q.detail!.options,
        ]),
      ),
    );
    expect(owed.length).toBeGreaterThan(0);
    for (const control of owed) {
      // Every string a screen renders from this object, enumerated. The
      // `objective` code is deliberately kept for the record and the
      // destination — it is the one field no surface may print.
      const onScreen = [control.name, ...control.because];
      for (const text of onScreen) expect(text, control.objective).not.toMatch(CODE);
      expect(control.name).toBe(controlName(control.objective));
    }
  });

  it("an accumulated control has exactly the fields this suite covers", () => {
    const [first] = accumulateControls(
      SEVERITY_QUESTIONS as SeverityQuestion[],
      { [SEVERITY_QUESTIONS[0]!.questionId]: "High" },
      {},
    );
    // If a field is added, this fails until someone decides whether it is
    // user-facing and covers it above. A hand-maintained list of fields to
    // check decays; a list of fields that exist cannot.
    expect(Object.keys(first!).sort()).toEqual(["because", "name", "objective"]);
  });
});

/**
 * N3 (S4 verification) — autosave wrote the band, then the forward control
 * wrote the same band again 24 seconds later. Insert-only makes that
 * permanent, and a history padded with non-events is a history nobody
 * reads. Same rule `intakeChanges()` applies to intake.
 */
describe("an answer identical to the one on file is not an event", () => {
  const q = SEVERITY_QUESTIONS.find((x) => x.detail)! as SeverityQuestion;
  const detailId = q.detail!.questionId;
  const band = q.detail!.firesAt[0]!;

  it("skips a band that is already recorded", () => {
    expect(
      writableSeverityAnswers([q], { [q.questionId]: band }, {}, [q.questionId], {
        [q.questionId]: band,
      }),
    ).toEqual({});
  });

  it("writes a band that changed", () => {
    const other = BANDS.find((b) => b !== band)!;
    expect(
      writableSeverityAnswers([q], { [q.questionId]: other }, {}, [q.questionId], {
        [q.questionId]: band,
      }),
    ).toEqual({ [q.questionId]: other });
  });

  it("compares a detail list by its contents, not its identity", () => {
    const chosen = [q.detail!.options[0]!];
    const bands = { [q.questionId]: band };
    const touched = [q.questionId, detailId];
    expect(
      writableSeverityAnswers([q], bands, { [detailId]: [...chosen] }, touched, {
        [q.questionId]: band,
        [detailId]: [...chosen],
      }),
    ).toEqual({});
    expect(
      writableSeverityAnswers([q], bands, { [detailId]: [] }, touched, {
        [q.questionId]: band,
        [detailId]: [...chosen],
      }),
    ).toEqual({ [detailId]: [] });
  });
});

/**
 * F8 (S4 verification) — the same silent-no-op hole the Tier-1 validator
 * was extended to close in S3 round 2, left open in the new file. A
 * question lit by a path that does not exist is never asked; a band
 * derived from a field that does not exist is never worked out. Neither
 * errors, and both look right in the data.
 *
 * The reference is external — the Tier-1 instrument's own path options
 * and the intake field ids — not the severity file describing itself.
 */
describe("the severity validator rejects references that resolve to nothing", () => {
  const doc = () => JSON.parse(JSON.stringify(SEVERITY)) as SeverityDoc;

  it("accepts the shipped instrument", () => {
    expect(() => validate(doc())).not.toThrow();
  });

  it("rejects a question lit by a path no risk area offers", () => {
    const d = doc();
    d.questions[0]!.path = "NOT_A_PATH";
    expect(() => validate(d)).toThrow(/no risk area offers/);
  });

  it("rejects a band derived from a field that is not in intake", () => {
    const d = doc();
    const derived = d.questions.find((q) => q.derivedFrom)!;
    derived.derivedFrom!.from = "notAField";
    expect(() => validate(d)).toThrow(/not an intake field/);
  });

  it("rejects a control that would show as its code", () => {
    const d = doc();
    delete (d.controls as Record<string, unknown>)[d.questions[0]!.requires[0]!.objective];
    expect(() => validate(d)).toThrow(/would show as its code/);
  });
});

describe("capture answers do not score (§19, §3.1.6)", () => {
  /**
   * A detail question is the capture type: "what specifically?", multi-select,
   * asked only once its parent is severe enough. §3.1.6 says capture answers
   * never affect accumulation THRESHOLDS — they may still add objectives
   * directly through option-adds (§3.3), which is accumulation, not scoring.
   *
   * §19 used to say "never changes the accumulated set", which contradicted
   * FR-10's option-adds; the criterion now states the rule §3.1.6 actually
   * draws, and this is the test for it (S5 close-out, 2026-08-23).
   */
  const withDetail = SEVERITY_QUESTIONS.filter((q) => q.detail);

  it("the instrument has capture questions to test", () => {
    expect(withDetail.length).toBeGreaterThan(5);
  });

  it("answering a capture question changes no threshold-fired objective", () => {
    for (const question of withDetail) {
      const bands = { [question.questionId]: "High" as const };
      const none = accumulateControls([question], bands, {});
      const someChosen = {
        [question.detail!.questionId]: Object.keys(question.detail!.optionRequires ?? {}),
      };
      const withCapture = accumulateControls([question], bands, someChosen);

      // Every reason naming the BAND must be identical either way: the
      // capture answer moved no threshold.
      const thresholdReasons = (list: ReturnType<typeof accumulateControls>) =>
        list
          .flatMap((c) => c.because.map((why) => `${c.objective}::${why}`))
          .filter((r) => / is (Low|Medium|High) — /.test(r))
          .sort();
      expect(thresholdReasons(withCapture), question.id).toEqual(thresholdReasons(none));
    }
  });

  it("but a capture answer may add objectives of its own, each with its reason", () => {
    const question = withDetail.find(
      (q) => Object.keys(q.detail!.optionRequires ?? {}).length > 0,
    )!;
    const option = Object.keys(question.detail!.optionRequires)[0]!;
    const before = accumulateControls([question], { [question.questionId]: "High" }, {});
    const after = accumulateControls([question], { [question.questionId]: "High" }, {
      [question.detail!.questionId]: [option],
    });
    expect(after.length).toBeGreaterThanOrEqual(before.length);
    const added = after.filter((c) => !before.some((b) => b.objective === c.objective));
    for (const control of added) {
      expect(control.because.join(" "), control.objective).toContain(option);
    }
  });
});
