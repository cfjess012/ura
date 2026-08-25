/**
 * FR-43 · carrying a suggestion to the field it rewrites.
 *
 * The check runs at the foot of the last section and the field it rewrites
 * is usually on the first, so the suggestion has to survive a navigation.
 * It travels in session storage rather than through the record, because a
 * suggestion is not an answer until somebody saves it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  bracketSpans,
  clearRewrite,
  holdRewrite,
  takeRewrite,
} from "@/lib/pending-rewrite";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
});

const pending = {
  projectId: "p1",
  fieldId: "businessPurpose",
  text: "It reads claims. [Which team?]",
  placeholders: ["Which team?"],
};

describe("carrying a suggestion across a navigation", () => {
  it("hands it to the section that owns the field", () => {
    holdRewrite(pending);
    expect(takeRewrite("p1", ["businessPurpose", "projectName"])).toEqual(
      pending,
    );
  });

  it("survives being read, so a remount does not lose it", () => {
    // It used to clear on read, and the tracker's own actions navigate —
    // so applying a field proposal after taking a description wiped the
    // description. Nothing is written down until they save, so the
    // suggestion has to outlive a remount.
    holdRewrite(pending);
    expect(takeRewrite("p1", ["businessPurpose"])).not.toBeNull();
    expect(takeRewrite("p1", ["businessPurpose"])).not.toBeNull();
  });

  it("is gone once the answer is on the record", () => {
    holdRewrite(pending);
    clearRewrite();
    expect(takeRewrite("p1", ["businessPurpose"])).toBeNull();
  });

  it("leaves it alone on a section that does not render the field", () => {
    holdRewrite(pending);
    expect(takeRewrite("p1", ["dataClassification"])).toBeNull();
    // Still there for the section that does own it.
    expect(takeRewrite("p1", ["businessPurpose"])).not.toBeNull();
  });

  it("never crosses to another assessment", () => {
    holdRewrite(pending);
    expect(takeRewrite("p2", ["businessPurpose"])).toBeNull();
  });

  it("survives storage being unavailable", () => {
    globalThis.sessionStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    } as unknown as Storage;
    // No throw either way: the navigation still happens and the field is
    // simply not pre-filled.
    expect(() => holdRewrite(pending)).not.toThrow();
    expect(takeRewrite("p1", ["businessPurpose"])).toBeNull();
  });
});

describe("finding the gaps in a suggestion", () => {
  it("locates each bracket so one can be selected", () => {
    const text = "A tool. [Which team?] It stores data in [where?].";
    const spans = bracketSpans(text);
    expect(spans).toHaveLength(2);
    expect(text.slice(spans[0]!.from, spans[0]!.to)).toBe("[Which team?]");
    expect(text.slice(spans[1]!.from, spans[1]!.to)).toBe("[where?]");
  });

  it("ignores brackets too short to be a question", () => {
    expect(bracketSpans("costs [x] pounds")).toEqual([]);
  });

  it("finds none in text that has been filled in", () => {
    expect(
      bracketSpans("A claims triage tool used by the fraud team."),
    ).toEqual([]);
  });
});

describe("a long gap is still a gap", () => {
  it("finds a placeholder that quotes both halves of a contradiction", () => {
    // These run long by nature, and the longest are the ones somebody most
    // needs to see. A ceiling of 200 hid this one from the highlight and
    // from the list underneath, silently.
    const long =
      "It reads claims. [" +
      '"insurance adjusters and investigators" — is this the same group referred to elsewhere as "front-line claims handlers" and "senior fraud analysts," or a different set of users? These two disagree — which is right?' +
      "] It runs nightly.";
    expect(bracketSpans(long)).toHaveLength(1);
  });

  it("does not let an unclosed bracket swallow the document", () => {
    expect(bracketSpans("A tool. [never closed " + "x".repeat(900))).toEqual(
      [],
    );
  });
});
