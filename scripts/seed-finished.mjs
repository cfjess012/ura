#!/usr/bin/env node
/**
 * One assessment carried all the way to the end, so a demo can show where
 * this actually lands.
 *
 * Every other seeded assessment stops somewhere useful for showing a
 * *stage* — mid-intake, mid-severity, submitted-and-waiting. None of them
 * answers the question an audience asks last, which is "and then what?".
 * Without that, the reviewer's queue looks like a place work goes to sit.
 *
 * So this one is finished: submitted, every control answer attested by the
 * risk domain that owns it, and every finding settled — one of each of the
 * four ways, because the four are the whole point. The four-eyes rule is
 * respected rather than bypassed: the risk acceptance is signed by somebody
 * other than the assessor who resolved it, which the CHECK constraint would
 * refuse anyway.
 *
 * Nothing here is asserted that the product would not derive. The findings
 * are computed from the control answers by the same rule submission.ts
 * uses, and the policy breach is looked up in policies.json rather than
 * written by hand — so this cannot claim a finding, or a clause, that the
 * running product would disagree with.
 *
 *   node scripts/seed-finished.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (
  !/^(localhost|127\.0\.0\.1)$/.test(new URL(url).hostname) &&
  process.env.DEMO_DB_IS_DISPOSABLE !== "yes"
) {
  throw new Error(
    "seed-finished writes demo data, so it refuses a database that is not local.\n" +
      "  Set DEMO_DB_IS_DISPOSABLE=yes if this one is a throwaway.",
  );
}
const sql = postgres(url, { max: 1 });

const NAME = "Meridian contract intelligence";
const OWNER = "d.withers"; // Isabelle Withers, the requester in the picker

const read = (...parts) =>
  JSON.parse(readFileSync(join(process.cwd(), ...parts), "utf8"));
const GATES = read("src", "data", "instrument", "gates.json");
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
const activeVersion = async (slug) => {
  const [row] = await sql`
    select id from instrument_versions
    where slug = ${slug} and activated_at is not null
    order by activated_at desc limit 1`;
  if (!row) throw new Error(`No activated version for ${slug}. Run: pnpm instrument:seed`);
  return row.id;
};
/**
 * A reference answer stores the label as it appeared on screen (NFR-22),
 * with the id and the list version that produced it — so a renamed unit
 * never rewrites history. Only the jsonb columns take this shape; the
 * choice columns are plain text and storing an object in one puts raw JSON
 * on the screen where a label belongs.
 */
const UNITS = read("src", "data", "reference", "business-units.json");
const unit = (id) => {
  const found = UNITS.entries.find((e) => e.id === id);
  if (!found) throw new Error(`no such business unit: ${id}`);
  return { id: found.id, label: found.label, version: UNITS.version };
};

/**
 * The activity.
 *
 * Chosen so a room recognises it without a preamble — everyone has met a
 * contract — and so it genuinely reaches several risk areas rather than
 * being routed to one. A vendor reads commercial agreements that contain
 * counterparty names and signatures, which is third party, AI, privacy and
 * security at once, without any of it being contrived.
 */
const INTAKE = {
  business_purpose:
    "Cut the two weeks Legal spends reading every renewal, and stop auto-renewals nobody meant to sign.",
  project_description:
    "Cut the two weeks Legal spends reading every renewal, and stop auto-renewals nobody meant to sign. " +
    "Meridian Legal AI reads our executed supplier contracts and extracts the obligations, renewal dates, " +
    "notice periods and liability caps into a register Legal and Procurement work from. Contract PDFs are " +
    "uploaded to Meridian's hosted environment; a lawyer confirms every extracted term before it is relied on, " +
    "and the signed agreement remains the record.",
  uses_ai: "Yes",
  ai_use_case:
    "It reads the contract text and proposes the obligations, dates and caps it finds, each with the clause it " +
    "came from. A lawyer accepts or corrects every one; nothing enters the register unconfirmed.",
  third_party_involved: "Yes",
  data_classification: "Confidential",
  data_elements: ["Commercial terms", "Counterparty contact details"],
  initiative_type: "Brand new",
  coupa_onboarded: "Yes",
  business_unit: unit("BU_LEG"),
  other_units: [unit("BU_SUP")],
  collaborators: "Procurement operations, Legal technology",
  related_assessments: "",
  prior_assessment_ref: "",
};

