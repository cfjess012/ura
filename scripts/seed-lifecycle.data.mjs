/**
 * The eleven scenarios `seed-lifecycle.mjs` writes. Data only: intake rows
 * as a requester fills them in, the risk areas and paths, the severity
 * answers that decide which controls apply, the control answers, and — for
 * the settled ones — what the reviewer did about each finding.
 *
 * `gates` are the risk areas the intake leaves to the person; anything not
 * named is No. Every control answered is checked by the seed against what
 * the severities bring in, before a row is written.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...p) => JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8"));
const UNITS = read("src", "data", "reference", "business-units.json");
const VENDORS = read("src", "data", "reference", "vendors.json");

/** A reference answer keeps the label as shown and the list version (NFR-22). */
const unit = (id) => {
  const found = UNITS.entries.find((e) => e.id === id);
  if (!found) throw new Error(`no such business unit: ${id}`);
  return { id: found.id, label: found.label, version: UNITS.version };
};
const vendor = (id) => {
  const found = VENDORS.entries.find((e) => e.id === id);
  if (!found) throw new Error(`no such vendor: ${id}`);
  return { id: found.id, label: found.label, version: VENDORS.version };
};

const B = "Brand new";
const UPDATE = "An update or enhancement to something we already run";
const POC = "Moving a proof of concept into production";

/* ---------------------------------------------------------------- *
 * Early: intake only, or assessed with controls still owed.
 * ---------------------------------------------------------------- */

export const EARLY = [
  {
    name: "Warehouse safety camera analytics pilot",
    by: "d.osei",
    depth: "intake",
    row: {
      project_description:
        "Operations wants to trial a vendor's camera analytics in the Reading warehouse to flag forklift near-misses and people in restricted aisles. It would run on the CCTV we already have. We have not chosen the vendor yet and are not sure whether the footage leaves the site.",
      ai_use_case: "Watches CCTV feeds and raises an alert when a person and a vehicle come too close.",
      business_purpose: "Reduce forklift incidents in the busiest warehouse before the peak season.",
      uses_ai: "Yes", third_party_involved: "Yes", data_classification: "Restricted",
      data_elements: ["Employee personal information"],
      initiative_type: POC, business_unit: unit("BU_OPS"),
      coupa_onboarded: "I'm not sure",
    },
  },
  {
    name: "Expense anomaly flagging tool",
    by: "d.novak",
    depth: "assessed",
    opens: ["solution-architecture", "operational"],
    weight: "Medium",
    row: {
      project_description:
        "Finance has built a small model that flags expense claims which look unlike the claimant's usual pattern — duplicate receipts, round-number meals, weekend hotels on a weekday trip. It runs nightly on our own reporting database and puts a flag in the approver's queue. The approver still decides.",
      ai_use_case: "Scores each expense claim against the claimant's history and flags the outliers for a human approver.",
      business_purpose: "Catch duplicate and out-of-policy claims before they are paid rather than in the annual audit.",
      uses_ai: "Yes", third_party_involved: "No", data_classification: "Confidential",
      data_elements: ["Employee personal information"],
      initiative_type: B, business_unit: unit("BU_FIN"),
      coupa_onboarded: "No",
    },
  },
  {
    name: "Sales call coaching transcription trial",
    by: "d.reyes",
    depth: "assessed",
    opens: ["solution-architecture", "operational", "legal-regulatory"],
    weight: "High",
    row: {
      project_description:
        "Sales enablement wants to record and transcribe outbound calls for a six-week coaching trial with twelve reps. The vendor transcribes, scores talk ratio and objection handling, and produces a weekly coaching summary. Customers on the other end of the call are in the UK and Ireland.",
      ai_use_case: "Transcribes recorded sales calls and scores each rep's conversation against a coaching rubric.",
      business_purpose: "Shorten ramp time for new sales hires by showing them what good calls sound like.",
      uses_ai: "Yes", third_party_involved: "Yes", data_classification: "Confidential",
      data_elements: ["Customer personal information", "Employee personal information"],
      initiative_type: POC, business_unit: unit("BU_SALES"),
      vendor_names: [vendor("V_MICROSOFT")],
      coupa_onboarded: "Yes",
    },
  },
];

