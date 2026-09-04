#!/usr/bin/env node
/**
 * Twenty-five enterprise scenarios, to stress the queue with the shapes a
 * real GRC function actually receives (G-82).
 *
 * The demo set (`seed-demo.mjs`) is three curated assessments chosen to show
 * mechanics. This is different work: a spread wide enough to *test the
 * framework rather than demonstrate it* — internally built tools with no
 * vendor to lean on, sensitive-data cases where the risk is not privacy,
 * genuinely low-risk work that must not be taxed, vague requests that carry
 * almost no information, incumbent vendors switching on generative features
 * nobody asked for, and shadow IT that arrives already running.
 *
 * Each scenario is seeded to a deliberate **depth**, because how far a
 * request has got is itself the thing under test:
 *
 *   intake      — intake only. The unrated case (G-81).
 *   assessed    — risk areas and severity answered; controls owed.
 *   submitted   — declared and handed over, findings raised.
 *
 * Re-running skips a scenario whose name already exists: answers are
 * insert-only and a cascade delete is refused by the trigger. To rebuild,
 * `pnpm db:reset --yes` first. Nothing else in the database is touched.
 *
 * Runs as a standalone task (§26.5). DEV ONLY.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const read = (...p) => JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8"));
const GATES = read("src", "data", "instrument", "gates.json");
const SEVERITY = read("src", "data", "instrument", "severity.json");
const TIER3 = read("src", "data", "instrument", "tier3.json");

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
/** Severity questions asked of every assessment, whatever else applies. */
const ALWAYS_ASKED = [];
(function walk(node) {
  if (Array.isArray(node)) return node.forEach(walk);
  if (node && typeof node === "object") {
    if (node.questionId && node.path === null) ALWAYS_ASKED.push(node.questionId);
    Object.values(node).forEach(walk);
  }
})(SEVERITY);

/* ---------------------------------------------------------------- *
 * The scenarios. Six shapes, twenty-five records.
 * ---------------------------------------------------------------- */

const B = "Brand new";
const RENEWAL = "A vendor renewal";
const UPDATE = "An update or enhancement to something we already run";
const POC = "Moving a proof of concept into production";

/** Shorthand: the intake a requester actually fills in. */
const intake = (o) => ({
  project_description: o.description,
  ai_use_case: o.aiUseCase ?? "",
  business_purpose: o.purpose ?? "",
  uses_ai: o.ai,
  third_party_involved: o.thirdParty,
  data_classification: o.data,
  data_elements: JSON.stringify(o.elements ?? []),
  initiative_type: o.initiative,
  business_unit: JSON.stringify({ id: o.unit, label: "", version: "2026-08-21.1" }),
  vendor_names: JSON.stringify((o.vendors ?? []).map((id) => ({ id, label: "", version: "2026-08-21.1" }))),
  coupa_onboarded: o.coupa ?? "I'm not sure",
});

