#!/usr/bin/env node
/**
 * Curated demo assessments (G-44 — the demo is a tracked artifact).
 *
 * Why a script and not "type it live": typing a scenario in front of a room
 * is slow and error-prone, and the alternative — demoing on whatever test
 * rows happen to exist — is what put "Picker probe" and
 * "Verifier allno 1787360041071" at the top of the list on demo-data day.
 *
 * Three projects, each earning its place in the running order:
 *   1. Novara scheduling assistant — AI + third party. Lights the most
 *      paths and proves the cross-area derivation (AI ∧ third-party →
 *      fourth parties, TPR_4P).
 *   2. Quarterly close checklist — no AI, no vendor, public data. Proves
 *      intake CLOSES areas before Tier 1 begins.
 *   3. Partner data exchange — mid-assessment, one question handed to the
 *      Third-Party office, so the bell has a real obligation waiting.
 *
 * Re-running SKIPS a project whose name already exists rather than
 * replacing it: answers are insert-only, so the cascade delete is refused
 * by the trigger (F13) — and that is correct. To rebuild the demo set,
 * `pnpm db:reset --yes` first. Nothing else in the database is touched.
 *
 * Runs as a standalone task (§26.5). DEV/DEMO ONLY.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

/**
 * Question ids come from the instrument, never typed here. Gate ids use
 * underscores (`gate.third_party`) and path ids use hyphens
 * (`path.third-party`); hand-written ids silently wrote answers nobody
 * could read, and the demo looked half-finished (found 2026-08-23).
 */
/**
 * The option lists a person actually sees, read from the intake definition.
 * `initiative_type` was seeded as "A new initiative" — a value that is not on
 * the list, so the demo's flagship assessment rendered its control blank and
 * the savebar read "1 still needed here" while the completeness guard passed.
 * Two truths from one value; the guard only tests for non-empty (verifier
 * finding R2, 2026-08-23).
 */
