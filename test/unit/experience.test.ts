/**
 * The experience principles as tests (SPEC §24). Several of these laws are
 * properties of the instrument data, not of pixels — so they can be proven
 * for every field that exists now and every field anyone adds later.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_FIELDS } from "../../src/lib/intake";

const UNSURE = /not sure|don't know|unknown/i;

describe("§24.1 never re-ask what someone said they don't know", () => {
  it("an 'I'm not sure' answer may reveal reassurance, never another question", () => {
    for (const field of ALL_FIELDS) {
      const unsure = field.options?.filter((o) => UNSURE.test(o)) ?? [];
      if (unsure.length === 0) continue;
      const revealed = ALL_FIELDS.filter(
        (f) =>
          f.conditional &&
          "equalsAny" in f.conditional &&
          f.conditional.visibleWhen === field.id &&
          (f.conditional as { equalsAny: string[] }).equalsAny.some((v: string) =>
            unsure.includes(v),
          ),
      );
      for (const r of revealed) {
        expect(r.type, `${field.id} → ${r.id}`).toBe("note");
      }
    }
  });

  it("every uncertainty note says who resolves it", () => {
    const notes = ALL_FIELDS.filter((f) => f.type === "note");
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      expect(note.body, note.id).toMatch(/reviewer|Risk Assessor/i);
    }
  });
});

describe("§24.7 the system absorbs complexity", () => {
  // Acronyms are allowed where they name a document a person is holding, and
  // only when spelled out beside it — see the reasoning in intake.test.ts.
  // The letters were never the harm; an unexplained vocabulary test was.
  const SPELLED_OUT: Record<string, RegExp> = {
    ARA: /Architectural Risk Assessment/i,
    PIA: /Privacy Impact Assessment/i,
    DPIA: /Data Protection Impact Assessment/i,
    BIR: /Business Impact Review/i,
    AVA: /Application Vulnerability Assessment/i,
  };

  it("no internal identifiers, and no acronym a person cannot decode", () => {
    for (const f of ALL_FIELDS) {
      for (const text of [f.label, f.help ?? "", f.revealNote ?? "", f.body ?? ""]) {
        for (const [acronym, expansion] of Object.entries(SPELLED_OUT)) {
          if (new RegExp(`\\b${acronym}\\b`).test(text)) {
            expect(text, `${f.id}: ${acronym} is not spelled out`).toMatch(expansion);
          }
        }
        expect(text, f.id).not.toMatch(/[a-z]+\.[a-z_]{3,}/);
      }
    }
  });
});

describe("§24.5 revealed content says why", () => {
  it("every conditional field carries a plain-language reason", () => {
    for (const f of ALL_FIELDS.filter((f) => f.conditional && f.type !== "note")) {
      expect(f.revealNote, f.id).toBeTruthy();
      expect(f.revealNote, f.id).toMatch(/^Shown because/);
    }
  });
});

describe("§24.4 nothing a person types is silently discarded", () => {
  // The intake form is controlled, so React's first render replaces whatever
  // is in the DOM with the values the server sent. Anything typed before
  // hydration therefore disappeared — no error, no sign, the answer simply
  // gone. The form now reads itself once on mount and adopts what it finds.
  const form = readFileSync(
    join(__dirname, "..", "..", "src", "app", "(app)", "projects", "[id]", "intake", "section-form.tsx"),
    "utf8",
  );

  it("the intake form adopts anything typed before it hydrated", () => {
    expect(form).toMatch(/new FormData\(form\)/);
    expect(form, "the adoption effect must run once on mount").toMatch(/\}, \[\]\);/);
  });

  it("every control carries a name, so the form is readable as a form", () => {
    // Without names, FormData sees nothing and the adoption above is a no-op.
    const controls = form.match(/<(input|textarea|select)\b[^>]*/gs) ?? [];
    expect(controls.length).toBeGreaterThan(3);
    for (const control of controls) {
      if (/type="radio"/.test(control)) continue; // radios group by name already
      expect(control.replace(/\s+/g, " "), control.slice(0, 60)).toMatch(/name=\{/);
    }
  });
});