const SCENARIOS = [
  /* ---- Internally built tools: no vendor to lean on for assurance ---- */
  {
    name: "Claims triage scoring model",
    shape: "internal",
    by: "d.chen",
    depth: "submitted",
    intake: intake({
      description:
        "Data & Analytics has trained a gradient-boosting model on eight years of settled claims. It scores incoming claims so adjusters work the ones most likely to need a human first. Built entirely in-house on our own Databricks workspace; no data leaves us.",
      aiUseCase: "Ranks incoming claims by predicted complexity so adjuster queues are ordered by need rather than arrival time.",
      purpose: "Cut the time a complex claim waits before an experienced adjuster sees it.",
      ai: "Yes", thirdParty: "No", data: "Confidential",
      elements: ["Customer personal information"],
      initiative: POC, unit: "BU_DATA",
    }),
  },
  {
    name: "Month-end reconciliation macro",
    shape: "internal",
    by: "d.ferreira",
    depth: "assessed",
    intake: intake({
      description:
        "A Python and Excel routine one analyst wrote three years ago. It reconciles the ledger against four source systems and the close cannot complete without it. It is not documented and only he can fix it. We would like it recognised as a supported tool.",
      purpose: "Get an existing, undocumented but business-critical routine onto a supported footing.",
      ai: "No", thirdParty: "No", data: "Confidential",
      elements: ["None / Unknown"],
      initiative: UPDATE, unit: "BU_FIN",
    }),
  },
  {
    name: "Handbook assistant for employees",
    shape: "internal",
    by: "d.grant",
    depth: "assessed",
    intake: intake({
      description:
        "IT has built a question-answering assistant over our internal wiki so people stop emailing HR the same policy questions. It retrieves from the wiki and answers in plain language. Runs on our own infrastructure.",
      aiUseCase: "Answers employee questions about policy by retrieving from the internal wiki and summarising what it finds.",
      ai: "Yes", thirdParty: "No", data: "Internal",
      elements: ["Employee personal information"],
      initiative: B, unit: "BU_IT",
    }),
  },
  {
    name: "Churn propensity scoring for outreach",
    shape: "internal",
    by: "d.dube",
    depth: "submitted",
    intake: intake({
      description:
        "An in-house model scores accounts on likelihood to leave. Sales works the top decile first and the bottom decile gets no proactive contact at all. Built by our own team on customer data we already hold.",
      aiUseCase: "Scores accounts for churn risk; the score decides who receives proactive retention contact and who does not.",
      ai: "Yes", thirdParty: "No", data: "Confidential",
      elements: ["Customer personal information"],
      initiative: B, unit: "BU_SALES",
    }),
  },

  /* ---- Sensitive data: and not always a privacy problem ---- */
  {
    name: "Workforce analytics data pipeline",
    shape: "sensitive",
    by: "d.haddad",
    depth: "submitted",
    intake: intake({
      description:
        "Nightly extract from Workday into Snowflake so People Analytics can model attrition and span of control. Includes our EU and UK staff. The warehouse is US-hosted.",
      purpose: "Give People Analytics a single place to model workforce trends.",
      ai: "No", thirdParty: "Yes", data: "Restricted",
      elements: ["Employee personal information"],
      initiative: B, unit: "BU_HR", vendors: ["V_WORKDAY", "V_SNOWFLAKE"], coupa: "Yes",
    }),
  },
  {
    name: "Applicant screening assistant",
    shape: "sensitive",
    by: "d.acosta",
    depth: "assessed",
    intake: intake({
      description:
        "Recruiting wants a tool that reads applications and shortlists the strongest candidates for a recruiter to review. The recruiter still decides; the tool just orders the pile.",
      aiUseCase: "Reads CVs and application answers, then ranks candidates for a recruiter to review.",
      ai: "Yes", thirdParty: "Yes", data: "Restricted",
      elements: ["Applicant personal information"],
      initiative: B, unit: "BU_HR", vendors: ["V_MICROSOFT"],
    }),
  },
  {
    name: "Code assistant on the pricing engine",
    shape: "sensitive",
    by: "d.brennan",
    depth: "assessed",
    intake: intake({
      description:
        "Engineering wants an AI coding assistant enabled on the pricing service repository. No customer data is involved. The repository is our rating algorithm, which is the closest thing we have to a trade secret.",
      aiUseCase: "Suggests and completes code inside the pricing service repository.",
      ai: "Yes", thirdParty: "Yes", data: "Restricted",
      elements: ["None / Unknown"],
      initiative: B, unit: "BU_ENG", vendors: ["V_MICROSOFT"], coupa: "Yes",
    }),
  },
  {
    name: "Legal review acceleration",
    shape: "sensitive",
    by: "d.grant",
    depth: "intake",
    intake: intake({
      description:
        "Litigation wants to use a hosted review platform to cut first-pass document review on a large matter. The set includes privileged material and board correspondence.",
      ai: "Yes", thirdParty: "Yes", data: "Restricted",
      elements: ["Employee personal information"],
      initiative: B, unit: "BU_LEG", vendors: ["V_DELOITTE"],
    }),
  },
  {
    name: "Safety incident reporting refresh",
    shape: "sensitive",
    by: "d.dube",
    depth: "assessed",
    intake: intake({
      description:
        "Replacing the paper form for workplace incidents with an online one. Free-text field for what happened. People do describe injuries and occasionally medication in that box, which we had not thought about until now.",
      ai: "No", thirdParty: "Yes", data: "Restricted",
      elements: ["Employee personal information"],
      initiative: UPDATE, unit: "BU_OPS", vendors: ["V_SERVICENOW"], coupa: "Yes",
    }),
  },

  /* ---- Genuinely low risk: the framework must not tax these ---- */
  {
    name: "Search keyword research script",
    shape: "low",
    by: "d.ferreira",
    depth: "submitted",
    intake: intake({
      description:
        "A script that pulls public search-volume data and builds a keyword report for the content team. Public data in, spreadsheet out.",
      ai: "No", thirdParty: "No", data: "Public",
      initiative: B, unit: "BU_MKT",
    }),
  },
  {
    name: "Meeting room display boards",
    shape: "low",
    by: "d.chen",
    depth: "submitted",
    intake: intake({
      description:
        "Screens outside meeting rooms showing whether the room is free. Reads the room calendar only, not attendee names.",
      ai: "No", thirdParty: "No", data: "Internal",
      initiative: B, unit: "BU_FAC",
    }),
  },
  {
    name: "Website accessibility scanner",
    shape: "low",
    by: "d.grant",
    depth: "assessed",
    intake: intake({
      description:
        "A weekly automated scan of our public marketing site for accessibility problems, so we fix them before anyone reports them. Reads only pages anyone can already see.",
      ai: "No", thirdParty: "No", data: "Public",
      initiative: B, unit: "BU_MKT",
    }),
  },
  {
    name: "Internal newsletter formatting",
    shape: "low",
    by: "d.haddad",
    depth: "intake",
    intake: intake({
      description:
        "A small automation that takes the copy Comms writes and formats it into the newsletter template. No data other than the article text.",
      ai: "No", thirdParty: "No", data: "Internal",
      initiative: B, unit: "BU_COMMS",
    }),
  },

  /* ---- Vague: almost no information, and a deadline behind it ---- */
  {
    name: "AI for productivity",
    shape: "vague",
    by: "d.brennan",
    depth: "intake",
    intake: intake({
      description: "Looking at AI to make the team more productive.",
      aiUseCase: "Various",
      ai: "Yes", thirdParty: "I'm not sure", data: "Internal",
      elements: ["None / Unknown"],
      initiative: B, unit: "BU_OPS",
    }),
  },
  {
    name: "Move reporting to the cloud",
    shape: "vague",
    by: "d.acosta",
    depth: "intake",
    intake: intake({
      description:
        "We want to move some of our reporting to the cloud this quarter. Still working out which reports and which platform.",
      ai: "I'm not sure", thirdParty: "Yes", data: "Confidential",
      elements: ["None / Unknown"],
      initiative: B, unit: "BU_FIN",
    }),
  },
  {
    name: "Partner integration — TBD",
    shape: "vague",
    by: "d.ferreira",
    depth: "intake",
    intake: intake({
      description: "Placeholder. Integration with a partner, details to follow. Raising now to hold a slot before the quarter closes.",
      ai: "I'm not sure", thirdParty: "Yes", data: "Confidential",
      elements: ["None / Unknown"],
      initiative: B, unit: "BU_STRAT",
    }),
  },
  {
    name: "Evaluating language model options",
    shape: "vague",
    by: "d.dube",
    depth: "intake",
    intake: intake({
      description:
        "Before we pick a model provider we would like to know what governance will require of us, so we can put it in the selection criteria rather than discovering it afterwards.",
      aiUseCase: "Undecided — that is what the evaluation is for.",
      ai: "Yes", thirdParty: "Yes", data: "Internal",
      elements: ["None / Unknown"],
      initiative: B, unit: "BU_PROD",
    }),
  },

  /* ---- Incumbent vendors, new capability, no new procurement ---- */
  {
    name: "Service desk agent on renewal",
    shape: "expansion",
    by: "d.chen",
    depth: "submitted",
    intake: intake({
      description:
        "Our service management platform is up for renewal and the new tier includes a generative agent that answers tickets directly. Same vendor, same contract, one more feature. Procurement says it is a renewal so it should not need a full assessment.",
      aiUseCase: "Reads an incoming ticket and drafts or sends a reply without an agent touching it.",
      ai: "Yes", thirdParty: "Yes", data: "Confidential",
      elements: ["Employee personal information", "Customer personal information"],
      initiative: RENEWAL, unit: "BU_IT", vendors: ["V_SERVICENOW"], coupa: "Yes",
    }),
  },
  {
    name: "CRM predictive features switched on",
    shape: "expansion",
    by: "d.grant",
    depth: "assessed",
    intake: intake({
      description:
        "Our CRM vendor enabled predictive scoring in the last release. Nobody here asked for it and it is already visible to the sales team. Raising it because I was told we have to.",
      aiUseCase: "Scores opportunities and suggests next actions to sellers.",
      ai: "Yes", thirdParty: "Yes", data: "Confidential",
      elements: ["Customer personal information"],
      initiative: UPDATE, unit: "BU_SALES", vendors: ["V_SALESFORCE"], coupa: "Yes",
    }),
  },
  {
    name: "Meeting summaries with a new sub-processor",
    shape: "expansion",
    by: "d.haddad",
    depth: "submitted",
    intake: intake({
      description:
        "Our conferencing vendor is adding automatic meeting summaries. Their notice says a new sub-processor will handle the transcription. We do record client calls.",
      aiUseCase: "Transcribes and summarises recorded meetings.",
      ai: "Yes", thirdParty: "Yes", data: "Confidential",
      elements: ["Customer personal information", "Employee personal information"],
      initiative: UPDATE, unit: "BU_IT", vendors: ["V_ZOOM"], coupa: "Yes",
    }),
  },
  {
    name: "Supplier risk scoring add-on",
    shape: "expansion",
    by: "d.ferreira",
    depth: "assessed",
    intake: intake({
      description:
        "Our procurement platform now offers a supplier risk score built from an outside data provider. We would use it to prioritise supplier reviews. The scoring data comes from someone we have no contract with.",
      aiUseCase: "Scores our suppliers for financial and operational risk using an external data source.",
      ai: "Yes", thirdParty: "Yes", data: "Confidential",
      elements: ["Partner/Vendor contact personal information"],
      initiative: UPDATE, unit: "BU_SUP", vendors: ["V_COUPA"], coupa: "Yes",
    }),
  },

  /* ---- Shadow IT: already running when it reaches the queue ---- */
  {
    name: "Local model on support tickets",
    shape: "shadow",
    by: "d.brennan",
    depth: "assessed",
    intake: intake({
      description:
        "An engineer has been running an open-source model locally to cluster support tickets by theme. Nothing leaves the laptop. It has been going for two months and the output is already in a weekly report.",
      aiUseCase: "Groups support tickets by theme so the weekly report writes itself.",
      ai: "Yes", thirdParty: "No", data: "Confidential",
      elements: ["Customer personal information"],
      initiative: POC, unit: "BU_ENG",
    }),
  },
  {
    name: "Team workspace on a corporate card",
    shape: "shadow",
    by: "d.acosta",
    depth: "intake",
    intake: intake({
      description:
        "The team has been paying for a shared AI workspace on a company card since spring. Finance flagged the expense. We use it for drafting and analysis, including some client material.",
      aiUseCase: "Drafting, summarising and analysis across the team's day-to-day work.",
      ai: "Yes", thirdParty: "Yes", data: "Confidential",
      elements: ["Customer personal information"],
      initiative: UPDATE, unit: "BU_MKT",
    }),
  },
  {
    name: "Automation copying CRM data to a spreadsheet",
    shape: "shadow",
    by: "d.dube",
    depth: "submitted",
    intake: intake({
      description:
        "A no-code automation someone set up copies new CRM records into a spreadsheet the team uses for reporting. The spreadsheet is in a personal drive folder shared by link.",
      ai: "No", thirdParty: "Yes", data: "Confidential",
      elements: ["Customer personal information"],
      initiative: UPDATE, unit: "BU_SALES", vendors: ["V_GOOGLE"],
    }),
  },
  {
    name: "Mailbox summarising extension",
    shape: "shadow",
    by: "d.grant",
    depth: "assessed",
    intake: intake({
      description:
        "Several people in support installed a browser extension that summarises long customer email threads. It reads the mailbox to do it. We do not know where the text goes.",
      aiUseCase: "Summarises customer email threads in the browser.",
      ai: "Yes", thirdParty: "Yes", data: "Confidential",
      elements: ["Customer personal information"],
      initiative: B, unit: "BU_CS",
    }),
  },
];

