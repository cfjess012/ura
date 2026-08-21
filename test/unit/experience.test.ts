/**
 * The experience principles as tests (SPEC §24). Several of these laws are
 * properties of the instrument data, not of pixels — so they can be proven
 * for every field that exists now and every field anyone adds later.
 */
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
          f.conditional.equalsAny.some((v) => unsure.includes(v)),
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

describe("§24.6 the system absorbs complexity", () => {
  it("no internal identifiers or acronym batteries in anything a person reads", () => {
    for (const f of ALL_FIELDS) {
      for (const text of [f.label, f.help ?? "", f.revealNote ?? "", f.body ?? ""]) {
        expect(text, f.id).not.toMatch(/\b(ARA|BIR|PIA|DPIA|AVA)\b/);
        expect(text, f.id).not.toMatch(/[a-z]+\.[a-z_]{3,}/);
      }
    }
  });
});

describe("§24.4 revealed content says why", () => {
  it("every conditional field carries a plain-language reason", () => {
    for (const f of ALL_FIELDS.filter((f) => f.conditional && f.type !== "note")) {
      expect(f.revealNote, f.id).toBeTruthy();
      expect(f.revealNote, f.id).toMatch(/^Shown because/);
    }
  });
});
