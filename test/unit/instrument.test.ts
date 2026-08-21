/**
 * The Tier-1 instrument (S2): FR-3 gates, FR-22 pre-fill, NFR-8 seed data.
 * Pure — the instrument is imported at build time, never read from disk.
 */
import { describe, expect, it } from "vitest";
import {
  askableCategories,
  gateProgressHeadline,
  CATEGORIES,
  INSTRUMENT,
  categoryByKey,
  gateStates,
  prefillFor,
  unansweredCount,
} from "../../src/lib/instrument";
import {
  litPaths,
  litPathsFor,
  assessmentLookup,
  matchesAll,
  pathSubmissionProblems,
} from "../../src/lib/engine";

describe("the instrument is valid seed data (NFR-8)", () => {
  it("has eleven categories, each with one gate and a unique question id", () => {
    expect(CATEGORIES).toHaveLength(11);
    expect(new Set(CATEGORIES.map((c) => c.questionId)).size).toBe(11);
    expect(new Set(CATEGORIES.map((c) => c.key)).size).toBe(11);
    expect(INSTRUMENT.slug).toBe("tier1-gates");
    expect(INSTRUMENT.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("every gate has plain-language help — the question text alone is dense", () => {
    for (const c of CATEGORIES) {
      expect(c.help.length, c.key).toBeGreaterThan(40);
      expect(c.help, c.key).not.toMatch(/[a-z]+\.[a-z_]{3,}/); // no identifiers
    }
  });

  it("every pre-fill rule states a reason a person can read (§24.4)", () => {
    for (const c of CATEGORIES) {
      for (const rule of c.prefill) {
        expect(["Yes", "No"]).toContain(rule.answer);
        expect(rule.because, c.key).toMatch(/^[a-z]/); // reads after "because …"
      }
    }
  });
});

describe("pre-fill from intake (FR-22)", () => {
  it("an explicit third-party answer both opens and CLOSES the gate (C-1, C-2)", () => {
    const tpr = categoryByKey("third-party")!;
    expect(prefillFor(tpr, { thirdPartyInvolved: "Yes" })).toEqual({
      answer: "Yes",
      because: "you told us a company outside ours is involved",
    });
    // The half that was missing: intake could only ever open an area.
    expect(prefillFor(tpr, { thirdPartyInvolved: "No" })).toEqual({
      answer: "No",
      because: "you told us this is built and run entirely in-house",
    });
  });

  it("carries uncertainty forward as scope, and says that is what it did (C-9)", () => {
    // Intake promises "we'll find out for you" when someone is unsure. It
    // then used to ask the same question again at the gate, which is §24.1
    // broken by the platform that states it. Unsure now opens the area —
    // the conservative direction — and the reason says so plainly, so this
    // is not uncertainty laundered into a confident answer.
    for (const [key, field] of [
      ["ai", "usesAi"],
      ["third-party", "thirdPartyInvolved"],
    ] as const) {
      const filled = prefillFor(categoryByKey(key)!, { [field]: "I'm not sure" });
      expect(filled?.answer, key).toBe("Yes");
      expect(filled?.because, key).toMatch(/weren't sure|reviewer confirms/);
    }
  });

  it("an explicit No about AI closes the AI gate (C-1)", () => {
    expect(prefillFor(categoryByKey("ai")!, { usesAi: "No" })).toEqual({
      answer: "No",
      because: "you told us at intake that this doesn't use AI or machine learning",
    });
  });

  it("non-public data classification answers the data gate", () => {
    const data = categoryByKey("data-privacy")!;
    expect(prefillFor(data, { dataClassification: "Confidential" })?.answer).toBe("Yes");
    // Public no longer proves nothing — it closes the area (C-3).
    expect(prefillFor(data, { dataClassification: "Public" })).toEqual({
      answer: "No",
      because: "you told us the only data involved is already public",
    });
  });

  it("never pre-fills from an empty intake — positive evidence only (§3.2.1)", () => {
    // A settled area is not a pre-fill: nothing was derived from an answer,
    // so it is excluded here and pinned by its own test below.
    for (const c of CATEGORIES.filter((c) => !c.alwaysApplies)) {
      expect(prefillFor(c, {}), c.key).toBeNull();
    }
  });

  it("closing pre-fills exist at all — the half the instrument was missing", () => {
    const closes = CATEGORIES.flatMap((c) => c.prefill).filter((r) => r.answer === "No");
    // Measured in audits/instrument-2026-08-21.md: five rules, none of them
    // closing, so a project with no vendor, no AI and public data was asked
    // all eleven questions. If this ever returns to zero, that is back.
    expect(closes.length).toBeGreaterThan(0);
  });
});

describe("areas that apply to everyone are not asked (C-8)", () => {
  it("governance is settled, with a reason, and carries no prefill rules", () => {
    const gov = categoryByKey("governance")!;
    expect(gov.alwaysApplies).toBe(true);
    expect(gov.because).toBeTruthy();
    expect(gov.prefill).toEqual([]);
  });

  it("is answered Yes regardless of intake, and marked settled rather than pre-filled", () => {
    const state = gateStates({}, {}).find((s) => s.category.key === "governance")!;
    expect(state.answer).toBe("Yes");
    expect(state.settled).toBe(true);
    // Not "from intake": presenting it as a pre-fill would invite a person
    // to correct something that is not theirs to correct.
    expect(state.fromIntake).toBe(false);
  });

  it("does not count as something the person still has to do", () => {
    expect(unansweredCount(gateStates({}, {}))).toBe(askableCategories().length);
    expect(askableCategories().length).toBeLessThan(CATEGORIES.length);
  });
});

describe("gate state folding", () => {
  const intake = { thirdPartyInvolved: "Yes", usesAi: "Yes" };

  it("marks intake-derived answers as unconfirmed, with their reason", () => {
    const states = gateStates({}, intake);
    const tpr = states.find((s) => s.category.key === "third-party")!;
    expect(tpr.answer).toBe("Yes");
    expect(tpr.fromIntake).toBe(true);
    expect(tpr.because).toBe("you told us a company outside ours is involved");
  });

  it("a person's answer supersedes the pre-fill and is no longer 'from intake'", () => {
    const states = gateStates(
      { "gate.third_party": { value: "No", source: "person", confirmed: true } },
      intake,
    );
    const tpr = states.find((s) => s.category.key === "third-party")!;
    expect(tpr.answer).toBe("No");
    expect(tpr.fromIntake).toBe(false);
  });

  it("counts only what the person still has to answer (§24.8)", () => {
    // Ten, not eleven: governance applies to everyone and is never asked.
    expect(unansweredCount(gateStates({}, {}))).toBe(10);
    // Two pre-filled from intake still count as answered — they are visible
    // and changeable, not hidden work.
    expect(unansweredCount(gateStates({}, intake))).toBe(8);
  });

  it("an in-house project with no AI arrives with three areas already settled", () => {
    // The audit's worst case: a process change with no technology, no
    // vendor, no AI and public data was asked all eleven questions because
    // every pre-fill rule answered Yes and none answered No.
    const plain = { thirdPartyInvolved: "No", usesAi: "No" };
    const states = gateStates({}, plain);
    expect(states.filter((s) => s.answer === "No").map((s) => s.category.key)).toEqual([
      "third-party",
      "ai",
    ]);
    expect(unansweredCount(states)).toBe(8);
  });
});

describe("the progress headline tells the truth (F6)", () => {
  it("does not say 'Nearly there.' with ten of eleven areas unanswered", () => {
    expect(gateProgressHeadline(1, 11)).toBe("1 of 11 areas answered.");
  });

  it("earns encouragement only near the end", () => {
    expect(gateProgressHeadline(9, 11)).toBe("Nearly there.");
    expect(gateProgressHeadline(11, 11)).toBe("That's the whole map.");
  });

  it("invites a start rather than reporting zero", () => {
    expect(gateProgressHeadline(0, 11)).toBe("Let's map the risk areas.");
  });
});

describe("the engine lights paths, and says why (S3, FR-4/FR-5)", () => {
  const gatesFor = (intake: Record<string, string | string[]>) =>
    gateStates({}, intake);

  it("a chosen path is lit as chosen, with no reason attached", () => {
    const intake = { thirdPartyInvolved: "Yes", usesAi: "No", dataClassification: "Internal" };
    const lit = litPaths(CATEGORIES, gatesFor(intake), { "third-party": ["TPR_LA"] }, intake);
    const chosen = lit.find((p) => p.id === "TPR_LA")!;
    expect(chosen.source).toBe("chosen");
    expect(chosen.because).toEqual([]);
  });

  it("derives a path from evidence already given, and carries the sentence", () => {
    // Supplier concentration is assessed for every vendor; nobody is asked.
    const intake = { thirdPartyInvolved: "Yes", usesAi: "No", dataClassification: "Internal" };
    const lit = litPaths(CATEGORIES, gatesFor(intake), { "third-party": [] }, intake);
    const derived = lit.find((p) => p.id === "TPR_CONC")!;
    expect(derived.source).toBe("derived");
    expect(derived.because.join(" ")).toMatch(/every supplier/);
  });

  it("crosses domains: personal information plus AI lights the PI-in-AI path", () => {
    // The demo moment. Two answers in two different areas combine, and
    // nobody had to connect them.
    const intake = { thirdPartyInvolved: "No", usesAi: "Yes", dataClassification: "Confidential" };
    const lit = litPaths(CATEGORIES, gatesFor(intake), { "data-privacy": ["PRIV"] }, intake);
    const piAi = lit.find((p) => p.id === "PI_AI");
    expect(piAi?.source).toBe("derived");
    expect(piAi?.because.join(" ")).toMatch(/personal information .* uses AI/);
  });

  it("does not light PI-in-AI when either half is missing", () => {
    const noAi = { thirdPartyInvolved: "No", usesAi: "No", dataClassification: "Confidential" };
    expect(
      litPaths(CATEGORIES, gatesFor(noAi), { "data-privacy": ["PRIV"] }, noAi)
        .find((p) => p.id === "PI_AI"),
    ).toBeUndefined();
    const noPi = { thirdPartyInvolved: "No", usesAi: "Yes", dataClassification: "Confidential" };
    expect(
      litPaths(CATEGORIES, gatesFor(noPi), { "data-privacy": [] }, noPi)
        .find((p) => p.id === "PI_AI"),
    ).toBeUndefined();
  });

  it("lights nothing in an area whose gate is closed", () => {
    const intake = { thirdPartyInvolved: "No", usesAi: "No", dataClassification: "Public" };
    const lit = litPaths(CATEGORIES, gatesFor(intake), { "third-party": ["TPR_LA"] }, intake);
    // The selection exists but the area is closed, so nothing is asked.
    expect(lit.filter((p) => p.categoryKey === "third-party")).toEqual([]);
  });

  it("re-derives when an upstream answer changes — nothing is stored", () => {
    const selections = { "data-privacy": ["PRIV"] };
    const withAi = { thirdPartyInvolved: "No", usesAi: "Yes", dataClassification: "Confidential" };
    const withoutAi = { ...withAi, usesAi: "No" };
    const before = litPaths(CATEGORIES, gatesFor(withAi), selections, withAi);
    const after = litPaths(CATEGORIES, gatesFor(withoutAi), selections, withoutAi);
    expect(before.some((p) => p.id === "PI_AI")).toBe(true);
    expect(after.some((p) => p.id === "PI_AI")).toBe(false);
    expect(after.some((p) => p.categoryKey === "ai")).toBe(false);
  });
});

describe("a gate can answer another gate (audit C-5)", () => {
  it("a system change answers the security gate, with its reason", () => {
    const intake = { initiativeType: "Moving a proof of concept into production" };
    const states = gateStates({}, intake);
    const arch = states.find((s) => s.category.key === "solution-architecture")!;
    const sec = states.find((s) => s.category.key === "security-resilience")!;
    expect(arch.answer).toBe("Yes");
    expect(sec.answer).toBe("Yes");
    expect(sec.fromIntake).toBe(true);
    expect(sec.because).toMatch(/Solution Architecture area applies/);
    // The provenance must name the real source: "from your intake" put a
    // sentence in the person's mouth that they never said (B3a).
    expect(sec.origin).toBe("answers");
    expect(arch.origin).toBe("intake");
  });

  it("stays silent when the gate it reads has no answer", () => {
    const states = gateStates({}, {});
    expect(states.find((s) => s.category.key === "security-resilience")!.answer).toBeNull();
  });

  it("a person's own answer is never overwritten by a derived one", () => {
    const intake = { initiativeType: "Moving a proof of concept into production" };
    const states = gateStates(
      { "gate.security_resilience": { value: "No", source: "person", confirmed: true } },
      intake,
    );
    const sec = states.find((s) => s.category.key === "security-resilience")!;
    expect(sec.answer).toBe("No");
    expect(sec.fromIntake).toBe(false);
  });
});

describe("NFR-4 · a full recompute is cheap enough to do on every render", () => {
  it("re-derives gates and paths in well under a millisecond", () => {
    // The whole design rests on this: derived state is never stored, so it
    // is recomputed on every render. If that were expensive, someone would
    // eventually cache it, and the cache would be the thing that goes stale.
    const intake = {
      thirdPartyInvolved: "Yes",
      usesAi: "Yes",
      dataClassification: "Confidential",
      initiativeType: "Moving a proof of concept into production",
    };
    const selections = {
      "third-party": ["TPR_LA", "TPR_DH", "TPR_4P"],
      ai: ["AI_DEC", "AI_RAG", "AI_RET"],
      "data-privacy": ["PRIV", "REGDATA"],
      "security-resilience": ["SR_EXT", "SR_PAM", "SR_INT"],
    };
    for (let i = 0; i < 200; i++) litPaths(CATEGORIES, gateStates({}, intake), selections, intake);
    const started = performance.now();
    const ROUNDS = 500;
    for (let i = 0; i < ROUNDS; i++) {
      litPaths(CATEGORIES, gateStates({}, intake), selections, intake);
    }
    const each = (performance.now() - started) / ROUNDS;
    // Measured ~0.006ms; the bar is single-digit milliseconds (NFR-4), and
    // this is deliberately loose so a slow CI box does not fail the build
    // for a budget it is nowhere near.
    expect(each).toBeLessThan(5);
  });
});

describe("the engine's own rules are enforced, not just described (B3, B4)", () => {
  it("keeps BOTH reasons when two rules light the same path (§19)", () => {
    // A second satisfied rule is a separate fact about the assessment. The
    // first version kept the first reason and silently dropped the rest.
    const twice = {
      ...CATEGORIES.find((c) => c.key === "security-resilience")!,
      derivedPaths: [
        { id: "SR_TP", name: "Third-Party Security Exposure",
          when: [{ field: "gate.third-party", equalsAny: ["Yes"] }],
          because: "a company outside ours is involved" },
        { id: "SR_TP", name: "Third-Party Security Exposure",
          when: [{ field: "paths", includesAny: ["TPR_LA"] }],
          because: "that company can sign in to our systems" },
      ],
    };
    const lit = litPathsFor(twice, [], {
      "gate.third-party": "Yes",
      paths: ["TPR_LA"],
    });
    const tp = lit.find((p) => p.id === "SR_TP")!;
    expect(tp.because).toHaveLength(2);
    expect(tp.because.join(" ")).toMatch(/outside ours.*sign in/);
  });

  // A synthetic chain: seed → a → b → c. The shipped instrument only has a
  // two-hop chain, which the OLD two-pass code also resolved — so a test
  // against shipped data proved nothing about the fix. This is why
  // gateStates takes its categories as an argument now.
  const link = (key: string, reads: string, value: string) => ({
    key,
    name: key,
    short: key,
    questionId: `gate.${key}`,
    text: `Does ${key} apply?`,
    help: `Whether ${key} applies.`,
    prefill: [
      {
        answer: "Yes" as const,
        when: { field: reads, equalsAny: [value] },
        because: `${reads} said ${value}`,
      },
    ],
  });

  it("resolves a THREE-hop chain, which two passes could not", () => {
    const chain = [link("a", "seed", "Yes"), link("b", "gate.a", "Yes"), link("c", "gate.b", "Yes")];
    const states = gateStates({}, { seed: "Yes" }, chain);
    expect(states.map((s) => s.answer)).toEqual(["Yes", "Yes", "Yes"]);
    // Everything past the first hop came from another answer, not intake.
    expect(states.map((s) => s.origin)).toEqual(["intake", "answers", "answers"]);
  });

  it("stops the chain where the evidence stops", () => {
    const chain = [link("a", "seed", "Yes"), link("b", "gate.a", "Yes")];
    expect(gateStates({}, {}, chain).map((s) => s.answer)).toEqual([null, null]);
  });

  it("terminates on a REAL cycle, and answers nothing", () => {
    // Authored deliberately: a reads b, b reads a. The validator should
    // never allow it; the engine must not spin if it ever did.
    const cycle = [link("a", "gate.b", "Yes"), link("b", "gate.a", "Yes")];
    const started = performance.now();
    const states = gateStates({}, {}, cycle);
    expect(performance.now() - started).toBeLessThan(100);
    expect(states.map((s) => s.answer)).toEqual([null, null]);
  });

  it("a person's answer stops the chain from overriding it", () => {
    const chain = [link("a", "seed", "Yes"), link("b", "gate.a", "Yes")];
    const states = gateStates(
      { "gate.b": { value: "No", source: "person", confirmed: true } },
      { seed: "Yes" },
      chain,
    );
    expect(states.find((s) => s.category.key === "b")!.answer).toBe("No");
  });
});

describe("a path submission is refused, never narrowed (N9)", () => {
  it("names an option the instrument does not offer", () => {
    expect(pathSubmissionProblems(CATEGORIES, { "data-privacy": ["PRIV", "NOPE"] })).toEqual([
      { kind: "unknown-options", categoryKey: "data-privacy", ids: ["NOPE"] },
    ]);
  });

  it("refuses an unknown category, and one with no path question", () => {
    expect(pathSubmissionProblems(CATEGORIES, { nonsense: [] })[0]!.kind).toBe("unknown-category");
    expect(pathSubmissionProblems(CATEGORIES, { governance: [] })[0]!.kind).toBe("no-path-question");
  });

  it("accepts a genuinely empty selection — 'none of these apply' is an answer", () => {
    expect(pathSubmissionProblems(CATEGORIES, { "data-privacy": [] })).toEqual([]);
  });
});
