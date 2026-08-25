/**
 * §22.1 · what the assistant is looking at.
 *
 * Without this it knew which assessment somebody was on and nothing about
 * which screen, so "where do I start?" got an answer about the assessment
 * in general — which is the difference between a thought partner and a
 * search box.
 *
 * The path only SELECTS. Every word handed to the model comes from the
 * instrument, so nothing a client sends can become a question.
 */
import { describe, expect, it } from "vitest";
import { gatesAnswerableAt, whatsOnScreen } from "@/lib/whats-on-screen";
import { CATEGORIES } from "@/lib/instrument";

const at = (rest: string) => `/projects/9f1c-abcd/${rest}`;

describe("it knows which screen a person is on", () => {
  it("names an intake section and the fields on it", () => {
    const screen = whatsOnScreen(at("intake/description"));
    expect(screen?.screen).toMatch(/Description/);
    expect(screen?.questions).toContain("Project Name");
    expect(screen?.questions).toContain("Project Description");
  });

  it("names a risk area and asks its actual question", () => {
    const ai = CATEGORIES.find((c) => c.key === "ai")!;
    const screen = whatsOnScreen(at("assess/ai"));
    expect(screen?.screen).toContain(ai.name);
    // Verbatim, so the assistant talks about the question they can see.
    expect(screen?.questions).toEqual([ai.text]);
  });

  it("knows the control questions, and carries them", () => {
    const screen = whatsOnScreen(at("assess/objectives"));
    expect(screen?.screen).toMatch(/control questions/);
    expect(screen!.questions.length).toBeGreaterThan(0);
  });

  it("knows the severity screen", () => {
    expect(whatsOnScreen(at("assess/severity/third-party"))?.screen).toMatch(
      /severity/,
    );
  });

  it("names the screens that ask nothing, rather than guessing", () => {
    for (const [path, reads] of [
      ["submit", /declare/],
      ["review", /reviewer/],
      ["report", /handoff/],
      ["assess/complete", /summary/],
    ] as const) {
      const screen = whatsOnScreen(at(path));
      expect(screen?.screen, path).toMatch(reads);
      expect(screen?.questions, path).toEqual([]);
    }
  });

  it("says nothing rather than inventing a screen it does not know", () => {
    expect(whatsOnScreen(at("assess/not-a-real-area"))).toBeNull();
    expect(whatsOnScreen(at("nowhere"))).toBeNull();
    expect(whatsOnScreen("/projects")).toBeNull();
    expect(whatsOnScreen("/")).toBeNull();
  });

  it("never lets the path supply words — only select them", () => {
    // A path segment that is not a real screen must produce nothing, not a
    // screen named after whatever the caller typed.
    const injected = whatsOnScreen(at("assess/<script>alert(1)</script>"));
    expect(injected).toBeNull();
  });
});

/**
 * §22.1 · which questions the assistant may propose an answer to.
 *
 * The screen is a ceiling, not a target: it says what MAY be proposed
 * here, and the record decides what is still open. Everything outside a
 * risk area returns nothing, because a proposal there could be rendered
 * nowhere and accepted never.
 */
describe("what may be proposed here", () => {
  const askable = CATEGORIES.filter((c) => !c.alwaysApplies);

  it("offers exactly the gate on a risk-area screen", () => {
    for (const category of askable) {
      const got = gatesAnswerableAt(`/projects/p1/assess/${category.key}`);
      expect(got.map((c) => c.questionId)).toEqual([category.questionId]);
    }
  });

  it("offers nothing where nobody is asked", () => {
    // An always-applies area renders "nothing to answer" — a proposal
    // would sit under a question that is not on the screen.
    const always = CATEGORIES.filter((c) => c.alwaysApplies);
    expect(always.length).toBeGreaterThan(0);
    for (const category of always) {
      expect(gatesAnswerableAt(`/projects/p1/assess/${category.key}`)).toEqual(
        [],
      );
    }
  });

  it("offers nothing on the screens it could not be accepted from", () => {
    // Paths, severity and objectives are answered in shapes ProposedAnswer
    // cannot render — and acceptDraft looks the question up among gates,
    // so a draft there would be a card whose button always refuses.
    for (const path of [
      "/projects/p1/assess/paths",
      "/projects/p1/assess/severity/third-party",
      "/projects/p1/assess/objectives",
      "/projects/p1/assess/complete",
      "/projects/p1/intake/description",
      "/projects/p1/submit",
      "/projects/p1/review",
      "/projects/p1/report",
      "/projects/p1",
    ]) {
      expect(gatesAnswerableAt(path), path).toEqual([]);
    }
  });

  it("offers nothing for a path the instrument does not know", () => {
    expect(gatesAnswerableAt("/projects/p1/assess/not-a-real-area")).toEqual(
      [],
    );
    expect(
      gatesAnswerableAt("/projects/p1/assess/<script>alert(1)</script>"),
    ).toEqual([]);
    expect(gatesAnswerableAt("")).toEqual([]);
    expect(gatesAnswerableAt("/elsewhere/entirely")).toEqual([]);
  });
});
