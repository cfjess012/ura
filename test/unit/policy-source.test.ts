/**
 * FR-45 · where the assistant gets policy from.
 *
 * This module stands in for an enterprise policy service — an MCP server, a
 * GRC platform — and is the only place that knows where policy comes from.
 * What it must never do is hand back something that is not, word for word,
 * what the standard says (§22.5).
 */
import { describe, expect, it } from "vitest";
import { findAuthority, termsIn } from "@/lib/policy-source";
import { policies } from "@/lib/policy";

describe("finding the clause that bears on a question", () => {
  it("finds a definition from the words somebody used", () => {
    const found = findAuthority(termsIn("what is business criticality?"));
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.heading).toMatch(/business criticality/i);
    expect(found[0]!.clauseId).toContain("GLO-STD-001");
  });

  it("carries the reference and the version, always", () => {
    // A quote nobody can look up is not a citation.
    for (const found of findAuthority(termsIn("personal information"))) {
      expect(found.reference).not.toBe("");
      expect(found.version).not.toBe("");
      expect(found.policy).not.toBe("");
    }
  });

  it("returns the standard's own words, byte for byte", () => {
    // The one that would actually catch a paraphrase creeping in.
    const known = new Set(
      policies().flatMap((p) => p.clauses.map((c) => c.text)),
    );
    for (const term of ["third party", "restricted", "multi-factor"]) {
      for (const found of findAuthority(termsIn(term))) {
        expect(known.has(found.text), found.clauseId).toBe(true);
      }
    }
  });

  it("ranks a clause about the term above one that merely mentions it", () => {
    const found = findAuthority(termsIn("what counts as a third party?"));
    expect(found[0]!.heading).toMatch(/third party/i);
  });

  it("returns nothing for something no standard covers", () => {
    // Empty is the ordinary case, and a citation that appears for every
    // question is a citation that means nothing.
    expect(findAuthority(termsIn("what is the weather tomorrow"))).toEqual([]);
    expect(findAuthority(termsIn("hello"))).toEqual([]);
    expect(findAuthority([])).toEqual([]);
  });

  it("is not fooled by common words alone", () => {
    // "the", "is", "and" appear in every clause; matching on them would
    // dress an unrelated standard up as an authority.
    expect(findAuthority(termsIn("is the and of it"))).toEqual([]);
  });

  it("holds to a small number, best first", () => {
    const found = findAuthority(termsIn("data access personal information"));
    expect(found.length).toBeLessThanOrEqual(3);
  });
});

describe("the words worth matching on", () => {
  it("drops noise and keeps the terms", () => {
    expect(termsIn("What is a third party?")).toEqual(["third", "party"]);
  });

  it("does not repeat itself", () => {
    expect(termsIn("data data data")).toEqual(["data"]);
  });
});
