#!/usr/bin/env node
/**
 * Eleven more assessments, spread across the whole lifecycle — because a
 * queue where everything stops at "submitted" does not look like a queue.
 *
 * `seed-scenarios.mjs` gives the reviewer twenty-five shapes to receive but
 * none of them further along than the declaration. `seed-finished.mjs` gives
 * one that is finished. Between the two there is nothing: no assessment
 * sitting with findings raised and nobody's signature on them yet, and only
 * one example of how a finding gets settled. So this set is weighted the way
 * a real backlog is — a few just arrived, most in the middle waiting on a
 * reviewer, a few closed out:
 *
 *   early        — intake only, or assessed with controls still owed (3)
 *   under review — submitted, controls answered, findings raised, and NOT
 *                  attested. The state a reviewer opens the queue to find. (4)
 *   settled      — every control answer attested by the domain that owns it,
 *                  every finding closed, with a different mix of the four
 *                  dispositions each time. (4)
 *   news         — three questions Isabelle handed to a risk office, each
 *                  answered, so the requester's bell has something in it.
 *
 * The same rules as the finished seed apply: findings are derived from the
 * control answers by the rule submission.ts uses, the breached clause is
 * looked up in policies.json, attestations are signed only by the assessor
 * whose domain owns the control family, and a risk acceptance is signed by
 * a second person because the CHECK constraint would refuse anything else.
 *
 * One rule is stricter here. A control is only answered if the severity
 * answers actually bring it in (severity.json `requires`), checked before a
 * row is written — so no finding is ever raised on a control the product
 * would not have asked about.
 *
 * Re-running skips any scenario whose name already exists. To rebuild,
 * `pnpm db:reset --yes` first. Nothing else in the database is touched.
 *
 * Runs as a standalone task (§26.5). DEV ONLY.
 *
 *   pnpm demo:lifecycle
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { DEEP, EARLY, NEWS } from "./seed-lifecycle.data.mjs";

try {
  process.loadEnvFile(".env");
} catch {
  /* variables come from the environment */
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (
  !/^(localhost|127\.0\.0\.1)$/.test(new URL(url).hostname) &&
  process.env.DEMO_DB_IS_DISPOSABLE !== "yes"
) {
  throw new Error(
    "seed-lifecycle writes demo data, so it refuses a database that is not local.\n" +
      "  Set DEMO_DB_IS_DISPOSABLE=yes if this one is a throwaway.",
  );
}

const read =(...p) => JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8"));
const GATES = read("src", "data", "instrument", "gates.json");
const SEVERITY = read("src", "data", "instrument", "severity.json");
const TIER3 = read("src", "data", "instrument", "tier3.json");
const POLICIES = read("src", "data", "reference", "policies.json");
const gateId = (key) => {
  const category = GATES.categories.find((c) => c.key === key);
  if (!category) throw new Error(`No such risk area: ${key}`);
  return category.questionId;
};
const pathId = (key) => {
  const category = GATES.categories.find((c) => c.key === key);
  if (!category?.pathQuestion) throw new Error(`${key} has no path question`);
  return category.pathQuestion.questionId;
};
const clauseFor =(questionId) => {
  for (const policy of POLICIES.policies)
    for (const clause of policy.clauses)
      for (const requirement of clause.requires ?? [])
        if (requirement.questionId === questionId) return { policy, clause, requirement };
  return null;
};
/** Severity questions asked of every assessment, whatever else applies. */
const ALWAYS_ASKED = SEVERITY.questions.filter((q) => q.path === null).map((q) => q.questionId);
/** Control objectives by question id: [code, name]. */
const OBJECTIVES = Object.fromEntries(
  TIER3.objectives.map((o) => [o.questionId, [o.id, o.name]]),
);
const BAND = { Low: 0, Medium: 1, High: 2 };

