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
import { whatsOnScreen } from "@/lib/whats-on-screen";
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
