/**
 * FR-48 · the map's numbers are the instrument's numbers (G-75).
 *
 * The map exists only to make claims about the product, so every count on
 * it is held here to the data it must come from. A sentence saying
 * "eleven risk areas" would be right until the day it was not.
 */
import { describe, expect, it } from "vitest";
import { facts, processModel } from "@/lib/process-model";
import { DISPOSITION_KINDS } from "@/lib/disposition";
import { askableCategories, CATEGORIES } from "@/lib/instrument";
import { INTAKE_SECTIONS } from "@/lib/intake";
import { SEVERITY_QUESTIONS } from "@/lib/severity";
import { OBJECTIVES } from "@/lib/tier3";

describe("every number on the map is counted from the instrument", () => {
  const f = facts();
  it("counts what the data holds", () => {
    expect(f.sections).toBe(INTAKE_SECTIONS.length);
    expect(f.areas).toBe(CATEGORIES.length);
    expect(f.asked).toBe(askableCategories().length);
    expect(f.withParts).toBe(CATEGORIES.filter((c) => c.pathQuestion).length);
    expect(f.severity).toBe(SEVERITY_QUESTIONS.length);
    expect(f.objectives).toBe(OBJECTIVES.length);
    expect(f.dispositions).toBe(DISPOSITION_KINDS.length);
    // The areas that go deep are exactly the ones with parts; everything
    // else is the pilot’s declared boundary (FR-35, prefill-reach.test.ts).
    expect(f.areas - f.quiet).toBe(f.withParts);
  });

  it("puts those counts on the tiles, not other ones", () => {
    const r = processModel("requester");
    const by = (id: string) => r.stops.find((s) => s.id === id)!;
    expect(by("areas").count).toBe(`${f.areas} areas`);
    expect(by("severity").count).toContain(String(f.severity));
    expect(by("controls").count).toContain(String(f.objectives));
    const a = processModel("assessor");
    expect(a.stops.find((s) => s.id === "settle")!.count).toContain(
      String(f.dispositions),
    );
  });
});

describe("the map is whole, and in plain words", () => {
  for (const lens of ["requester", "assessor"] as const) {
    const model = processModel(lens);
    it(`${lens}: every stop says what is seen, the logic, and where`, () => {
      expect(model.stops.length).toBeGreaterThan(4);
      const ids = new Set(model.stops.map((s) => s.id));
      expect(ids.size).toBe(model.stops.length);
      for (const stop of model.stops) {
        expect(stop.title.length).toBeGreaterThan(3);
        expect(stop.sees.length).toBeGreaterThan(20);
        expect(stop.logic.length).toBeGreaterThan(0);
        expect(stop.where.length).toBeGreaterThan(3);
        expect([1, 2, 3, 4]).toContain(stop.stage);
      }
    });
    it(`${lens}: no internal identifiers reach the screen (NFR-9)`, () => {
      const text = JSON.stringify(model);
      expect(text).not.toMatch(/\bt3\.|\bgate\.|questionId|\/projects\//);
    });
    it(`${lens}: the journey ends at the package`, () => {
      const last = model.stops.filter((s) => s.stage === 4);
      expect(last.some((s) => s.id === "package")).toBe(true);
    });
  }

  it("names where the pilot stops, as a stop of its own (G-50)", () => {
    const a = processModel("assessor");
    expect(a.stops.some((s) => s.id === "boundary")).toBe(true);
  });

  it("the two journeys are different journeys", () => {
    const r = processModel("requester").stops.map((s) => s.id);
    const a = processModel("assessor").stops.map((s) => s.id);
    expect(r).not.toEqual(a);
  });
});