const INTAKE_SRC = readFileSync(join(process.cwd(), "src", "lib", "intake.ts"), "utf8");
const UPDATE_TYPES = [
  ...INTAKE_SRC.match(/UPDATE_TYPES\s*=\s*\[([\s\S]*?)\]/)[1].matchAll(/"([^"]+)"/g),
].map((m) => m[1]);
function optionsFor(fieldId) {
  const at = INTAKE_SRC.indexOf(`id: "${fieldId}"`);
  if (at === -1) return null;
  const raw = INTAKE_SRC.slice(at).match(/options:\s*\[([\s\S]*?)\]/);
  if (!raw) return null;
  const out = [];
  for (const part of raw[1].split(",")) {
    const token = part.trim();
    if (token === "...UPDATE_TYPES") out.push(...UPDATE_TYPES);
    else if (/^"/.test(token)) out.push(token.slice(1, -1));
  }
  return out;
}
/** Database columns are snake_case; intake field ids are camelCase. */
const fieldIdOf = (column) => column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/**
 * Refuse to seed a value a person could never have chosen.
 *
 * The first cut looked up the snake_case column name, found no such field,
 * and returned quietly — a check that cannot locate its subject and passes
 * anyway, which is the exact failure mode it was written to catch. It now
 * throws when the field is unknown.
 */
function checkChoice(project, column, value) {
  if (value === undefined || value === "") return;
  const field = fieldIdOf(column);
  const options = optionsFor(field);
  if (options === null) {
    throw new Error(`${project}: no intake field "${field}" (from column "${column}") — cannot validate.`);
  }
  if (!options.includes(value)) {
    throw new Error(
      `${project}: ${field} = "${value}" is not one of its options.\n  Valid: ${options.join(" | ")}`,
    );
  }
}

const GATES = JSON.parse(
  readFileSync(join(process.cwd(), "src", "data", "instrument", "gates.json"), "utf8"),
);
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

try {
  process.loadEnvFile(".env");
} catch {
  // Variables come from the environment.
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (!/^(localhost|127\.0\.0\.1)$/.test(new URL(url).hostname)) {
  throw new Error("seed-demo is for local demo databases only.");
}
const sql = postgres(url, { max: 1 });

/**
 * A reference answer stores the label as it appeared on screen (NFR-22) —
 * and the id and version are READ from the list, never typed. The first cut
 * invented ids ("operations" where the list says "BU_OPS"), so the stored
 * answer matched no option and the Business Unit control rendered blank on
 * the demo's flagship assessment while the record looked full. That is the
 * third identifier this script guessed and got wrong; nothing here types one
 * any more.
 */
const LISTS = Object.fromEntries(
  ["business-units", "vendors"].map((name) => [
    name,
    JSON.parse(readFileSync(join(process.cwd(), "src", "data", "reference", `${name}.json`), "utf8")),
  ]),
);
function ref(listName, label) {
  const list = LISTS[listName];
  const entry = list.entries.find((e) => e.label === label);
  if (!entry) {
    throw new Error(
      `No "${label}" in the ${listName} list. Available: ${list.entries.map((e) => e.label).join(" | ")}`,
    );
  }
  return { id: entry.id, label: entry.label, version: list.version };
}
/** An off-list answer: recorded as its own shape, not as a list id (FR-30). */
const unlisted = (listName, label) => ({ id: "__unlisted__", label, version: LISTS[listName].version });
/** People are operational, not versioned (G-46's exception). */
const person = (id, label) => ({ id, label, version: "people" });

const PROJECTS = [
  {
    name: "Novara scheduling assistant",
    by: "p.requester", // Priya Sharma
    intake: {
      business_purpose:
        "Cut the time clinic staff spend building weekly rotas, and stop the manual errors that cause understaffed shifts.",
      project_description:
        "A scheduling product from Novara Health that proposes weekly staff rotas from historical demand, leave and skills data. Managers review and approve every proposed rota before it is published; nothing is rostered automatically.",
      uses_ai: "Yes",
      ai_use_case:
        "It proposes a rota. It reads two years of shift history, approved leave and skill matrices, and suggests who works when. A manager reviews every proposal and can change any shift before publishing.",
      // A PoC going live: a real option, it reveals the prior-assessment
      // field the ARA reference belongs in, and it pre-answers Solution
      // Architecture — one more derivation the room can see.
      initiative_type: "Moving a proof of concept into production",
      third_party_involved: "Yes",
      coupa_onboarded: "Yes",
      data_classification: "Confidential",
      business_owner: person("d.reyes", "Camila Reyes"),
      technical_owner: person("d.chen", "Wei Chen"),
      collaborators: "Clinic operations leads, Workforce planning",
      business_unit: ref("business-units", "Operations"),
      other_units: [ref("business-units", "Human Resources")],
      vendor_names: [unlisted("vendors", "Novara Health")],
      data_elements: ["Employee personal information"],
      target_go_live: "2026-11-02",
      prior_assessment_ref: "ARA-100 (2025 vendor onboarding)",
    },
  },
  {
    name: "Quarterly close checklist",
    by: "d.grant", // Alison Grant
    intake: {
      business_purpose:
        "Replace the emailed spreadsheet the finance team uses to track quarter-end tasks with a shared checklist in the tool they already have.",
      project_description:
        "A process change. The same close tasks, the same owners, the same deadlines — moved from an attachment into a shared checklist in our existing collaboration tool. No new system, no new supplier, no personal data.",
      uses_ai: "No",
      initiative_type: "An update or enhancement to something we already run",
      third_party_involved: "No",
      data_classification: "Public",
      business_owner: person("d.acosta", "Elena Acosta"),
      technical_owner: person("d.osei", "Kwame Osei"),
      collaborators: "Financial control",
      business_unit: ref("business-units", "Finance"),
      other_units: [],
      vendor_names: [],
      data_elements: ["None / Unknown"],
      target_go_live: "2026-09-30",
    },
  },
  {
    name: "Partner data exchange",
    by: "d.whitfield", // Grace Whitfield
    intake: {
      business_purpose:
        "Share anonymised claims volumes with two distribution partners so they can forecast their own staffing.",
      project_description:
        "A nightly export of aggregated claims counts to two partner organisations over an existing secure file transfer. No customer records leave; the file holds counts by product and region only.",
      uses_ai: "No",
      initiative_type: "Brand new",
      third_party_involved: "Yes",
      coupa_onboarded: "I'm not sure",
      data_classification: "Internal",
      business_owner: person("d.novak", "Petra Novak"),
      technical_owner: person("d.ferreira", "Rui Ferreira"),
      collaborators: "Partner management",
      business_unit: ref("business-units", "Sales"),
      other_units: [ref("business-units", "Operations")],
      vendor_names: [unlisted("vendors", "Meridian Distribution Partners")],
      data_elements: ["Partner/Vendor contact personal information"],
      target_go_live: "2026-10-15",
    },
  },
  {
    // Already submitted, so the reviewer's queue has real work in it. Without
    // this the whole of S7 and S8 is unreachable from seeded data — the
    // screens exist and the demo has nothing to show them with.
    name: "Sable claims triage",
    by: "d.grant", // Alison Grant
    submitted: true,
    intake: {
      business_purpose:
        "Cut the time a claims handler spends reading a new claim before deciding where it should go.",
      project_description:
        "A triage assistant from Sable Analytics that reads an incoming claim and proposes which queue it belongs in, with the sentences it based that on. A handler accepts or overrides every proposal; nothing routes on its own.",
      uses_ai: "Yes",
      ai_use_case:
        "It proposes a routing queue and shows the passages of the claim it read. The handler decides.",
      initiative_type: "Brand new",
      third_party_involved: "Yes",
      coupa_onboarded: "Yes",
      data_classification: "Confidential",
      business_owner: person("d.grant", "Alison Grant"),
      technical_owner: person("d.chen", "Wei Chen"),
      collaborators: "Claims operations",
      business_unit: ref("business-units", "Finance"),
      other_units: [],
      vendor_names: [unlisted("vendors", "Sable Analytics")],
      data_elements: ["Customer personal information"],
      target_go_live: "2026-12-01",
    },
  },
];

/**
 * The people who own these assessments must be able to sign in, or the demo
 * cannot show the requester half of the journey: two of three curated
 * assessments had owners absent from the front door (verifier finding F6).
 */
/**
 * By name, never by position. Inserting one project into this array
 * silently reassigned every index the last time it used them.
 */
const projectNamed = (name) => {
  const found = PROJECTS.find((p) => p.name === name);
  if (!found) throw new Error(`the seed refers to "${name}", which is not in PROJECTS`);
  return found;
};

const OWNERS = [...new Set(PROJECTS.map((p) => p.by))];
await sql`update people set signs_in = true where id in ${sql(OWNERS)}`;
console.log(`sign-in enabled for ${OWNERS.length} assessment owners`);

const activeVersion = async (slug) => {
  const [row] = await sql`
    select id from instrument_versions
    where slug = ${slug} and activated_at is not null
    order by activated_at desc limit 1`;
  if (!row) throw new Error(`No activated version for ${slug}. Run: pnpm instrument:seed`);
  return row.id;
};

/**
 * Gates the intake already decides must NOT be seeded as answers.
 *
 * Writing them directly records them as the person's own answer, which
 * correctly suppresses the intake provenance — so the rail read "Applies"
 * instead of "Yes · from intake", and demo beats 1 and 2 ("intake closes
 * whole risk areas", "areas pre-answered from intake, each showing its
 * reason") were invisible on two of the three curated assessments. The
 * mechanic was working; the seed was hiding it (verifier finding 5).
 *
 * Read from the instrument, never listed: a gate is left to the engine when
 * a pre-fill rule of its own reads a field this project's intake supplies,
 * or reads a gate we are already leaving to the engine.
 */
function decidedByIntake(intake) {
  // The VALUE has to match, not merely the field exist. The first cut
  // skipped a gate whenever intake supplied the field its rule reads, so
  // Solution Architecture — whose rule fires only on "Moving a proof of
  // concept into production" — was skipped on a project whose initiative
  // type is "Brand new", and the gate was left genuinely unanswered.
  const values = new Map(Object.entries(intake).map(([k, v]) => [fieldIdOf(k), v]));
  const left = new Set();
  const fires = (rule) => {
    const field = rule.when.field;
    if (field.startsWith("gate.")) return left.has(field.slice(5));
    const value = values.get(field);
    return typeof value === "string" && (rule.when.equalsAny ?? []).includes(value);
  };
  // Two passes, because a gate may pre-fill from a gate (§3.1): security
  // follows solution-architecture.
  for (let pass = 0; pass < 2; pass++) {
    for (const category of GATES.categories) {
      if ((category.prefill ?? []).some(fires)) left.add(category.key);
    }
  }
  return left;
}

const gatesVersion = await activeVersion("tier1-gates");
const severityVersion = await activeVersion("tier2-severity");

/** Answers for project 1 — walked forward to the middle of Tier 2. */
const NOVARA_ANSWERS = [
  [gateId("third-party"), "Yes", gatesVersion],
  [gateId("ai"), "Yes", gatesVersion],
  [gateId("data-privacy"), "Yes", gatesVersion],
  [gateId("security-resilience"), "Yes", gatesVersion],
  [gateId("solution-architecture"), "Yes", gatesVersion],
  [gateId("legal-regulatory"), "Yes", gatesVersion],
  [gateId("operational"), "No", gatesVersion],
  [gateId("ethics-conduct"), "Yes", gatesVersion],
  [gateId("people-capacity"), "Yes", gatesVersion],
  [gateId("jurisdiction"), "No", gatesVersion],
  [pathId("third-party"), ["TPR_LA", "TPR_DH", "TPR_OPS"], gatesVersion],
  [pathId("ai"), ["AI_DEC", "AI_RAG", "AI_RET"], gatesVersion],
  [pathId("data-privacy"), ["PRIV"], gatesVersion],
  [pathId("security-resilience"), ["SR_INT"], gatesVersion],
];

/** Project 3 — far enough in that a severity question is open and handed off. */
const PARTNER_ANSWERS = [
  [gateId("third-party"), "Yes", gatesVersion],
  [gateId("ai"), "No", gatesVersion],
  [gateId("data-privacy"), "Yes", gatesVersion],
  [gateId("security-resilience"), "Yes", gatesVersion],
  [gateId("legal-regulatory"), "Yes", gatesVersion],
  [gateId("solution-architecture"), "No", gatesVersion],
  [gateId("operational"), "Yes", gatesVersion],
  [gateId("ethics-conduct"), "No", gatesVersion],
  [gateId("people-capacity"), "No", gatesVersion],
  [gateId("jurisdiction"), "Yes", gatesVersion],
  [pathId("third-party"), ["TPR_DH", "TPR_OPS"], gatesVersion],
  [pathId("data-privacy"), ["PRIV", "DATA_EXT"], gatesVersion],
  [pathId("security-resilience"), ["SR_INT"], gatesVersion],
];

/**
 * Project 4 — answered all the way through, then submitted. Its Tier-3
 * answers are what raise the findings the reviewer settles: one No (a gap)
 * and one Partial (an enhancement).
 */
const SABLE_ANSWERS = [
  [gateId("third-party"), "Yes", gatesVersion],
  [gateId("ai"), "Yes", gatesVersion],
  [gateId("data-privacy"), "Yes", gatesVersion],
  [gateId("security-resilience"), "Yes", gatesVersion],
  [gateId("legal-regulatory"), "No", gatesVersion],
  [gateId("solution-architecture"), "No", gatesVersion],
  [gateId("operational"), "No", gatesVersion],
  [gateId("ethics-conduct"), "No", gatesVersion],
  [gateId("people-capacity"), "No", gatesVersion],
  [gateId("jurisdiction"), "No", gatesVersion],
  [pathId("third-party"), ["TPR_LA", "TPR_DH"], gatesVersion],
  [pathId("ai"), ["AI_DEC"], gatesVersion],
  [pathId("data-privacy"), ["PRIV"], gatesVersion],
  [pathId("security-resilience"), ["SR_INT"], gatesVersion],
  // Privileged access is what pulls the identity controls in — the same
  // derivation Beat 3 demonstrates live on Novara.
  ["sev.tpr_la_1", "High", severityVersion],
];

for (const spec of PROJECTS) {
  for (const field of ["initiative_type", "uses_ai", "third_party_involved", "coupa_onboarded", "data_classification"])
    checkChoice(spec.name, field, spec.intake[field]);
  const [existing] = await sql`
    select id from projects where project_name = ${spec.name} limit 1`;
  if (existing) {
    spec.id = existing.id;
    spec.skipped = true;
    console.log(`skipped ${spec.name} — already present (${existing.id})`);
    continue;
  }
  const columns = { project_name: spec.name, created_by: spec.by, ...spec.intake };
  const [row] = await sql`insert into projects ${sql(columns)} returning id`;
  spec.id = row.id;
  console.log(`created ${spec.name} (${row.id})`);
}

let wrote = 0;
const record = async (projectId, rows, answeredBy, intake) => {
  const left = intake ? decidedByIntake(intake) : new Set();
  const gateKeyOf = (questionId) =>
    GATES.categories.find((c) => c.questionId === questionId)?.key ?? null;
  for (const [questionId, value, versionId] of rows) {
    const key = gateKeyOf(questionId);
    if (key && left.has(key)) continue; // the engine answers this one
    await sql`insert into answers ${sql({
      project_id: projectId,
      question_id: questionId,
      value: JSON.stringify(value),
      source: "person",
      confirmed: true,
      instrument_version_id: versionId,
      answered_by: answeredBy,
    })}`;
    wrote += 1;
  }
};

const novara = projectNamed("Novara scheduling assistant");
const partner = projectNamed("Partner data exchange");
const sable = projectNamed("Sable claims triage");
if (!novara.skipped) await record(novara.id, NOVARA_ANSWERS, novara.by, novara.intake);
if (!partner.skipped) await record(partner.id, PARTNER_ANSWERS, partner.by, partner.intake);
if (!sable.skipped) await record(sable.id, SABLE_ANSWERS, sable.by, sable.intake);
// What was WRITTEN, not what was offered: the gates intake decides are
// deliberately left to the engine, and a count that ignored that reported
// 27 while writing 17.
// Every set that was actually offered — a hardcoded pair reported -4 gates
// "left to the engine" the moment a third assessment was seeded.
const offered = [
  [novara, NOVARA_ANSWERS],
  [partner, PARTNER_ANSWERS],
  [sable, SABLE_ANSWERS],
].reduce((total, [project, rows]) => total + (project.skipped ? 0 : rows.length), 0);
console.log(
  offered === 0
    ? "recorded 0 answers — every project was already present"
    : `recorded ${wrote} answers (${offered - wrote} gates left to the engine, so their reasons show)`,
);

// A live hand-off on project 3, so the bell has real work waiting and the
// obligation is derived rather than staged (FR-36).
if (!partner.skipped)
  await sql`
  insert into handoffs (project_id, question_id, asked_by, to_domain, note)
  values (${partner.id}, ${"sev.tpr_dh_1"}, ${partner.by}, ${"third-party"},
          ${"I don't know what classification the partners hold this under once it lands their side."})`;
console.log("handed off sev.tpr_dh_1 on Partner data exchange → Third-Party & Supply Chain");

/**
 * The submitted assessment's control answers, and the submission itself.
 *
 * The findings are NOT hand-written here: they are derived from these
 * answers by the same rule the product uses (No → gap, Partial →
 * enhancement, §4.3), so seeded data cannot claim a finding the answers
 * would not raise.
 */
if (!sable.skipped) {
  const tier3Version = await activeVersion("tier3-objectives");
  const CONTROL_ANSWERS = [
    ["t3.t3_iam_02", "T3-IAM-02", "Multi-Factor Authentication", "Yes",
      "Enforced for every administrative session, including the vendor's."],
    ["t3.t3_iam_05", "T3-IAM-05", "Access Review & Recertification", "No",
      "No recertification process exists today — access is granted and not reviewed again."],
    ["t3.t3_iam_03", "T3-IAM-03", "Privileged Access Management", "Partial",
      "Admin accounts are named and logged, but they are not checked out through a vault."],
    // Governed by IAM-STD-004 §6.3, so this No arrives as a policy breach
    // rather than a bare gap — the reviewer sees the clause beside it.
    // It must be an objective this assessment actually accumulates: a
    // finding on a control nobody was asked about is invisible in the queue.
    ["t3.t3_iam_10", "T3-IAM-10", "Remote Access", "No",
      "Support connects over a shared VPN account with no gateway in front of it."],
  ];
  for (const [questionId, , , answer, note] of CONTROL_ANSWERS)
    await sql`insert into answers ${sql({
      project_id: sable.id,
      question_id: questionId,
      value: JSON.stringify({ answer, note }),
      source: "person",
      confirmed: true,
      instrument_version_id: tier3Version,
      answered_by: sable.by,
    })}`;

  const declared = Object.entries({
    "intake.business_purpose": ["Business Purpose or Objective", sable.intake.business_purpose],
    "intake.uses_ai": ["Does this use AI or machine learning?", sable.intake.uses_ai],
    "intake.third_party_involved": ["Is a third party involved?", sable.intake.third_party_involved],
    "intake.data_classification": ["Data classification", sable.intake.data_classification],
  }).map(([questionId, [label, value]]) => ({ questionId, label, value }));

  await sql`
    update projects set submitted_at = now() - interval '1 day', submitted_by = ${sable.by}
    where id = ${sable.id}`;
  await sql`insert into declarations ${sql({
    project_id: sable.id,
    declared_by: sable.by,
    shown: JSON.stringify(declared),
    gaps: JSON.stringify([]),
  })}`;

  // The SAME rule the product applies (src/lib/submission.ts): where a
  // policy governs the question, the breach IS the finding and carries the
  // clause. Derived here rather than hand-written, so seeded data can never
  // claim a finding the product would not raise.
  const POLICIES = JSON.parse(
    readFileSync(join(process.cwd(), "src", "data", "reference", "policies.json"), "utf8"),
  );
  const clauseFor = (questionId) => {
    for (const policy of POLICIES.policies)
      for (const clause of policy.clauses)
        for (const requirement of clause.requires)
          if (requirement.questionId === questionId) return { policy, clause, requirement };
    return null;
  };

  const raised = CONTROL_ANSWERS.filter(([, , , answer]) => answer !== "Yes");
  for (const [questionId, objective, objectiveName, answer, note] of raised) {
    const governed = clauseFor(questionId);
    const breaches = governed && answer !== governed.requirement.expect && answer !== "N-A";
    await sql`insert into findings ${sql({
      project_id: sable.id,
      question_id: questionId,
      objective,
      objective_name: objectiveName,
      kind: breaches ? "non-compliance" : answer === "No" ? "gap" : "enhancement",
      note,
      raised_by: sable.by,
      policy_ref: breaches ? governed.policy.reference : null,
      clause_id: breaches ? governed.clause.id : null,
      clause_text: breaches ? governed.clause.text : null,
      expected: breaches ? governed.requirement.expect : null,
    })}`;
  }
  console.log(
    `submitted Sable claims triage with ${raised.length} findings for a reviewer to settle`,
  );
}

await sql.end();
console.log("\ndemo data ready: 4 assessments, 1 waiting obligation, 1 with a reviewer.");
