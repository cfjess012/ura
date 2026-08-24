/**
 * S8 · Who may attest what (FR-17, §19).
 *
 * Authority decides who is answerable for a sign-off, so a wrong rule here
 * is not a UI bug — it is the wrong person's name on the record.
 */
import { describe, expect, it } from "vitest";
import {
  CONTROL_DOMAIN_VERSION,
  attestationRefusal,
  domainForObjective,
  mayAttest,
  whyThatDomain,
} from "@/lib/attestation";
import { OBJECTIVES } from "@/lib/tier3";
import { CATEGORIES } from "@/lib/instrument";
import type { Person } from "@/lib/people";

const who = (role: Person["role"], riskDomain: string | null = null): Person =>
  ({ id: "someone", name: "Someone", role, riskDomain }) as Person;

describe("the mapping is complete and real", () => {
  it("is versioned, because it decides accountability", () => {
    expect(CONTROL_DOMAIN_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("every control objective belongs to a risk area that exists", () => {
    const areas = new Set(CATEGORIES.map((c) => c.key));
    for (const objective of OBJECTIVES) {
      const domain = domainForObjective(objective.id);
      expect(domain, `${objective.id} (${objective.family}) is owned by nobody`).toBeTruthy();
      expect(areas.has(domain!), `${objective.id} → "${domain}" is not a risk area`).toBe(true);
    }
  });

  it("every mapping says why, in words a person can read", () => {
    for (const objective of OBJECTIVES) {
      const because = whyThatDomain(objective.id);
      expect(because, objective.id).toBeTruthy();
      expect(because!.length).toBeGreaterThan(20);
      expect(because).not.toMatch(/T3-|[A-Z]{3,5}-\d/);
    }
  });
});

describe("a Risk Assessor attests under their own profile", () => {
  const iam = OBJECTIVES.find((o) => o.family === "IAM")!;
  const ai = OBJECTIVES.find((o) => o.family === "AI") ?? null;

  it("the area that owns it may", () => {
    expect(mayAttest(who("assessor", domainForObjective(iam.id)), iam.id)).toBe(true);
  });

  it("another area may not, and is told whose it is and why", () => {
    const other = CATEGORIES.map((c) => c.key).find((k) => k !== domainForObjective(iam.id))!;
    expect(mayAttest(who("assessor", other), iam.id)).toBe(false);
    const refusal = attestationRefusal(who("assessor", other), iam.id)!;
    expect(refusal).toMatch(/to attest/);
    expect(refusal.length).toBeGreaterThan(30);
  });

  it("the generalist covers everything, so nothing sits in a queue nobody reads", () => {
    for (const objective of OBJECTIVES) {
      expect(mayAttest(who("assessor", null), objective.id), objective.id).toBe(true);
    }
    if (ai) expect(mayAttest(who("assessor", null), ai.id)).toBe(true);
  });

  it("an administrator is exempt (§2)", () => {
    expect(mayAttest(who("admin"), iam.id)).toBe(true);
  });

  it("a requester never attests — that act is the declaration (G-52)", () => {
    expect(mayAttest(who("requester"), iam.id)).toBe(false);
    expect(attestationRefusal(who("requester"), iam.id)).toMatch(/declared these answers accurate/);
  });
});