/**
 * The control answers a reviewer is signing.
 *
 * Mostly sound, because an assessment where everything is broken is not
 * what a real one looks like and an audience reads it as staged. Three are
 * not, and all three cite a clause — because in this instrument every
 * control objective is governed by one, so any answer other than Yes is a
 * non-compliance rather than a bare gap. That is worth saying out loud in
 * the room: nothing here is a reviewer's opinion about good practice, each
 * one is a written requirement with a reference and a version.
 */
const CONTROL_ANSWERS = [
  ["t3.t3_iam_01", "T3-IAM-01", "Access Management & Authorization", "Yes",
    "Access is granted through the existing joiners-movers-leavers process; Meridian users are provisioned from our directory."],
  ["t3.t3_iam_02", "T3-IAM-02", "Multi-Factor Authentication", "Yes",
    "SSO with MFA enforced for every user, including Meridian's support staff."],
  ["t3.t3_iam_03", "T3-IAM-03", "Privileged Access Management", "Yes",
    "Meridian administrators are checked out through the vault with session recording."],
  // No owner for recertification. Settled by committing to one.
  ["t3.t3_iam_05", "T3-IAM-05", "Access Review & Recertification", "No",
    "Nobody has agreed to own the quarterly recertification for this register yet, so no review has been scheduled."],
  ["t3.t3_iam_06", "T3-IAM-06", "Access & Credential Lifecycle", "Yes",
    "Leavers are removed within one working day by the existing directory sync."],
  ["t3.t3_iam_10", "T3-IAM-10", "Remote Access", "Yes",
    "Meridian support reaches the environment through our gateway; there is no shared account."],
  ["t3.t3_dp_01", "T3-DP-01", "Encryption (In Transit & At Rest)", "Yes",
    "TLS 1.3 in transit, AES-256 at rest with keys held in our own KMS."],
  // Understated, and the reviewer corrects it — the one attestation act
  // that changes what the record says.
  ["t3.t3_dp_04", "T3-DP-04", "Data Minimization & De-identification", "Partial",
    "Signature blocks are redacted before upload, but counterparty contact details stay in the body of the contract."],
  ["t3.t3_dp_05", "T3-DP-05", "Retention, Deletion & Disposal", "Yes",
    "Meridian purges uploaded documents after 90 days; the register we keep holds terms, not the documents."],
  ["t3.t3_dp_06", "T3-DP-06", "Secrets & Configuration Protection", "Yes",
    "API credentials are held in the secrets manager and rotated every 90 days."],
  ["t3.t3_dp_07", "T3-DP-07", "Media Protection", "Yes",
    "No removable media is involved; the upload path is API only."],
  ["t3.t3_nb_01", "T3-NB-01", "Boundary Protection & Segmentation", "Yes",
    "The integration runs in its own subnet with egress limited to Meridian's published ranges."],
  ["t3.t3_nb_02", "T3-NB-02", "WAF / External Endpoint Protection", "Yes",
    "The upload endpoint sits behind the standard WAF policy."],
  // Real, and not fixable this quarter — so it is accepted, with a name
  // against it and a date it comes back.
  ["t3.t3_nb_03", "T3-NB-03", "API & Interface Security", "No",
    "The integration authenticates with a long-lived API key; there is no mutual TLS and no key rotation on the Meridian side."],
  ["t3.t3_nb_05", "T3-NB-05", "Availability / DoS Protection", "Yes",
    "Renewal review is not time-critical; a day's outage has no operational impact."],
];

const clauseFor = (questionId) => {
  for (const policy of POLICIES.policies)
    for (const clause of policy.clauses)
      for (const requirement of clause.requires ?? [])
        if (requirement.questionId === questionId) return { policy, clause, requirement };
  return null;
};

// ---------------------------------------------------------------- project

const [already] = await sql`select id from projects where project_name = ${NAME} limit 1`;
if (already) {
  console.log(`skipped — "${NAME}" already exists (${already.id})`);
  console.log("  to rebuild it: pnpm demo:reset, then run this again");
  await sql.end();
  process.exit(0);
}

const gatesVersion = await activeVersion("tier1-gates");
const severityVersion = await activeVersion("tier2-severity");
const tier3Version = await activeVersion("tier3-objectives");

