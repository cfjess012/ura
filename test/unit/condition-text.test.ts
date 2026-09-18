/**
 * NFR-23 · every condition renders as one English sentence, in the
 * instrument's own words, with no identifier in it (NFR-9).
 */
import { describe, expect, it } from "vitest";
import { describe as render, shownBecause } from "@/lib/condition-text";
import { instrumentVocabulary } from "@/lib/condition-vocabulary";
import { ALL_FIELDS } from "@/lib/intake";
import { CATEGORIES } from "@/lib/instrument";
import { OBJECTIVES } from "@/lib/tier3";

const words = instrumentVocabulary();
const ID = /\b(gate|sev|path|t3)\.|[A-Z]{2,}_[A-Z]{2,}|\bsev_|\bBU_/;

describe("a rule as a sentence", () => {
  it("speaks about a risk area applying, not about a gate equalling Yes", () => {
    expect(render({ field: "gate.third-party", equalsAny: ["Yes"] }, words)).toBe(
      "the Third-Party & Supply Chain risk area applies",
    );
    expect(render({ field: "gate.ai", notEqualsAny: ["Yes"] }, words)).toMatch(/does not apply$/);
  });

  it("names a part by its label, not its id", () => {
    const said = render({ field: "paths", includesAny: ["SR_EXT"] }, words);
    expect(said).not.toMatch(ID);
    expect(said).toMatch(/is a part that applies$/);
  });

  it("names an intake field by its label and quotes its options", () => {
    // The label as the instrument spells it, punctuation and all.
    const label = ALL_FIELDS.find((f) => f.id === "dataClassification")!.label;
    const subject = label.endsWith("?") ? `the answer to “${label}”` : label;
    expect(render({ field: "dataClassification", equalsAny: ["Confidential", "Restricted"] }, words)).toBe(
      `${subject} is “Confidential” or “Restricted”`,
    );
  });

  it("says a severity as a band or higher", () => {
    const said = render({ field: "severity.sev.tpr_la_1", severityAtLeast: "Medium" }, words);
    expect(said).toMatch(/is Medium or higher$/);
    expect(said).not.toMatch(ID);
  });

  it("joins a nest into one sentence, bracketing only where it must", () => {
    const said = render(
      {
        all: [
          { field: "gate.ai", equalsAny: ["Yes"] },
          { any: [{ field: "usesAi", equalsAny: ["Yes"] }, { field: "paths", includesAny: ["PRIV"] }] },
        ],
      },
      words,
    );
    expect(said).toMatch(/^the .* area applies and \(.* or .*\)$/);
    expect(said).not.toMatch(ID);
  });

  it("never utters an identifier for anything in the shipped instrument", () => {
    for (const c of CATEGORIES) {
      for (const rule of c.prefill ?? []) expect(render(rule.when, words)).not.toMatch(ID);
      for (const d of c.derivedPaths ?? []) expect(render({ all: d.when }, words)).not.toMatch(ID);
    }
    for (const o of OBJECTIVES) {
      for (const child of o.children) {
        if (child.when) expect(render({ all: child.when }, words)).not.toMatch(ID);
      }
    }
  });

  it("does not stutter on an area whose name already says Risk", () => {
    expect(render({ field: "gate.ai", equalsAny: ["Yes"] }, words)).toBe("the AI & Model Risk area applies");
  });

  it("reads a label written as a question as one", () => {
    expect(render({ field: "usesAi", equalsAny: ["Yes"] }, words)).toMatch(/^the answer to “.*\?” is “Yes”$/);
  });

  it("never utters a part id the instrument does not know", () => {
    expect(render({ field: "paths", includesAny: ["NOT_A_PATH"] }, words)).toBe("“a part nobody offers” is a part that applies");
  });

  it("says answered and blank about the question itself, and reads bands bare", () => {
    expect(render({ field: "usesAi", hasValue: true }, words)).toMatch(/^“.*\?” is answered$/);
    expect(render({ field: "severity.sev.tpr_la_1", equalsAny: ["Medium", "High"] }, words)).toMatch(/ is Medium or High$/);
  });

  it("names a field it does not know as a question, never by its id", () => {
    expect(render({ field: "gate.nope", equalsAny: ["Yes"] }, words)).toBe("a risk area applies");
    expect(render({ field: "mystery", hasValue: true }, words)).toBe("a question is answered");
  });

  it("is ready for a screen after “Shown because”", () => {
    expect(shownBecause({ field: "usesAi", equalsAny: ["Yes"] }, words)).toMatch(/^Shown because .*\.$/);
  });
});