/* ---------------------------------------------------------------- *
 * Deep: submitted with findings raised. Under review, or settled.
 *
 * `gates` are the risk areas the intake leaves to the person; anything
 * not named is No. `paths` and `severities` decide which controls apply,
 * and every control answered below is checked against that.
 * ---------------------------------------------------------------- */

export const DEEP = [
  /* ---- Under review: findings raised, nobody has signed anything ---- */
  {
    name: "Underwriting risk scoring model",
    by: "d.imai",
    submittedDaysAgo: 3,
    row: {
      project_description:
        "Risk has built a gradient-boosted model that scores personal loan applications on likelihood of default, trained on seven years of our own book. It replaces the rule-based score the underwriters use today. An underwriter still makes the decision, but the score decides which queue the application lands in.",
      ai_use_case: "Scores each loan application on predicted default risk; the score routes it to fast-track, standard or manual review.",
      business_purpose: "Approve straightforward applications the same day and put underwriter time where it matters.",
      uses_ai: "Yes", third_party_involved: "Yes", data_classification: "Restricted",
      data_elements: ["Customer personal information", "Financial account information"],
      initiative_type: POC, business_unit: unit("BU_RISK"),
      other_units: [unit("BU_DATA")],
      vendor_names: [vendor("V_DATABRICKS")],
      collaborators: "Data & Analytics, Credit Policy",
      coupa_onboarded: "Yes",
    },
    gates: { operational: "Yes", "legal-regulatory": "Yes", "ethics-conduct": "Yes" },
    paths: {
      "third-party": ["TPR_LA", "TPR_DH"],
      ai: ["AI_DEC", "AI_RET"],
      "data-privacy": ["PRIV", "REGDATA"],
      "security-resilience": ["SR_INT", "SR_PAM"],
    },
    severities: {
      "sev.sh_1": "High", "sev.sh_2": "Medium", "sev.sh_3": "High",
      "sev.tpr_la_1": "Medium", "sev.tpr_la_2": "Medium", "sev.tpr_dh_1": "High",
      "sev.ai_dec_1": "High", "sev.ai_ret_1": "Medium",
      "sev.priv_1": "High", "sev.regdata_1": "High", "sev.pi_ai_1": "High",
      "sev.sr_int_1": "Medium", "sev.sr_pam_1": "High",
    },
    controls: [
      ["t3.t3_iam_01", "Yes", "Access is provisioned through the standard model-ops role in the identity platform."],
      ["t3.t3_iam_02", "Yes", "SSO with MFA is required for the scoring console and the notebook environment."],
      ["t3.t3_iam_03", "No", "Two data scientists share one administrative credential to retrain the model. Individual privileged accounts have not been set up."],
      ["t3.t3_dp_01", "Yes", "Encrypted at rest in the lakehouse and in transit over TLS."],
      ["t3.t3_dp_04", "Partial", "The training set carries more applicant fields than the model scores on. Nobody has trimmed it since the first build."],
      ["t3.t3_dp_05", "No", "There is no retention schedule for the training snapshots. Three years of them have accumulated."],
      ["t3.t3_nb_01", "Yes", "Runs inside the model-serving VPC with the standard segmentation."],
      ["t3.t3_nb_03", "Partial", "The scoring API is internal-only but relies on network location alone; requests are not signed."],
    ],
  },
  {
    name: "Customer complaint sentiment triage",
    by: "d.whitfield",
    submittedDaysAgo: 8,
    row: {
      project_description:
        "Customer Service wants the vendor's sentiment feature switched on so that complaints which read as angry or threatening go straight to a senior agent instead of waiting in the general queue. It reads the body of the incoming email or chat. We already use the platform for ticketing.",
      ai_use_case: "Reads incoming complaint text and routes the ones that read as escalations to a senior queue.",
      business_purpose: "Get the customers most likely to leave in front of an experienced agent within the hour.",
      uses_ai: "Yes", third_party_involved: "Yes", data_classification: "Confidential",
      data_elements: ["Customer personal information"],
      initiative_type: UPDATE, business_unit: unit("BU_CS"),
      vendor_names: [vendor("V_SALESFORCE")],
      coupa_onboarded: "Yes",
    },
    gates: { operational: "Yes", "solution-architecture": "Yes" },
    paths: {
      "third-party": ["TPR_LA", "TPR_DH"],
      ai: ["AI_CONT"],
      "data-privacy": ["PRIV"],
      "security-resilience": ["SR_INT", "SR_PAM"],
    },
    severities: {
      "sev.sh_1": "Medium", "sev.sh_2": "Medium", "sev.sh_3": "Medium",
      "sev.tpr_la_1": "Medium", "sev.tpr_la_2": "Low", "sev.tpr_dh_1": "Medium",
      "sev.ai_cont_1": "Medium", "sev.priv_1": "Medium", "sev.pi_ai_1": "Medium",
      "sev.sr_int_1": "Medium", "sev.sr_pam_1": "Medium",
    },
    controls: [
      ["t3.t3_iam_02", "Yes", "Agents reach the feature through the platform's SSO, which enforces MFA."],
      ["t3.t3_iam_06", "No", "The vendor's implementation contractors are not removed from our directory when their engagement ends. We rely on the vendor to tell us."],
      ["t3.t3_dp_01", "Yes", "Covered by the platform's existing encryption; nothing changes for this feature."],
      ["t3.t3_dp_05", "Yes", "Complaint text stays in the platform under the existing ticket retention; the sentiment score is a field on the ticket."],
      ["t3.t3_dp_06", "Yes", "The integration credentials are in the secrets manager with the rest of the platform's."],
      ["t3.t3_nb_03", "No", "The vendor's webhook back into our ticketing system authenticates with a shared secret in the integration config. It has never been rotated."],
    ],
  },
  {
    name: "Marketing copy generation assistant",
    by: "d.chen",
    submittedDaysAgo: 12,
    row: {
      project_description:
        "Marketing wants to use the assistant already in our productivity suite to draft first-pass ad copy, email subject lines and social captions. An editor rewrites and approves everything before it goes out. No customer data is involved, but campaign plans and launch pricing go into the prompts.",
      ai_use_case: "Drafts first-pass marketing copy from a brief; an editor rewrites and approves before anything is published.",
      business_purpose: "Cut the time from brief to first draft from two days to one hour.",
      uses_ai: "Yes", third_party_involved: "Yes", data_classification: "Confidential",
      data_elements: ["Trade secrets, source code or proprietary methods"],
      initiative_type: UPDATE, business_unit: unit("BU_MKT"),
      vendor_names: [vendor("V_MICROSOFT")],
      coupa_onboarded: "Yes",
    },
    gates: { "solution-architecture": "Yes" },
    paths: {
      "third-party": ["TPR_DH"],
      ai: ["AI_CONT", "AI_RET"],
      "data-privacy": ["DATA_EXT"],
      "security-resilience": ["SR_INT"],
    },
    severities: {
      "sev.sh_1": "Low", "sev.sh_2": "Medium", "sev.sh_3": "Low",
      "sev.tpr_dh_1": "Medium", "sev.ai_cont_1": "Medium", "sev.ai_ret_1": "Medium",
      "sev.data_ext_1": "Medium", "sev.sr_int_1": "Low",
    },
    controls: [
      ["t3.t3_dp_01", "Yes", "Covered by the suite's encryption; nothing new is stored on our side."],
      ["t3.t3_dp_05", "Partial", "The suite keeps prompt history for 30 days by default. Nobody has checked whether that covers the campaign material pasted in, or who can see it."],
      ["t3.t3_nb_03", "No", "The team connected the assistant to the shared marketing drive with one person's connector token rather than a managed integration."],
    ],
  },
  {
    name: "Field technician scheduling optimizer",
    by: "d.dube",
    submittedDaysAgo: 5,
    row: {
      project_description:
        "Operations has built a scheduler that assigns field technicians to jobs using travel time from a mapping API, historical job durations and each technician's skills. Dispatchers accept or override the plan each morning. It has been running in one region for a quarter and we want to roll it out nationally.",
      ai_use_case: "Proposes a daily job schedule per technician from travel time, job history and skills; dispatchers accept or override.",
      business_purpose: "Fit one more job a day into each technician's round without extending their hours.",
      uses_ai: "Yes", third_party_involved: "Yes", data_classification: "Confidential",
      data_elements: ["Customer personal information", "Employee personal information"],
      initiative_type: POC, business_unit: unit("BU_OPS"),
      other_units: [unit("BU_ENG")],
      vendor_names: [vendor("V_GOOGLE")],
      collaborators: "Field Engineering, Dispatch",
      coupa_onboarded: "Yes",
    },
    gates: { operational: "Yes", "people-capacity": "Yes" },
    paths: {
      "third-party": ["TPR_DH"],
      ai: ["AI_DEC"],
      "data-privacy": ["PRIV"],
      "security-resilience": ["SR_INT", "SR_EXT"],
    },
    severities: {
      "sev.sh_1": "Medium", "sev.sh_2": "Medium", "sev.sh_3": "Medium",
      "sev.tpr_dh_1": "Medium", "sev.ai_dec_1": "Medium",
      "sev.priv_1": "Medium", "sev.pi_ai_1": "Medium",
      "sev.sr_int_1": "Medium", "sev.sr_ext_1": "Medium",
    },
    controls: [
      ["t3.t3_dp_01", "Yes", "Encrypted at rest in the operations database; the mapping API is called over TLS."],
      ["t3.t3_dp_04", "Partial", "The scheduler receives the customer's full address history from the CRM when it only needs the address of today's job."],
      ["t3.t3_dp_06", "Yes", "The mapping API key is in the secrets manager and rotated quarterly."],
      ["t3.t3_nb_02", "Yes", "The technician app's endpoint sits behind the standard WAF policy."],
      ["t3.t3_nb_03", "Yes", "The mapping API is called with a scoped key; the technician app authenticates with short-lived tokens."],
      ["t3.t3_nb_05", "No", "If the mapping API is unavailable there is no fallback. Dispatch reverts to a phone tree that has not been exercised this year."],
    ],
  },

  /* ---- Settled: attested by the domain that owns it, findings closed ---- */
  {
    name: "Invoice matching automation",
    by: "d.ferreira",
    submittedDaysAgo: 21,
    attestedDaysAgo: 9,
    settledDaysAgo: 6,
    row: {
      project_description:
        "Accounts Payable wants to automate three-way matching of supplier invoices against purchase orders and goods receipts in the ERP. Exact matches post automatically; anything else lands with a clerk. Vendor names, bank details and amounts are read from the invoice image.",
      ai_use_case: "Reads the invoice image, extracts the header and lines, and matches them to the purchase order and receipt.",
      business_purpose: "Post the eighty percent of invoices that match cleanly without a person touching them.",
      uses_ai: "Yes", third_party_involved: "Yes", data_classification: "Confidential",
      data_elements: ["Partner/Vendor contact personal information", "Financial account information"],
      initiative_type: B, business_unit: unit("BU_FIN"),
      other_units: [unit("BU_SUP")],
      vendor_names: [vendor("V_SAP")],
      collaborators: "Procurement operations, ERP platform team",
      coupa_onboarded: "Yes",
    },
    gates: { operational: "Yes", "legal-regulatory": "Yes", "solution-architecture": "Yes" },
    paths: {
      "third-party": ["TPR_LA", "TPR_DH"],
      ai: ["AI_AGENT"],
      "data-privacy": ["PRIV", "REGDATA"],
      "security-resilience": ["SR_INT"],
    },
    severities: {
      "sev.sh_1": "High", "sev.sh_2": "Medium", "sev.sh_3": "Medium",
      "sev.tpr_la_1": "Medium", "sev.tpr_la_2": "Medium", "sev.tpr_dh_1": "Medium",
      "sev.ai_agent_1": "Medium", "sev.priv_1": "Medium", "sev.regdata_1": "Medium",
      "sev.pi_ai_1": "Medium", "sev.sr_int_1": "Medium",
    },
    controls: [
      ["t3.t3_iam_02", "Yes", "Enforced by the ERP's SSO; the tool has no login of its own."],
      ["t3.t3_iam_05", "No", "Recertification for the matching tool was never added to the quarterly finance access review. It has been live for two quarters without one."],
      ["t3.t3_dp_01", "Yes", "Invoice images are encrypted at rest in the document store and the ERP connection is TLS."],
      ["t3.t3_dp_05", "Yes", "Invoice images are kept seven years under the finance retention schedule and purged by the document store."],
      ["t3.t3_dp_06", "Yes", "The ERP service credentials live in the secrets manager."],
      ["t3.t3_nb_03", "No", "The tool authenticates to the ERP with a static service-account key. The ERP vendor has not shipped rotation for this integration type."],
    ],
    rationale: {
      "t3.t3_iam_05": "Confirmed with the AP manager that the tool is missing from the review population. The answer is accurate.",
      "t3.t3_nb_03": "Checked the integration guide. A static key is the only option the ERP offers for this connector today.",
    },
    settlements: [
      {
        questionId: "t3.t3_iam_05",
        kind: "remediation",
        resolved_by: "a.security",
        note: "Add the matching tool to the quarterly finance access review population, owned by the AP manager, with the first review before the next quarter closes.",
        remediation_owner: "d.novak",
        dueInDays: 60,
      },
      {
        questionId: "t3.t3_nb_03",
        kind: "risk-accepted",
        resolved_by: "a.security",
        note: "Rotation is not available for this connector type. The key is held in our vault, scoped to the matching service, and the ERP session is read-only for posting. Accepted until the vendor ships rotation or the annual review, whichever is first.",
        accepted_by: "p.admin",
        expiresInDays: 365,
      },
    ],
  },
  {
    name: "Employee exit interview analysis",
    by: "d.grant",
    submittedDaysAgo: 30,
    attestedDaysAgo: 14,
    settledDaysAgo: 11,
    row: {
      project_description:
        "People Analytics wants to run the free-text answers from exit interviews through a language model to pull out recurring themes by department and manager. Interviews are already transcribed and stored in our HR system. Output is a quarterly themes report for the executive team; no individual answers are quoted.",
      ai_use_case: "Reads exit interview transcripts and groups what leavers said into themes by department and by manager.",
      business_purpose: "Give the executive team a reliable read on why people leave, without HR summarising it by hand.",
      uses_ai: "Yes", third_party_involved: "Yes", data_classification: "Restricted",
      data_elements: ["Employee personal information"],
      initiative_type: B, business_unit: unit("BU_HR"),
      vendor_names: [vendor("V_WORKDAY"), vendor("V_ANTHROPIC")],
      collaborators: "HR Business Partners",
      coupa_onboarded: "Yes",
    },
    gates: { "legal-regulatory": "Yes", "ethics-conduct": "Yes", "people-capacity": "Yes", "solution-architecture": "Yes" },
    paths: {
      "third-party": ["TPR_DH"],
      ai: ["AI_RET"],
      "data-privacy": ["PRIV", "DATA_EXT"],
      "security-resilience": ["SR_INT"],
    },
    severities: {
      "sev.sh_1": "Medium", "sev.sh_2": "Low", "sev.sh_3": "High",
      "sev.tpr_dh_1": "High", "sev.ai_ret_1": "Medium",
      "sev.priv_1": "High", "sev.data_ext_1": "High", "sev.pi_ai_1": "High",
      "sev.sr_int_1": "Medium",
    },
    controls: [
      ["t3.t3_iam_01", "Yes", "Access is limited to the three People Analytics staff who already see exit interviews."],
      ["t3.t3_iam_02", "Yes", "Enforced through the HR system's SSO, which requires MFA."],
      ["t3.t3_dp_01", "Yes", "Transcripts stay encrypted in the HR system; the model call is over TLS and nothing is written back."],
      ["t3.t3_dp_04", "Partial", "Names are stripped from transcripts before the model sees them, but the manager's name is left in so themes can be grouped by manager."],
      ["t3.t3_dp_05", "Yes", "Model outputs are kept for the quarter and then deleted; the provider does not retain the inputs."],
      ["t3.t3_dp_06", "Yes", "The model provider's API key is in the secrets manager, scoped to this pipeline."],
      ["t3.t3_nb_01", "Yes", "The pipeline runs in the People Analytics workspace, which is already segmented from general IT."],
      ["t3.t3_nb_02", "N-A", "Nothing is exposed externally. The pipeline has no inbound endpoint; it calls out to the model provider and writes to an internal dashboard."],
      ["t3.t3_nb_03", "Yes", "The model provider is called with a scoped API key from the secrets manager."],
    ],
    rationale: {
      "t3.t3_nb_02": "Confirmed with the platform team: no inbound endpoint exists for this pipeline, so there is nothing for a WAF to sit in front of.",
    },
    corrections: {
      "t3.t3_dp_04": {
        to: "Yes",
        why: "Checked the pipeline with People Analytics. The manager's name is replaced with a team code before the model sees it, and the code is mapped back only in the final report. The answer understated what is already done.",
      },
    },
    settlements: [
      { questionId: "t3.t3_dp_04", kind: "answer-corrected", resolved_by: "a.privacy", note: "" },
      {
        questionId: "t3.t3_nb_02",
        kind: "not-applicable",
        resolved_by: "a.security",
        note: "The pipeline has no externally reachable endpoint. The control does not apply and no action is owed.",
      },
    ],
  },
  {
    name: "Predictive maintenance for field equipment",
    by: "d.acosta",
    submittedDaysAgo: 40,
    attestedDaysAgo: 22,
    settledDaysAgo: 19,
    row: {
      project_description:
        "Engineering has trained a model on telemetry from the pump fleet to predict bearing failures two to three weeks out. It runs on the vendor's industrial cloud, which already receives the telemetry, and raises a work order in our maintenance system when a pump crosses the threshold.",
      ai_use_case: "Predicts pump bearing failures from vibration and temperature telemetry and raises a maintenance work order ahead of time.",
      business_purpose: "Replace bearings on a planned visit instead of after a failure that stops the line.",
      uses_ai: "Yes", third_party_involved: "Yes", data_classification: "Internal",
      data_elements: ["None / Unknown"],
      initiative_type: POC, business_unit: unit("BU_ENG"),
      other_units: [unit("BU_OPS")],
      vendor_names: [vendor("V_IBM")],
      collaborators: "Plant maintenance, OT security",
      coupa_onboarded: "Yes",
    },
    gates: { operational: "Yes" },
    paths: {
      "third-party": ["TPR_LA", "TPR_DH", "TPR_OPS"],
      ai: ["AI_AGENT"],
      "data-privacy": ["DATA_EXT"],
      "security-resilience": ["SR_INT", "SR_PAM"],
    },
    severities: {
      "sev.sh_1": "High", "sev.sh_2": "Medium", "sev.sh_3": "Medium",
      "sev.tpr_la_1": "Medium", "sev.tpr_la_2": "Medium", "sev.tpr_dh_1": "Low",
      "sev.tpr_ops_1": "Medium", "sev.tpr_ops_2": "Medium", "sev.ai_agent_1": "Medium",
      "sev.data_ext_1": "Medium", "sev.sr_int_1": "Medium", "sev.sr_pam_1": "Medium",
    },
    controls: [
      ["t3.t3_iam_02", "Yes", "Engineers reach the dashboard through SSO with MFA."],
      ["t3.t3_iam_03", "Yes", "Platform administration is limited to two OT engineers through the vault."],
      ["t3.t3_iam_06", "Partial", "Joiners are provisioned through the OT access group, but leavers on the vendor's platform are only removed at the quarterly reconciliation."],
      ["t3.t3_iam_10", "No", "The vendor's support engineers reach the platform over their own VPN. There is no monitoring of those sessions on our side."],
      ["t3.t3_dp_05", "Yes", "Telemetry is kept on the vendor platform for 13 months and purged; we keep only the work orders."],
      ["t3.t3_dp_06", "Yes", "The work-order integration key is in the secrets manager."],
      ["t3.t3_nb_03", "Yes", "The work-order API is called with a scoped, rotated key."],
    ],
    rationale: {
      "t3.t3_iam_06": "Checked the vendor's leaver process. Quarterly is accurate and is the gap.",
      "t3.t3_iam_10": "Confirmed with OT security that vendor sessions are not logged to us. Accurate.",
    },
    settlements: [
      {
        questionId: "t3.t3_iam_06",
        kind: "remediation",
        resolved_by: "a.security",
        note: "Feed the vendor platform from the directory leaver event so removal is same-day, not quarterly. Owned by the OT platform lead.",
        remediation_owner: "d.brennan",
        dueInDays: 45,
      },
      {
        questionId: "t3.t3_iam_10",
        kind: "remediation",
        resolved_by: "a.security",
        note: "Require vendor support access to come through our gateway with session recording, per the remote-access standard. Contract change requested; interim monitoring via the vendor's audit export.",
        remediation_owner: "d.acosta",
        dueInDays: 90,
      },
    ],
  },
  {
    name: "Loan application pre-screening model",
    by: "d.withers",
    submittedDaysAgo: 55,
    attestedDaysAgo: 35,
    settledDaysAgo: 30,
    row: {
      project_description:
        "Risk wants to pre-screen mortgage applications at the point of enquiry, so an applicant who would not pass affordability is told early rather than after a full application. The model is the vendor's, tuned on our book. The applicant sees a plain-language reason. A human underwriter still makes every final decision.",
      ai_use_case: "Scores a mortgage enquiry on affordability at the first step and tells the applicant early if a full application is unlikely to succeed.",
      business_purpose: "Stop applicants spending three weeks on a full application that was never going to pass.",
      uses_ai: "Yes", third_party_involved: "Yes", data_classification: "Restricted",
      data_elements: ["Customer personal information", "Financial account information"],
      initiative_type: B, business_unit: unit("BU_RISK"),
      other_units: [unit("BU_PROD"), unit("BU_LEG")],
      vendor_names: [vendor("V_ORACLE")],
      collaborators: "Credit Policy, Product, Regulatory Counsel",
      coupa_onboarded: "Yes",
    },
    gates: { operational: "Yes", "legal-regulatory": "Yes", "ethics-conduct": "Yes", jurisdiction: "Yes", "solution-architecture": "Yes" },
    paths: {
      "third-party": ["TPR_LA", "TPR_DH"],
      ai: ["AI_DEC", "AI_RET"],
      "data-privacy": ["PRIV", "REGDATA"],
      "security-resilience": ["SR_EXT", "SR_INT", "SR_PAM"],
    },
    severities: {
      "sev.sh_1": "High", "sev.sh_2": "High", "sev.sh_3": "High",
      "sev.tpr_la_1": "High", "sev.tpr_la_2": "Medium", "sev.tpr_dh_1": "High",
      "sev.ai_dec_1": "High", "sev.ai_ret_1": "Medium",
      "sev.priv_1": "High", "sev.regdata_1": "High", "sev.pi_ai_1": "High",
      "sev.sr_ext_1": "Medium", "sev.sr_int_1": "High", "sev.sr_pam_1": "Medium",
    },
    controls: [
      ["t3.t3_iam_01", "Yes", "Underwriters and Credit Policy get the model through the existing lending roles."],
      ["t3.t3_iam_02", "Yes", "MFA is enforced through the lending platform's SSO."],
      ["t3.t3_iam_03", "Yes", "Model configuration is limited to Credit Policy through the vault, with approval on every change."],
      ["t3.t3_iam_05", "No", "The lending platform's access review does not yet cover the model configuration role. Credit Policy have not been recertified since go-live."],
      ["t3.t3_iam_06", "Yes", "Provisioned and removed by the directory sync within one working day."],
      ["t3.t3_iam_10", "N-A", "The vendor has no remote access to our environment. The model is called from our side and their support works on their own platform."],
      ["t3.t3_dp_01", "Yes", "Encrypted at rest under our own keys; TLS 1.3 in transit."],
      ["t3.t3_dp_04", "Partial", "The pre-screen collects date of birth, which the affordability calculation does not use. It was carried over from the full application form."],
      ["t3.t3_dp_05", "Yes", "Enquiries that do not proceed are deleted after 90 days; those that do are kept under the lending retention schedule."],
      ["t3.t3_dp_06", "Yes", "Model API credentials are rotated every 90 days from the secrets manager."],
      ["t3.t3_nb_01", "Yes", "The model is called from the lending segment; nothing new crosses a boundary."],
      ["t3.t3_nb_02", "Yes", "The enquiry form sits behind the standard WAF policy."],
      ["t3.t3_nb_03", "No", "The vendor's scoring endpoint is authenticated by API key only. Mutual TLS is on their roadmap but not available."],
      ["t3.t3_nb_05", "Yes", "If the model is unavailable, the enquiry proceeds to a full application as it does today."],
    ],
    rationale: {
      "t3.t3_iam_05": "Confirmed with the lending platform owner that the configuration role is outside the review population. Raising it.",
      "t3.t3_iam_10": "Confirmed with the vendor's account team: no inbound access path exists into our environment. The control does not apply.",
      "t3.t3_nb_03": "Checked the vendor's security documentation. API key only is accurate; mutual TLS is not offered.",
    },
    corrections: {
      "t3.t3_dp_04": {
        to: "Yes",
        why: "Checked the form with Product. Date of birth was removed from the pre-screen in the last release and the answer describes the previous version. Corrected to what is live.",
      },
    },
    settlements: [
      {
        questionId: "t3.t3_iam_05",
        kind: "remediation",
        resolved_by: "a.security",
        note: "Add the model configuration role to the lending platform's quarterly access review, with Credit Policy recertified before the next cycle.",
        remediation_owner: "d.imai",
        dueInDays: 30,
      },
      { questionId: "t3.t3_dp_04", kind: "answer-corrected", resolved_by: "a.privacy", note: "" },
      {
        questionId: "t3.t3_iam_10",
        kind: "not-applicable",
        resolved_by: "a.security",
        note: "No remote access into our environment exists for this vendor. No remote-access control is owed.",
      },
      {
        questionId: "t3.t3_nb_03",
        kind: "risk-accepted",
        resolved_by: "a.security",
        note: "Mutual TLS is not available from the vendor this year. The key is scoped to scoring only, rotated by us every 90 days, and the endpoint is reachable only from the lending segment. Accepted to go-live and revisited at the annual vendor review.",
        accepted_by: "p.admin",
        expiresInDays: 180,
      },
    ],
  },
];

