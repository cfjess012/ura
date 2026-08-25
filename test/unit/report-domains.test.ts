import { describe, expect, it } from "vitest";
import { domainSlices, unfiledScenarios } from "@/lib/report-domains";
import { domainForObjective } from "@/lib/attestation";
import { OBJECTIVES } from "@/lib/tier3";
import type { Report } from "@/lib/report";

/** Two objectives the ratified map puts in different risk domains. */
function twoDomains() {
  const seen = new Map<string, (typeof OBJECTIVES)[number]>();
  for (const objective of OBJECTIVES) {
    const domain = domainForObjective(objective.id);
    if (domain && !seen.has(domain)) seen.set(domain, objective);
    if (seen.size === 2) break;
  }
  const [a, b] = [...seen.values()];
  return {
    a,
    b,
    aDomain: domainForObjective(a.id)!,
    bDomain: domainForObjective(b.id)!,
  };
}

function reportWith(
  controls: Report["controls"],
  findings: Report["findings"] = [],
): Report {
  return {
    activity: "an activity",
    purpose: "",
    areasThatApply: [],
    severities: [],
    controls,
    findings,
    unanswered: [],
    counts: {
      areasApplying: 0,
      areasClosed: 0,
      controlsRequired: controls.length,
      controlsAnswered: controls.length,
      findings: findings.length,
      breaches: 0,
    },
  };
}

const control = (o: (typeof OBJECTIVES)[number]) => ({
  objective: o.id,
  name: o.name,
  question: o.text,
  answer: "No",
  note: "",
  authority: null,
});

describe("splitting the handoff summary by risk domain", () => {
  it("files each control under the domain the ratified map gives it", () => {
    // Never a model's opinion about who should look at something:
    // control-domains.json is versioned data a person ratified (NFR-20).
    const { a, b, aDomain, bDomain } = twoDomains();
    const slices = domainSlices(reportWith([control(a), control(b)]), []);
    expect(slices.find((s) => s.key === aDomain)?.controls).toHaveLength(1);
    expect(slices.find((s) => s.key === bDomain)?.controls).toHaveLength(1);
  });

  it("shows no tab for a domain with nothing in it", () => {
    // An empty tab is a promise of content that is not there, and a reviewer
    // who opens two of them stops opening them.
    const { a } = twoDomains();
    const slices = domainSlices(reportWith([control(a)]), []);
    expect(slices).toHaveLength(1);
  });

  it("files a scenario by what it says it read", () => {
    const { a, aDomain } = twoDomains();
    const slices = domainSlices(reportWith([control(a)]), [
      { scenario: "something", ask: "a question", from: [a.name] },
    ]);
    expect(slices.find((s) => s.key === aDomain)?.scenarios).toHaveLength(1);
  });

  it("shows a cross-domain scenario in both, rather than picking one", () => {
    // A reviewer seeing half of a cross-domain question is worse than two
    // people seeing the same one.
    const { a, b, aDomain, bDomain } = twoDomains();
    const slices = domainSlices(reportWith([control(a), control(b)]), [
      { scenario: "spans both", ask: "?", from: [a.name, b.name] },
    ]);
    expect(slices.find((s) => s.key === aDomain)?.scenarios).toHaveLength(1);
    expect(slices.find((s) => s.key === bDomain)?.scenarios).toHaveLength(1);
  });

  it("keeps a scenario no domain owns, rather than losing it to the filing", () => {
    const { a } = twoDomains();
    const orphan = {
      scenario: "cites nothing owned",
      ask: "?",
      from: ["Not A Control"],
    };
    const report = reportWith([control(a)]);
    expect(
      domainSlices(report, [orphan]).every((s) => s.scenarios.length === 0),
    ).toBe(true);
    expect(unfiledScenarios(report, [orphan])).toHaveLength(1);
  });

  it("orders the tabs by what should be opened first", () => {
    const { a, b, aDomain } = twoDomains();
    const breach = {
      kind: "non-compliance" as const,
      objective: a.id,
      objectiveName: a.name,
      note: "",
      clause: "C-1",
      clauseText: "text",
      expected: "Yes",
      policyVersion: "1.0",
    };
    const slices = domainSlices(
      reportWith([control(a), control(b)], [breach]),
      [],
    );
    expect(slices[0].key).toBe(aDomain);
    expect(slices[0].breaches).toBe(1);
  });
});