/**
 * Which gates the intake already decides. Seeding those as answers would
 * record them as the person's own and hide the intake provenance the rail
 * shows — the trap `seed-demo.mjs` documents. Security & resilience follows
 * the architecture gate whoever answered it, so it is never answered here.
 */
function decidedByIntake(row) {
  const values = {
    usesAi: row.uses_ai,
    thirdPartyInvolved: row.third_party_involved,
    dataClassification: row.data_classification,
    initiativeType: row.initiative_type,
    coupaOnboarded: row.coupa_onboarded,
  };
  const left = new Set();
  const fires = (rule) => {
    const field = rule.when?.field;
    if (!field) return false;
    if (field.startsWith("gate.")) return left.has(field.slice(5));
    const value = values[field];
    return typeof value === "string" && (rule.when.equalsAny ?? []).includes(value);
  };
  for (let pass = 0; pass < 2; pass += 1) {
    for (const category of GATES.categories) {
      if ((category.prefill ?? []).some(fires)) left.add(category.key);
    }
  }
  return left;
}

/**
 * The controls a set of severity answers brings in — the same `requires`
 * rule the instrument carries, so the seed cannot answer a control the
 * product would not ask about.
 */
function applicableControls(severities) {
  const codes = new Set();
  for (const [questionId, band] of Object.entries(severities)) {
    const question = SEVERITY.questions.find((q) => q.questionId === questionId);
    if (!question) throw new Error(`no such severity question: ${questionId}`);
    for (const r of question.requires ?? [])
      if (BAND[band] >= BAND[r.atLeast]) codes.add(r.objective);
  }
  return new Set(
    Object.entries(OBJECTIVES)
      .filter(([, [code]]) => codes.has(code))
      .map(([questionId]) => questionId),
  );
}

/** Signed by the domain that owns the family (control-domains.json). */
const signerFor = (questionId) =>
  questionId.startsWith("t3.t3_dp_")
    ? ["a.privacy", "data-privacy"]
    : ["a.security", "security-resilience"];

/* ------------------------------------------------- check before writing */

for (const scenario of DEEP) {
  const chosen = new Set(Object.values(scenario.paths).flat());
  for (const questionId of Object.keys(scenario.severities)) {
    const q = SEVERITY.questions.find((s) => s.questionId === questionId);
    if (!q) throw new Error(`${scenario.name}: no such severity question ${questionId}`);
    const derived = q.path === "PI_AI" && chosen.has("PRIV") && scenario.row.uses_ai === "Yes";
    if (q.path !== null && !chosen.has(q.path) && !derived)
      throw new Error(`${scenario.name}: ${questionId} needs path ${q.path}, which is not chosen`);
  }
  for (const questionId of ALWAYS_ASKED)
    if (!(questionId in scenario.severities))
      throw new Error(`${scenario.name}: ${questionId} is asked of everyone and is unanswered`);
  const applicable = applicableControls(scenario.severities);
  for (const [questionId] of scenario.controls) {
    if (!OBJECTIVES[questionId]) throw new Error(`${scenario.name}: no such control ${questionId}`);
    if (!applicable.has(questionId))
      throw new Error(`${scenario.name}: ${questionId} is answered but the severities do not bring it in`);
  }
  for (const s of scenario.settlements ?? [])
    if (!scenario.controls.some(([id, value]) => id === s.questionId && value !== "Yes"))
      throw new Error(`${scenario.name}: settlement on ${s.questionId} has no finding to settle`);
}

/* ---------------------------------------------------------------- */

const sql = postgres(url, { max: 1 });

const activeVersion = async (slug) => {
  const [row] = await sql`
    select id from instrument_versions
    where slug = ${slug} and activated_at is not null
    order by activated_at desc limit 1`;
  if (!row) throw new Error(`No activated version for ${slug}. Run: pnpm instrument:seed`);
  return row.id;
};
const gatesVersion = await activeVersion("tier1-gates");
const severityVersion = await activeVersion("tier2-severity");
const tier3Version = await activeVersion("tier3-objectives");