/* ---------------------------------------------------------------- */

try {
  process.loadEnvFile(".env");
} catch {
  /* variables come from the environment */
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (!/localhost|127\.0\.0\.1/.test(url) && process.argv[2] !== "--anywhere") {
  throw new Error("Refusing a non-local database. Pass --anywhere to override.");
}
const sql = postgres(url, { max: 4 });

const activeVersion = async (slug) => {
  const [row] = await sql`
    select id from instrument_versions
    where slug = ${slug} and activated_at is not null
    order by activated_at desc limit 1`;
  if (!row) throw new Error(`No activated version for ${slug}. Run: pnpm instrument:seed`);
  return row.id;
};

/**
 * Which gates the intake already decides. Seeding those as answers would
 * record them as the person's own, hiding the intake provenance the rail
 * shows — the same trap `seed-demo.mjs` documents.
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

const gatesVersion = await activeVersion("tier1-gates");
const severityVersion = await activeVersion("tier2-severity");
const tier3Version = await activeVersion("tier3-objectives");

let made = 0;
let skipped = 0;
let answers = 0;

for (const scenario of SCENARIOS) {
  const [existing] = await sql`
    select id from projects where project_name = ${scenario.name} limit 1`;
  if (existing) {
    skipped += 1;
    continue;
  }
  const [project] = await sql`insert into projects ${sql({
    project_name: scenario.name,
    created_by: scenario.by,
    ...scenario.intake,
  })} returning id`;
  made += 1;

  if (scenario.depth === "intake") continue;

  /* Risk areas: answer everything the intake did not already decide. The
     shape of the request decides which apply — a local script closes most
     areas, a vendor AI tool opens them. */
  const decided = decidedByIntake(scenario.intake);
  const opens =
    scenario.shape === "low"
      ? []
      : scenario.shape === "internal"
        ? ["solution-architecture", "operational"]
        : scenario.shape === "shadow"
          ? ["solution-architecture", "operational", "governance"]
          : ["solution-architecture", "operational", "legal-regulatory"];
  const rows = [];
  for (const category of GATES.categories) {
    if (decided.has(category.key) || category.alwaysApplies) continue;
    rows.push([category.questionId, opens.includes(category.key) ? "Yes" : "No", gatesVersion]);
  }
  /* Every assessment answers these three, whatever else applies. */
  const weight =
    scenario.shape === "low" ? "Low" : scenario.shape === "sensitive" ? "High" : "Medium";
  for (const questionId of ALWAYS_ASKED) rows.push([questionId, weight, severityVersion]);

  const left = decidedByIntake(scenario.intake);
  for (const [questionId, value, versionId] of rows) {
    const key = GATES.categories.find((c) => c.questionId === questionId)?.key;
    if (key && left.has(key)) continue;
    await sql`insert into answers ${sql({
      project_id: project.id,
      question_id: questionId,
      value: JSON.stringify(value),
      source: "person",
      confirmed: true,
      instrument_version_id: versionId,
      answered_by: scenario.by,
    })}`;
    answers += 1;
  }

  if (scenario.depth !== "submitted") continue;
  await sql`update projects set submitted_at = now(), submitted_by = ${scenario.by} where id = ${project.id}`;
}

console.log(
  `${made} scenarios created, ${skipped} already present, ${answers} answers written.`,
);
console.log(
  `Tier-3 edition ${tier3Version ? "available" : "missing"} — control answers are left for a person, deliberately.`,
);
await sql.end();
