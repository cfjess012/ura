/**
 * Policies, the questions they bear on, and the breaches that follow
 * (SPEC §22.1 compliance checking, §4.3 findings).
 *
 * Three rules shape this file.
 *
 * **The alignment is data, ratified by a human — not something a model
 * decides at request time.** A requester asking "why am I being asked
 * this?" is owed an authority, and an authority a model invented is not
 * one. The agent's job in this area is to *propose* alignments and to read
 * prose a table cannot express; it is never the thing that says a clause
 * applies.
 *
 * **The deterministic pass stands alone.** With no model available, a
 * structured answer that breaches a structured requirement is still caught.
 * That is the guardrail §22.1 puts on this feature, and it is why this
 * module imports nothing but its own data.
 *
 * **A breach is a finding, not a new concept.** It joins the ones Tier-3
 * answers already raise and resolves through the same four governed
 * dispositions — which is the taxonomy the prior platform arrived at the
 * hard way, having first called it a "conflict" and given it its own
 * resolution path (G-59, G-67).
 */
import doc from "@/data/reference/policies.json";

export type PolicyClause = {
  id: string;
  heading: string;
  /** The clause as written. Quoted verbatim on screen; never paraphrased. */
  text: string;
  requires: Array<{ questionId: string; expect: string; because: string }>;
  notAskedYet?: string;
  /**
   * What kind of clause this is.
   *
   * An **obligation** says something shall be done, so a clause nobody is
   * asked about is a hole in the instrument. A **definition** says what a
   * word means; it carries no obligation, and reporting it as uncovered
   * would fill the coverage report with entries nobody can close.
   *
   * Absent means obligation — every clause written before definitions
   * existed is one.
   */
  kind?: "obligation" | "definition";
};

export type Policy = {
  id: string;
  name: string;
  reference: string;
  version: string;
  effective: string;
  /** The risk domain accountable for it, matching the reviewer's area. */
  owner: string;
  clauses: PolicyClause[];
};

const POLICIES: Policy[] = (doc as { policies: Policy[] }).policies;
export const POLICY_VERSION: string = (doc as { version: string }).version;

/** Every policy in the library, newest revision as authored. */
export function policies(): Policy[] {
  return POLICIES;
}

export type Authority = {
  policy: Policy;
  clause: PolicyClause;
  expect: string;
  because: string;
};

/**
 * The clause that requires a question to be asked, or null.
 *
 * This is what turns "answer this" into "answer this because IAM-STD-004
 * §3.4 says so, and here is what it says".
 */
export function authorityFor(questionId: string): Authority | null {
  for (const policy of POLICIES) {
    for (const clause of policy.clauses) {
      const requirement = clause.requires.find(
        (r) => r.questionId === questionId,
      );
      if (requirement) {
        return {
          policy,
          clause,
          expect: requirement.expect,
          because: requirement.because,
        };
      }
    }
  }
  return null;
}

export type PolicyBreach = {
  questionId: string;
  /** What the person answered. */
  answered: string;
  /** What the clause requires. */
  expected: string;
  policyName: string;
  policyReference: string;
  policyVersion: string;
  clauseId: string;
  /** The clause, verbatim — half of the "both quotes side by side". */
  clauseText: string;
  /** What the person wrote alongside their answer — the other half. */
  answerNote: string;
  /** The risk domain accountable for the policy. */
  owner: string;
};

/**
 * Every policy clause a set of answers breaches.
 *
 * Deliberately narrow about what counts. A breach requires an answer that
 * is **present and different from what the clause requires**. An unanswered
 * question is not a breach — it is unanswered, and saying otherwise would
 * turn silence into non-compliance, which is the mirror image of the
 * mistake the never-guess rule exists to stop.
 *
 * An `N-A` is not a breach either: judging a control out of scope is a
 * position a person took, and it is the reviewer's job to test it — the
 * platform must not pre-empt that by calling it a breach first.
 */
export function breachesIn(
  answers: Record<string, { answer: string; note: string }>,
  onlyQuestions?: string[],
): PolicyBreach[] {
  const breaches: PolicyBreach[] = [];
  for (const policy of POLICIES) {
    for (const clause of policy.clauses) {
      for (const requirement of clause.requires) {
        if (onlyQuestions && !onlyQuestions.includes(requirement.questionId))
          continue;
        const given = answers[requirement.questionId];
        if (!given) continue; // unanswered is unanswered, never a breach
        if (given.answer === requirement.expect) continue;
        if (given.answer === "N-A") continue; // a position, for a reviewer to test
        breaches.push({
          questionId: requirement.questionId,
          answered: given.answer,
          expected: requirement.expect,
          policyName: policy.name,
          policyReference: policy.reference,
          policyVersion: policy.version,
          clauseId: clause.id,
          clauseText: clause.text,
          answerNote: given.note,
          owner: policy.owner,
        });
      }
    }
  }
  return breaches;
}

/**
 * Obligations the pilot asks nothing about — a coverage gap in the
 * instrument, named rather than quietly dropped (§22.1). Read the other
 * way this is the report that says what authoring still owes.
 */
export function clausesWithNoQuestion(): Array<{
  policy: Policy;
  clause: PolicyClause;
}> {
  const gaps: Array<{ policy: Policy; clause: PolicyClause }> = [];
  for (const policy of POLICIES) {
    for (const clause of policy.clauses) {
      // A definition is not an obligation, so it cannot be uncovered.
      if (clause.kind === "definition") continue;
      if (clause.requires.length === 0) gaps.push({ policy, clause });
    }
  }
  return gaps;
}

/** How a breach reads to a person, in one sentence. */
export function breachSummary(breach: PolicyBreach): string {
  // The clause id already carries the policy reference; repeating it read
  // as "IAM-STD-004 IAM-STD-004 §3.4".
  return `Answered ${breach.answered} where ${breach.clauseId} requires ${breach.expected}.`;
}
