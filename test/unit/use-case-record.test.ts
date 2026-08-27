/**
 * FR-26 / FR-27 · the AI use case record, assembled from answers already
 * given (SPEC §27). The rules that matter are all about not overclaiming:
 * the count is computed, what is missing is named, and nothing is sent.
 */
import { describe, expect, it } from "vitest";
import {
  AI_USE_CASE_RECORD,
  assembleUseCaseRecord,
  offerUseCaseRecord,
  recordFilename,
  useCaseRecordPayload,
} from "@/lib/use-case-record";
import { ALL_FIELDS, type IntakeValues } from "@/lib/intake";

const FILLED: IntakeValues = {
  projectName: "Board pack assistant",
  projectDescription: "Summarises 10-K filings into a quarterly board pack.",
  usesAi: "Yes",
  aiUseCase: "Drafts the narrative; a controller edits before it circulates.",
  businessOwner: "Isabelle Withers — Head of Claims Operations",
  businessUnit: "Engineering",
  initiativeType: "Brand new",
  thirdPartyInvolved: "Yes",
  dataClassification: "Confidential",
};

describe("the map is data, not code (NFR-20)", () => {
  it("every field either reads an answer, is derived, or says nothing asks it", () => {
    for (const field of AI_USE_CASE_RECORD.fields) {
      const kinds = [field.from, field.derived, field.needs].filter(Boolean);
      expect(kinds, field.target).toHaveLength(1);
    }
  });

  it("every field it reads from is a real intake field", () => {
    // A map naming a field the instrument does not have would report a
    // permanent blank nobody can fill, and no test would say why.
    const real = new Set(ALL_FIELDS.map((f) => f.id));
    for (const field of AI_USE_CASE_RECORD.fields)
      if (field.from) expect(real, field.target).toContain(field.from);
  });

  it("carries a version, so a changed field list is a new version", () => {
    expect(AI_USE_CASE_RECORD.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});

describe("the count is computed, never written down (G-34)", () => {
  it("counts what the assessment really supplies", () => {
    const record = assembleUseCaseRecord(FILLED);
    const answered = record.rows.filter(
      (r) => r.source.kind === "answered",
    ).length;
    const derived = record.rows.filter(
      (r) => r.source.kind === "derived",
    ).length;
    expect(record.answered).toBe(answered + derived);
    expect(record.total).toBe(AI_USE_CASE_RECORD.fields.length);
    expect(record.answered).toBeLessThan(record.total);
  });

  it("an empty answer is not an answered field", () => {
    const blanked = assembleUseCaseRecord({ ...FILLED, projectName: "   " });
    expect(blanked.answered).toBe(assembleUseCaseRecord(FILLED).answered - 1);
  });

  it("an empty intake still counts the derived rows, and no more", () => {
    const empty = assembleUseCaseRecord({});
    const derived = AI_USE_CASE_RECORD.fields.filter((f) => f.derived).length;
    expect(empty.answered).toBe(derived);
  });
});

describe("what is missing is named, never hidden (§27.3)", () => {
  it("separates a blank answer from a question nobody asks", () => {
    const record = assembleUseCaseRecord(FILLED);
    const kinds = new Set(record.missing.map((r) => r.source.kind));
    expect(kinds).toContain("blank");
    expect(kinds).toContain("not-asked");
  });

  it("says WHY a field nothing asks about is empty", () => {
    const record = assembleUseCaseRecord(FILLED);
    for (const row of record.missing)
      if (row.source.kind === "not-asked")
        expect(row.source.because.length, row.target).toBeGreaterThan(20);
  });

  it("names the question an answered value came from", () => {
    const record = assembleUseCaseRecord(FILLED);
    const row = record.rows.find((r) => r.target === "ai_function")!;
    expect(row.source).toMatchObject({
      kind: "answered",
      question: "What does the AI do?",
    });
  });

  it("missing plus answered accounts for every row — nothing is dropped", () => {
    const record = assembleUseCaseRecord(FILLED);
    expect(record.answered + record.missing.length).toBe(record.total);
  });
});

describe("it is only offered when the assessment records AI (FR-26)", () => {
  it("offers on Yes", () => {
    expect(offerUseCaseRecord({ usesAi: "Yes" })).toBe(true);
  });

  it("does not offer otherwise — an inventory of AI is not an inventory of everything", () => {
    for (const answer of ["No", "I'm not sure", "", undefined])
      expect(offerUseCaseRecord({ usesAi: answer as string })).toBe(false);
  });
});

describe("nothing is claimed that is not true (§27.1, §27.4)", () => {
  it("stays marked provisional while the field names are ours, not theirs", () => {
    expect(AI_USE_CASE_RECORD.provisional).toBe(true);
    expect(assembleUseCaseRecord(FILLED).provisional).toBe(true);
  });

  it("carries no notion of having been sent", () => {
    // The write is out of scope. A field for it here is how "not connected"
    // quietly becomes "not sent yet" and then a status somebody trusts.
    const record = assembleUseCaseRecord(FILLED) as Record<string, unknown>;
    for (const word of ["sent", "sentAt", "delivered", "synced", "status"])
      expect(record).not.toHaveProperty(word);
  });
});

describe("what the platform worked out (FR-27)", () => {
  it("carries the derived value when the caller could supply it", () => {
    const record = assembleUseCaseRecord(FILLED, {
      assessment_status: "In review",
    });
    const row = record.rows.find((r) => r.target === "assessment_status")!;
    expect(row.source).toMatchObject({ kind: "derived", value: "In review" });
  });

  it("still says why, so a worked-out value is never bare", () => {
    const record = assembleUseCaseRecord(FILLED, { risk_areas: "AI & Model Risk" });
    const row = record.rows.find((r) => r.target === "risk_areas")!;
    if (row.source.kind !== "derived") throw new Error("expected a derived row");
    expect(row.source.because.length).toBeGreaterThan(20);
  });

  it("does not invent one when the caller supplied nothing", () => {
    const row = assembleUseCaseRecord(FILLED).rows.find(
      (r) => r.target === "risk_areas",
    )!;
    if (row.source.kind !== "derived") throw new Error("expected a derived row");
    expect(row.source.value).toBeUndefined();
  });

  it("treats whitespace as nothing supplied, not as a value", () => {
    const record = assembleUseCaseRecord(FILLED, { risk_areas: "   " });
    const row = record.rows.find((r) => r.target === "risk_areas")!;
    if (row.source.kind !== "derived") throw new Error("expected a derived row");
    expect(row.source.value).toBeUndefined();
  });

  it("names the intake field a blank row came from, so a screen can send somebody to it", () => {
    const record = assembleUseCaseRecord({ usesAi: "Yes" });
    const row = record.rows.find((r) => r.target === "business_owner")!;
    expect(row.source).toMatchObject({ kind: "blank", from: "businessOwner" });
  });
});

describe("the payload is honest on its own, away from the screen (§27.4)", () => {
  const AT = new Date("2026-08-27T09:00:00.000Z");
  const payload = () =>
    useCaseRecordPayload(
      assembleUseCaseRecord(FILLED, { assessment_status: "Draft" }),
      "Isabelle Withers",
      AT,
    );

  it("carries every field, including the ones it cannot fill", () => {
    // Dropping the key would let a reader count fields and conclude the
    // record is complete. Absence is stated, never implied (FR-20's rule).
    expect(payload().fields).toHaveLength(AI_USE_CASE_RECORD.fields.length);
  });

  it("gives every empty field a reason a stranger can read", () => {
    for (const field of payload().fields)
      if (field.value === null)
        expect(field.missing, field.field).toBeTruthy();
  });

  it("says it was never sent, in the file itself", () => {
    // The download outlives the screen that explained it, and whoever opens
    // it next did not read the caveat beside the button.
    expect(payload().notFiled).toMatch(/has no connection|not been sent/i);
  });

  it("has no field that could hold a delivery state", () => {
    const top = payload() as unknown as Record<string, unknown>;
    for (const word of ["sent", "sentAt", "delivered", "synced", "status"])
      expect(top).not.toHaveProperty(word);
  });

  it("keeps the map version, so a replay knows which field list it used", () => {
    expect(payload().destination.mapVersion).toBe(AI_USE_CASE_RECORD.version);
    expect(payload().destination.provisional).toBe(true);
  });

  it("names an answered field's question, so provenance survives the download", () => {
    const name = payload().fields.find((f) => f.field === "use_case_name")!;
    expect(name).toMatchObject({ value: "Board pack assistant", from: "Project Name" });
  });

  it("builds a filename that says what it is and stays a filename", () => {
    expect(recordFilename("Novara scheduling assistant", AT)).toBe(
      "ai-use-case-record-novara-scheduling-assistant-2026-08-27.json",
    );
    // A name that is all punctuation must still produce a usable file.
    expect(recordFilename("///", AT)).toBe("ai-use-case-record-assessment-2026-08-27.json");
  });
});