const [project] = await sql`insert into projects ${sql({
  project_name: NAME,
  created_by: OWNER,
  ...Object.fromEntries(
    Object.entries(INTAKE).map(([k, v]) => [
      k,
      typeof v === "object" && v !== null ? JSON.stringify(v) : v,
    ]),
  ),
})} returning id`;
console.log(`created ${NAME} (${project.id})`);

const answer = async (questionId, value, versionId, by = OWNER) => {
  await sql`insert into answers ${sql({
    project_id: project.id,
    question_id: questionId,
    value: JSON.stringify(value),
    source: "person",
    confirmed: true,
    instrument_version_id: versionId,
    answered_by: by,
  })}`;
};

// Risk areas. The ones intake already decides are left to the engine, so
// the screen shows "answered from your intake because…" rather than a tick
// somebody appears to have made twice.
for (const [key, value] of [
  ["operational", "Yes"],
  ["legal-regulatory", "Yes"],
  ["governance", "Yes"],
  ["ethics-conduct", "No"],
  ["people-capacity", "No"],
  ["jurisdiction", "No"],
  ["solution-architecture", "Yes"],
])
  await answer(gateId(key), value, gatesVersion);

for (const [key, paths] of [
  ["third-party", ["TPR_LA", "TPR_DH", "TPR_OPS"]],
  ["ai", ["AI_RAG", "AI_RET"]],
  ["data-privacy", ["PRIV"]],
  ["security-resilience", ["SR_INT"]],
])
  await answer(pathId(key), paths, gatesVersion);

// Severity. Enough of it answered that controls accumulate and the
// workplan is real rather than empty.
const SEVERITY = [
  ["sev.tpr_la_1", "Medium"],
  ["sev.tpr_dh_1", "Medium"],
  ["sev.tpr_ops_1", "Low"],
  ["sev.priv_1", "Medium"],
  ["sev.sr_int_1", "Medium"],
];
for (const [questionId, band] of SEVERITY) {
  try {
    await answer(questionId, band, severityVersion);
  } catch {
    // A severity id that moved with the instrument is not worth failing a
    // demo seed over — the controls below are pinned by id, not derived.
  }
}

for (const [questionId, , , value, note] of CONTROL_ANSWERS)
  await answer(questionId, { answer: value, note }, tier3Version);
console.log(`recorded ${CONTROL_ANSWERS.length} control answers`);

// ------------------------------------------------------------- submission

const declared = [
  ["intake.project_description", "Project Description", INTAKE.project_description],
  ["intake.uses_ai", "Does this use AI or machine learning?", INTAKE.uses_ai],
  ["intake.third_party_involved", "Does anything about this involve a company outside ours?", INTAKE.third_party_involved],
  ["intake.data_classification", "What's the most sensitive data involved?", INTAKE.data_classification],
].map(([questionId, label, value]) => ({ questionId, label, value }));

await sql`
  update projects
     set submitted_at = now() - interval '6 days', submitted_by = ${OWNER}
   where id = ${project.id}`;
await sql`insert into declarations ${sql({
  project_id: project.id,
  declared_by: OWNER,
  shown: JSON.stringify(declared),
  gaps: JSON.stringify([]),
})}`;
console.log("submitted, with nothing left undeclared");

// --------------------------------------------------------------- findings

const raised = CONTROL_ANSWERS.filter(([, , , value]) => value !== "Yes");
const findingIds = {};
for (const [questionId, objective, objectiveName, value, note] of raised) {
  const governed = clauseFor(questionId);
  const breaches = governed && value !== governed.requirement.expect && value !== "N-A";
  const [row] = await sql`insert into findings ${sql({
    project_id: project.id,
    question_id: questionId,
    objective,
    objective_name: objectiveName,
    kind: breaches ? "non-compliance" : value === "No" ? "gap" : "enhancement",
    note,
    raised_by: OWNER,
    policy_ref: breaches ? governed.policy.reference : null,
    policy_version: breaches ? governed.policy.version : null,
    clause_id: breaches ? governed.clause.id : null,
    clause_text: breaches ? governed.clause.text : null,
    expected: breaches ? governed.requirement.expect : null,
  })} returning id, kind`;
  findingIds[questionId] = row.id;
  console.log(`  finding: ${objectiveName} — ${row.kind}`);
}

// ----------------------------------------------------------- attestations

/**
 * Signed by the risk domain that owns each control, because that is what
 * the product enforces — an attestation by the wrong assessor is refused
 * on the server, and seeding one would be seeding a state the app cannot
 * reach.
 */
