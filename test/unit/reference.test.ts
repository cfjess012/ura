/**
 * S4.5 — reference lists (FR-29, FR-30, NFR-22; G-46, G-47).
 *
 * The rename case is the one that matters and the one that is easy to lose:
 * everything here exists so that correcting a list entry cannot change what
 * somebody already answered.
 */
import { describe, expect, it } from "vitest";
import {
  REFERENCE_LISTS,
  answerFor,
  entriesOf,
  isUnlisted,
  labelOf,
  listBySlug,
  referenceProblems,
  type ReferenceList,
} from "../../src/lib/reference";

describe("the shipped lists are usable", () => {
  it("every list validates, has entries, and says where the real one comes from", () => {
    const slugs = Object.keys(REFERENCE_LISTS);
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const list = listBySlug(slug)!;
      expect(list.entries.length, slug).toBeGreaterThan(0);
      // NFR-9: a person reads these, so no identifier may be the label.
      for (const entry of list.entries)
        expect(entry.label, entry.id).not.toBe(entry.id);
      expect(
        list.note.length,
        `${slug} has no provenance note`,
      ).toBeGreaterThan(20);
      expect(list.version, slug).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    }
  });

  it("entries come back in the order a person reads them", () => {
    const labels = entriesOf("vendors").map((e) => e.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("no list is defined in a component", async () => {
    // The specific laziness this slice was written to avoid: a picker whose
    // options are an array inside a .tsx file. The reference is the data
    // directory, not a list of files someone remembered to check.
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "..", "..", "src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".tsx")) files.push(full);
      }
    };
    walk(root);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const list of Object.values(REFERENCE_LISTS)) {
        // Three or more of a list's labels in one component means the list
        // has been copied out of the data and into the interface.
        const hits = list.entries.filter((e) =>
          source.includes(`"${e.label}"`),
        ).length;
        expect(hits, `${file} hardcodes ${list.slug}`).toBeLessThan(3);
      }
    }
  });
});

describe("an answer survives the list changing (NFR-22, G-46)", () => {
  it("stores the entry, the label shown, and the version it came from", () => {
    const answer = answerFor("vendors", "V_SNOWFLAKE")!;
    expect(answer).toEqual({
      id: "V_SNOWFLAKE",
      label: "Snowflake",
      version: listBySlug("vendors")!.version,
    });
  });

  it("shows what the person saw, not what the list says now", () => {
    // The rename case. An answer given when the entry read "Novara Health"
    // keeps reading "Novara Health" after the list is corrected.
    const asAnswered = {
      id: "V_SNOWFLAKE",
      label: "Snowflake Inc",
      version: "2026-01-01.1",
    };
    expect(labelOf(asAnswered)).toBe("Snowflake Inc");
    expect(labelOf(asAnswered)).not.toBe(
      listBySlug("vendors")!.entries.find((e) => e.id === "V_SNOWFLAKE")!.label,
    );
  });

  it("accepts an answer pinned to a version that is no longer current", () => {
    // Re-validating an old answer against today's list is the silent
    // rewrite this rule exists to stop.
    expect(
      referenceProblems("vendors", {
        id: "V_SNOWFLAKE",
        label: "Snowflake",
        version: "1999-01-01.1",
      }),
    ).toEqual([]);
  });

  it("refuses an entry that is not on the list", () => {
    const problems = referenceProblems("vendors", {
      id: "V_INVENTED",
      label: "Invented",
      version: "2026-08-21.1",
    });
    expect(problems[0]).toContain("not on this list");
  });

  it("refuses an answer with no label or no version — both are the record", () => {
    expect(referenceProblems("vendors", { id: "V_SNOWFLAKE" })[0]).toContain(
      "label shown",
    );
    expect(
      referenceProblems("vendors", {
        id: "V_SNOWFLAKE",
        label: "Snowflake",
      })[0],
    ).toContain("list version");
  });

  it("refuses a bare string — an id where a reference answer belongs", () => {
    expect(referenceProblems("vendors", "V_SNOWFLAKE")[0]).toContain(
      "not a reference answer",
    );
  });

  it("refuses an unknown list rather than passing it through", () => {
    expect(referenceProblems("not-a-list", { unlisted: "x" })[0]).toContain(
      "no such reference list",
    );
  });
});

describe("an off-list value is its own shape (FR-30, G-47)", () => {
  it("is recognised structurally, never by its text", () => {
    expect(isUnlisted({ unlisted: "Peter's team" })).toBe(true);
    expect(isUnlisted("Peter's team")).toBe(false);
    expect(isUnlisted({ id: "V_SAP", label: "SAP", version: "x" })).toBe(false);
    expect(isUnlisted(null)).toBe(false);
  });

  it("is accepted where the list allows it and needs an actual name", () => {
    expect(referenceProblems("vendors", { unlisted: "Novara Health" })).toEqual(
      [],
    );
    expect(referenceProblems("vendors", { unlisted: "   " })[0]).toContain(
      "written out",
    );
  });

  it("is refused where the list does not allow it", () => {
    const closed: ReferenceList = {
      ...listBySlug("vendors")!,
      slug: "closed",
      allowsUnlisted: false,
    };
    REFERENCE_LISTS.closed = closed;
    expect(referenceProblems("closed", { unlisted: "anything" })[0]).toContain(
      "does not accept an off-list value",
    );
    delete REFERENCE_LISTS.closed;
  });

  it("renders as the text the person typed", () => {
    expect(labelOf({ unlisted: "Peter's team" })).toBe("Peter's team");
  });
});