const stored = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      typeof v === "object" && v !== null ? JSON.stringify(v) : v,
    ]),
  );

const exists = async (name) => {
  const [row] = await sql`select id from projects where project_name = ${name} limit 1`;
  return row?.id;
};

const answer = (projectId, by) => async (questionId, value, versionId) => {
  await sql`insert into answers ${sql({
    project_id: projectId,
    question_id: questionId,
    value: JSON.stringify(value),
    source: "person",
    confirmed: true,
    instrument_version_id: versionId,
    answered_by: by,
  })}`;
};

const DECLARED = (row) =>
  [
    ["intake.project_description", "Project Description", row.project_description],
    ["intake.uses_ai", "Does this use AI or machine learning?", row.uses_ai],
    ["intake.third_party_involved", "Does anything about this involve a company outside ours?", row.third_party_involved],
    ["intake.data_classification", "What's the most sensitive data involved?", row.data_classification],
  ].map(([questionId, label, value]) => ({ questionId, label, value }));

const daysAgo = (n) => sql`now() - make_interval(days => ${n})`;
const daysAhead = (n) => sql`now() + make_interval(days => ${n})`;

let made = 0;
let skipped = 0;

// ------------------------------------------------------------------ early

for (const scenario of EARLY) {
  if (await exists(scenario.name)) {
    skipped += 1;
    continue;
  }
  const [project] = await sql`insert into projects ${sql({
    project_name: scenario.name,
    created_by: scenario.by,
    ...stored(scenario.row),
  })} returning id`;
  made += 1;
  console.log(`${scenario.name} — ${scenario.depth}`);
  if (scenario.depth === "intake") continue;

  const put = answer(project.id, scenario.by);
  const decided = decidedByIntake(scenario.row);
  for (const category of GATES.categories) {
    if (decided.has(category.key) || category.alwaysApplies) continue;
    await put(category.questionId, scenario.opens.includes(category.key) ? "Yes" : "No", gatesVersion);
  }
  for (const questionId of ALWAYS_ASKED) await put(questionId, scenario.weight, severityVersion);
}

// ------------------------------------------------------------------- deep