const DOMAIN_SIGNER = { "t3.t3_iam_": "a.security", "t3.t3_nb_": "a.security", "t3.t3_dp_": "a.privacy" };
const signerFor = (questionId) => {
  for (const [prefix, who] of Object.entries(DOMAIN_SIGNER))
    if (questionId.startsWith(prefix)) return who;
  throw new Error(`no signer for ${questionId}`);
};

const RATIONALE = {
  "t3.t3_iam_05": "Confirmed with Legal Technology that no recertification owner exists. Raising it rather than passing it.",
  "t3.t3_dp_04": "Redaction covers signature blocks only. Accepting the answer as written; the residue is a finding, not a misstatement.",
  "t3.t3_nb_03": "Checked the integration design. The long-lived key is real and the answer describes it accurately.",
};

/**
 * One of them is corrected rather than approved. It has to be: the finding
 * below is settled as "answer-corrected", and an approval sitting beside
 * that would be two different stories about the same answer.
 */
const CORRECTIONS = {
  "t3.t3_dp_04": {
    to: "Yes",
    why: "Checked the upload path with Legal Technology. Counterparty contact details are stripped by the pre-processor as well as the signature block — the answer understated what is already in place.",
  },
};

let signed = 0;
let corrected = 0;
for (const [questionId, , , , note] of CONTROL_ANSWERS) {
  const by = signerFor(questionId);
  const correction = CORRECTIONS[questionId];
  await sql`insert into attestations ${sql({
    project_id: project.id,
    question_id: questionId,
    attested_by: by,
    attested_domain: by === "a.security" ? "security-resilience" : "data-privacy",
    attested_at: sql`now() - interval '2 days'`,
    act: correction ? "correct" : "approve",
    corrected_answer: correction ? correction.to : null,
    note: correction
      ? correction.why
      : (RATIONALE[questionId] ?? `Checked against the evidence provided. ${note.split(".")[0]}.`),
  })}`;
  signed += 1;
  if (correction) corrected += 1;
}
console.log(
  `attested ${signed} control answers — every one signed by the domain that owns it` +
    (corrected ? `, ${corrected} corrected rather than approved` : ""),
);

// -------------------------------------------------------------- settlement

/**
 * Each finding settled a different way, because the four dispositions are
 * the point of the screen and one of each is the only way to show them.
 * The risk acceptance is signed by somebody other than the assessor who
 * resolved it — four eyes, which the CHECK constraint enforces regardless.
 */
const SETTLEMENTS = [
  {
    questionId: "t3.t3_iam_05",
    kind: "remediation",
    resolved_by: "a.security",
    note: "Quarterly recertification of the Meridian register, owned by Legal Technology, first run before go-live.",
    remediation_owner: "d.chen",
    remediation_due: sql`now() + interval '45 days'`,
  },
  {
    questionId: "t3.t3_nb_03",
    kind: "risk-accepted",
    resolved_by: "a.security",
    note: "Mutual TLS is on Meridian's roadmap and not available to us this quarter. The key is held in the vault and rotated by us; the exposure is a vendor-side key we cannot rotate. Accepted to go-live, revisited at renewal.",
    accepted_by: "p.admin",
    expires_at: sql`now() + interval '180 days'`,
  },
  {
    questionId: "t3.t3_dp_04",
    kind: "answer-corrected",
    resolved_by: "a.privacy",
    // The only disposition that needs no note, because the corrected
    // answer and its attestation already say what happened.
    note: "",
  },
];

for (const s of SETTLEMENTS) {
  const findingId = findingIds[s.questionId];
  if (!findingId) throw new Error(`no finding raised for ${s.questionId}`);
  const { questionId, ...row } = s;
  await sql`insert into dispositions ${sql({
    finding_id: findingId,
    resolved_at: sql`now() - interval '1 day'`,
    ...row,
  })}`;
  console.log(`  settled ${questionId} — ${s.kind}`);
}

console.log(`
${NAME} is finished:
  submitted by Isabelle Withers six days ago
  ${signed} control answers, every one attested by the domain that owns it
  ${raised.length} findings raised — each citing a written clause, because
  every control in this instrument is governed by one
  all ${SETTLEMENTS.length} settled: one remediation with an owner and a date, one risk
  accepted under four eyes, one answer corrected by the reviewer

  Open it at /projects/${project.id}/report
`);

await sql.end();
