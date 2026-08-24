/**
 * The handoff report — what a Risk Assessor is given when an assessment
 * reaches them (SPEC §4.4, §4.5).
 *
 * **A report is a reading of the record, never a new fact.** Every number
 * and every sentence here is derived from answers already given; nothing in
 * it can be true unless something in the record made it true. That is what
 * lets it be shown to a leadership audience without a caveat.
 *
 * The structure is deterministic and lives here. An agent may add two
 * things on top — a short contextual summary, and risk scenarios worth
 * asking about — and both are proposals that cite the answers they read
 * (§4.4). With no agent connected the report is complete without them.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import type { Category, GateState } from "./instrument";
import type { Tier3Objective, Tier3Value } from "./tier3";
import type { SynthesisedFinding } from "./submission";
import { authorityFor } from "./policy";

export type ReportArea = {
  name: string;
  /** Applies, closed, or recorded for a reviewer without further questions. */
  standing: "applies" | "closed" | "recorded";
  /** Why it stands that way, in the words the person would recognise. */
  because: string;
};

export type ReportControl = {
  name: string;
  question: string;
  answer: string;
  note: string;
  /** The clause requiring it, where one does. */
  authority: string | null;
};

export type ReportFinding = {
  kind: SynthesisedFinding["kind"];
  objectiveName: string;
  note: string;
  clause: string | null;
  clauseText: string | null;
  expected: string | null;
  /** The edition in force when it was raised (§22.5). */
  policyVersion: string | null;
};

export type Report = {
  activity: string;
  purpose: string;
  areasThatApply: ReportArea[];
  severities: Array<{ name: string; band: string }>;
  controls: ReportControl[];
  findings: ReportFinding[];
  /** Questions nobody answered, named so the reviewer is not surprised. */
  unanswered: string[];
  counts: {
    areasApplying: number;
    areasClosed: number;
    controlsRequired: number;
    controlsAnswered: number;
    findings: number;
    breaches: number;
  };
};

/**
 * Assemble the report from what is on record.
 *
 * Takes already-derived state rather than re-deriving it: the summary a
 * reviewer reads must agree with the screens they just came from, and the
 * way to guarantee that is to compute it once.
 */
export function reportFrom(input: {
  activity: string;
  purpose: string;
  states: GateState[];
  severityBands: Array<{ name: string; band: string }>;
  required: Tier3Objective[];
  values: Record<string, Tier3Value | undefined>;
  findings: SynthesisedFinding[];
  asksNothingFurther: (key: string) => boolean;
}): Report {
  const areasThatApply: ReportArea[] = input.states.map((state) => {
    const applies = state.settled || state.answer === "Yes";
    const quiet = applies && input.asksNothingFurther(state.category.key);
    return {
      name: state.category.name,
      standing: !applies ? "closed" : quiet ? "recorded" : "applies",
      because:
        state.because ??
        (applies ? "it applies to this activity" : "it was ruled out"),
    };
  });

  const controls: ReportControl[] = [];
  const unanswered: string[] = [];
  for (const objective of input.required) {
    const value = input.values[objective.questionId];
    if (!value) {
      unanswered.push(objective.name);
      continue;
    }
    const authority = authorityFor(objective.questionId);
    controls.push({
      name: objective.name,
      question: objective.text,
      answer: value.answer,
      note: value.note.trim(),
      authority: authority ? authority.clause.id : null,
    });
  }

  const findings: ReportFinding[] = input.findings.map((finding) => ({
    kind: finding.kind,
    objectiveName: finding.objectiveName,
    note: finding.note,
    clause: finding.citation?.clauseId ?? null,
    policyVersion: finding.citation?.policyVersion ?? null,
    clauseText: finding.citation?.clauseText ?? null,
    expected: finding.citation?.expected ?? null,
  }));

  return {
    activity: input.activity,
    purpose: input.purpose,
    areasThatApply,
    severities: input.severityBands,
    controls,
    findings,
    unanswered,
    counts: {
      areasApplying: areasThatApply.filter((a) => a.standing !== "closed")
        .length,
      areasClosed: areasThatApply.filter((a) => a.standing === "closed").length,
      controlsRequired: input.required.length,
      controlsAnswered: controls.length,
      findings: findings.length,
      breaches: findings.filter((f) => f.kind === "non-compliance").length,
    },
  };
}

/**
 * A risk scenario an agent proposed: something worth asking about, and the
 * answers it was read from.
 *
 * It is a **question to put to somebody**, never a finding. §4.4 is explicit
 * that a scenario counts only once a Risk Assessor accepts it, and the
 * shape says so — there is no field here that could record acceptance.
 */
export type ProposedScenario = {
  /** One sentence: what could go wrong, in this activity's own terms. */
  scenario: string;
  /** What the assessor might ask to find out. */
  ask: string;
  /** The controls or areas it was read from, by name. */
  from: string[];
};

/**
 * Keep only scenarios that cite something actually in the report.
 *
 * §4.4 requires a scenario to cite the answers it builds on. A citation to
 * something that is not there is not a weaker scenario — it is one built on
 * nothing, and it is dropped rather than shown with a caveat.
 */
export function groundedScenarios(
  proposed: ProposedScenario[],
  report: Report,
): ProposedScenario[] {
  const known = new Set<string>([
    ...report.controls.map((c) => c.name.toLowerCase()),
    ...report.areasThatApply.map((a) => a.name.toLowerCase()),
    ...report.findings.map((f) => f.objectiveName.toLowerCase()),
  ]);
  return proposed.filter((scenario) => {
    if (scenario.scenario.trim() === "" || scenario.ask.trim() === "")
      return false;
    if (scenario.from.length === 0) return false;
    return scenario.from.every((cite) => known.has(cite.trim().toLowerCase()));
  });
}

/** The one-line standing, for the top of the report. */
export function standingLine(report: Report): string {
  const { counts } = report;
  if (counts.findings === 0) {
    return `${counts.controlsAnswered} of ${counts.controlsRequired} controls answered, and nothing outstanding.`;
  }
  const breaches =
    counts.breaches > 0
      ? `, ${counts.breaches} of them against a policy clause`
      : "";
  return `${counts.controlsAnswered} of ${counts.controlsRequired} controls answered, raising ${counts.findings} finding${counts.findings === 1 ? "" : "s"}${breaches}.`;
}