for (const scenario of DEEP) {
  if (await exists(scenario.name)) {
    skipped += 1;
    continue;
  }
  const [project] = await sql`insert into projects ${sql({
    project_name: scenario.name,
    created_by: scenario.by,
    ...stored(scenario.row),
  })} returning id`;
  made += 1;
  const put = answer(project.id, scenario.by);

  const decided = decidedByIntake(scenario.row);
  for (const category of GATES.categories) {
    if (decided.has(category.key) || category.alwaysApplies) continue;
    if (category.key === "security-resilience") continue;
    await put(category.questionId, scenario.gates[category.key] ?? "No", gatesVersion);
  }
  for (const [key, paths] of Object.entries(scenario.paths)) await put(pathId(key), paths, gatesVersion);
  for (const [questionId, band] of Object.entries(scenario.severities))
    await put(questionId, band, severityVersion);
  for (const [questionId, value, note] of scenario.controls)
    await put(questionId, { answer: value, note }, tier3Version);

  // Submission: a one-way fact, and the declaration of what was shown.
  await sql`
    update projects
       set submitted_at = ${daysAgo(scenario.submittedDaysAgo)}, submitted_by = ${scenario.by}
     where id = ${project.id}`;
  await sql`insert into declarations ${sql({
    project_id: project.id,
    declared_by: scenario.by,
    declared_at: daysAgo(scenario.submittedDaysAgo),
    shown: JSON.stringify(DECLARED(scenario.row)),
    gaps: JSON.stringify([]),
  })}`;

  // Findings, by the rule submission.ts uses: anything other than Yes.
  const findingIds = {};
  const raised = scenario.controls.filter(([, value]) => value !== "Yes");
  for (const [questionId, value, note] of raised) {
    const [objective, objectiveName] = OBJECTIVES[questionId];
    const governed = clauseFor(questionId);
    const breaches = governed && value !== governed.requirement.expect && value !== "N-A";
    const [row] = await sql`insert into findings ${sql({
      project_id: project.id,
      question_id: questionId,
      objective,
      objective_name: objectiveName,
      kind: breaches ? "non-compliance" : value === "No" ? "gap" : "enhancement",
      note,
      raised_at: daysAgo(scenario.submittedDaysAgo),
      raised_by: scenario.by,
      policy_ref: breaches ? governed.policy.reference : null,
      policy_version: breaches ? governed.policy.version : null,
      clause_id: breaches ? governed.clause.id : null,
      clause_text: breaches ? governed.clause.text : null,
      expected: breaches ? governed.requirement.expect : null,
    })} returning id`;
    findingIds[questionId] = row.id;
  }

  if (!scenario.settlements) {
    console.log(`${scenario.name} — under review, ${raised.length} findings waiting`);
    continue;
  }

  // Attestation: every answer signed by the domain that owns its family.
  const corrections = scenario.corrections ?? {};
  const rationale = scenario.rationale ?? {};
  for (const [questionId, value, note] of scenario.controls) {
    const [by, domain] = signerFor(questionId);
    const correction = corrections[questionId];
    const act = correction ? "correct" : value === "N-A" ? "not-applicable" : "approve";
    await sql`insert into attestations ${sql({
      project_id: project.id,
      question_id: questionId,
      attested_by: by,
      attested_domain: domain,
      attested_at: daysAgo(scenario.attestedDaysAgo),
      act,
      corrected_answer: correction ? correction.to : null,
      note: correction
        ? correction.why
        : (rationale[questionId] ?? `Checked against the evidence provided. ${note.split(".")[0]}.`),
    })}`;
  }

  // Settlement: a row of its own per finding, never an edit.
  for (const s of scenario.settlements) {
    const { questionId, dueInDays, expiresInDays, ...row } = s;
    await sql`insert into dispositions ${sql({
      finding_id: findingIds[questionId],
      resolved_at: daysAgo(scenario.settledDaysAgo),
      ...row,
      ...(dueInDays ? { remediation_due: daysAhead(dueInDays) } : {}),
      ...(expiresInDays ? { expires_at: daysAhead(expiresInDays) } : {}),
    })}`;
  }
  console.log(`${scenario.name} — settled: ${scenario.settlements.map((s) => s.kind).join(", ")}`);
}

// ------------------------------------------------------------------- news

let answered = 0;
for (const item of NEWS) {
  const projectId = await exists(item.project);
  if (!projectId) {
    console.log(`news for "${item.project}" skipped — that assessment is not seeded`);
    continue;
  }
  const [already] = await sql`
    select id from handoffs
    where project_id = ${projectId} and question_id = ${item.questionId} and asked_by = ${item.askedBy}
    limit 1`;
  if (already) continue;
  const [handoff] = await sql`insert into handoffs ${sql({
    project_id: projectId,
    question_id: item.questionId,
    asked_by: item.askedBy,
    to_domain: item.toDomain ?? null,
    to_person_id: item.toPerson ?? null,
    note: item.note,
    created_at: daysAgo(item.askedDaysAgo),
    resolved_at: item.resolved ? daysAgo(item.resolved.daysAgo) : null,
    resolved_by: item.resolved?.by ?? null,
  })} returning id`;
  await sql`insert into handoff_replies ${sql({
    handoff_id: handoff.id,
    author_id: item.reply.by,
    body: item.reply.body,
    created_at: sql`now() - make_interval(hours => ${item.reply.hoursAgo})`,
  })}`;
  answered += 1;
}

console.log(
  `\n${made} assessments created, ${skipped} already present, ${answered} hand-offs answered.`,
);
await sql.end();
