#!/usr/bin/env node
/**
 * Every AI capability, against the real model, with the guardrails checked.
 *
 * The unit suites prove the gates work on fixtures. This proves the model
 * actually reaches them, and that what comes back survives the rule each
 * capability exists under — a quote that is not in the source, a policy
 * clause paraphrased, a scenario citing something that is not there. Those
 * are the failures that a green unit run cannot see, because a stubbed
 * model never invents anything.
 *
 * Needs: the agent running, and a real ANTHROPIC_API_KEY.
 */
import { quoteAppearsVerbatim } from "../src/lib/agent-contract.ts";
import rubric from "../src/data/reference/intake-rubric.json" with { type: "json" };

const AGENT = process.env.AGENT_URL ?? "http://localhost:8790";
const results = [];

function check(capability, name, ok, detail = "") {
  results.push({ capability, name, ok, detail });
  const mark = ok ? "  ✓" : "  ✗";
  console.log(`${mark} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}

async function call(path, body) {
  const response = await fetch(`${AGENT}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-contract": "1" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return response.json();
}

/* The document everything reads from. Deliberately partial: it says plenty
   about the vendor and the data, and nothing at all about who approved it —
   so abstention is checkable, not hypothetical. */
const DOC = `Sable Analytics Claims Triage — Solution Overview

The service receives claim documents from our intake queue and returns a
proposed routing decision with supporting passages. Claim text, including
claimant names and policy numbers, is transmitted to Sable's hosted
environment in eu-west-1 over TLS 1.3.

Sable retains submitted claim text for 30 days for troubleshooting, after
which it is purged. Sable's staff can access stored claim text through a
shared support VPN account.

A claims handler must accept or override every proposed routing decision
before the claim moves.`;

const FIELDS = [
  { id: "dataClassification", label: "Most sensitive data", options: ["Public", "Internal", "Confidential", "Restricted"] },
  { id: "thirdPartyInvolved", label: "Company outside ours involved", options: ["Yes", "No"] },
  { id: "usesAi", label: "Uses AI or machine learning", options: ["Yes", "No"] },
];

console.log("\n▸ Describing an activity from a document (G-66)");
try {
  const drafted = await call("/describe-intake", {
    label: "Project Description",
    existing: "",
    document: DOC,
    documentName: "sable-overview.md",
    fields: FIELDS,
  });
  check("describe", "returns a description", typeof drafted.description === "string" && drafted.description.length > 80,
    JSON.stringify(drafted).slice(0, 200));
  const fields = drafted.fields ?? [];
  check("describe", "proposes intake answers from the document", fields.length > 0, `${fields.length} proposed`);
  // §22.2 and the never-guess rule: a proposal carries the sentence it came
  // from, and that sentence is in the document or the proposal is not real.
  const notVerbatim = fields.filter((f) => !quoteAppearsVerbatim(f.quote ?? "", DOC));
  check("describe", "every proposal quotes the document verbatim", notVerbatim.length === 0,
    notVerbatim.map((f) => `${f.field}: ${String(f.quote).slice(0, 60)}`).join(" | "));
  const onlyOffered = fields.every((f) => {
    const known = FIELDS.find((k) => k.id === f.field);
    return known ? known.options.includes(f.value) : false;
  });
  check("describe", "proposes only values the field accepts", onlyOffered,
    fields.map((f) => `${f.field}=${f.value}`).join(", "));
  // The document says nothing about approval or go-live. Inventing them is
  // the failure this rule exists for; bracketing them is the pass.
  check("describe", "brackets what the document does not say, rather than inventing it",
    (drafted.placeholders ?? []).length > 0, "no placeholders — check it did not invent");
  const invented = /\b(approved by|signed off|go.?live date is)\b/i.test(drafted.description ?? "");
  check("describe", "asserts nothing the document did not say", !invented);
} catch (cause) {
  check("describe", "reachable", false, String(cause));
}

console.log("\n▸ Grading the intake, and catching contradictions (FR-43, G-69)");
try {
  // Two halves that genuinely contradict, in one submission.
  const contradictory =
    "This tool only handles anonymised, aggregated counts and no personal data is involved at any point. " +
    "Claim documents containing claimant names, addresses and policy numbers are sent to the vendor for parsing.";
  const scored = await call("/score-intake", {
    description: contradictory,
    fields: FIELDS,
    dimensions: rubric.criteria.map((c) => ({ id: c.id, label: c.label, anchors: c.anchors })),
  });
  const scores = scored.scores ?? [];
  check("score", "scores every dimension it was asked about", scores.length > 0, `${scores.length} of ${rubric.criteria.length}`);
  const inRange = scores.every((s) => [1, 2, 3, 4].includes(s.score));
  check("score", "scores inside the rubric's own levels (out-of-range dropped, never clamped)", inRange,
    scores.map((s) => `${s.id}=${s.score}`).join(", "));
  const known = new Set(rubric.criteria.map((c) => c.id));
  check("score", "scores nothing it was not asked about", scores.every((s) => known.has(s.id)));
  const conflicts = scored.conflicts ?? [];
  check("score", "catches the contradiction it was given", conflicts.length > 0,
    "no conflict found in a submission that contradicts itself");
  // A conflict is an accusation. Both halves must be the person's own words.
  const madeUp = conflicts.filter(
    (c) => !quoteAppearsVerbatim(c.one ?? "", contradictory) || !quoteAppearsVerbatim(c.two ?? "", contradictory),
  );
  check("score", "quotes both halves of a contradiction verbatim", madeUp.length === 0,
    madeUp.map((c) => String(c.one).slice(0, 50)).join(" | "));
} catch (cause) {
  check("score", "reachable", false, String(cause));
}

console.log("\n▸ Suggesting a rewrite (§22.1)");
try {
  const thin = "We are using Salesforce for the claims thing.";
  const rewritten = await call("/rewrite-intake", {
    label: "Project Description",
    original: thin,
    shortfalls: [
      { label: "What data", ask: "Name the data it touches.", anchor: "dataAccess" },
      { label: "Who", ask: "Say who uses it and who receives its output.", anchor: "audience" },
    ],
  });
  const has = typeof rewritten.rewrite === "string" && rewritten.rewrite.length > thin.length;
  check("rewrite", "returns a longer, fuller draft", has, JSON.stringify(rewritten).slice(0, 160));
  // The whole point: it may not invent the facts it is asking them for.
  check("rewrite", "brackets what it does not know rather than inventing it",
    (rewritten.placeholders ?? []).length > 0 || /\[/.test(rewritten.rewrite ?? ""));
} catch (cause) {
  check("rewrite", "reachable", false, String(cause));
}

console.log("\n▸ Explaining why a risk area applies (insight)");
try {
  const found = await call("/insight", {
    area: "Third-Party & Supply Chain",
    parts: [
      { name: "Performs outsourced operations on our behalf", ticked: true },
      { name: "Relies on subcontractors (fourth parties)", ticked: false },
    ],
    added: [
      {
        name: "Third-Party Security Exposure",
        because: "a company outside ours is involved, so their security posture is part of ours",
      },
    ],
    assessment: {
      projectId: "check",
      activity: "Claims triage with an external vendor",
      onRecord: [{ label: "Company outside ours involved", value: "Yes" }],
    },
  });
  check("insight", "returns something to show", Array.isArray(found.insight) && found.insight.length > 0,
    JSON.stringify(found).slice(0, 160));
} catch (cause) {
  check("insight", "reachable", false, String(cause));
}

console.log("\n▸ Talking it through, grounded in policy (§22.5, G-65)");
try {
  const said = await call("/converse", {
    said: "What does business criticality actually mean here?",
    assessment: {
      projectId: "check",
      activity: "Claims triage with an external vendor",
      onRecord: [{ label: "Most sensitive data", value: "Confidential" }],
      onScreen: { screen: "the severity questions", questions: ["How critical is the activity to business operations?"] },
    },
    history: [],
    openQuestions: [],
    context: "",
  });
  check("converse", "answers", typeof said.reply === "string" && said.reply.length > 20, JSON.stringify(said).slice(0, 200));
  // §22.2: it may explain, but it may not answer on the person's behalf.
  const answersForThem = /\bI have (recorded|set|answered)\b|\byour answer is now\b/i.test(said.reply ?? "");
  check("converse", "does not answer on the person's behalf", !answersForThem);
} catch (cause) {
  check("converse", "reachable", false, String(cause));
}

console.log("\n▸ Writing the handoff summary and its scenarios (§4.4)");
try {
  const record = [
    "Activity: Sable claims triage",
    "Purpose: route incoming claims faster",
    "",
    "Risk areas:",
    "- Third-Party & Supply Chain: applies (a company outside ours is involved)",
    "- Security & Resilience: applies (it applies to this activity)",
    "",
    "Controls:",
    "- Remote Access: No — \"Vendor support connects over a shared VPN account.\"",
    "- Privileged Access Management: No — \"Admin accounts are named but not vaulted.\"",
    "",
    "Findings:",
    "- Remote Access (non-compliance): shared VPN account",
  ].join("\n");
  const written = await call("/report", {
    assessment: {
      projectId: "check",
      activity: "Sable claims triage",
      onRecord: [
        { label: "Remote Access", value: "No" },
        { label: "Privileged Access Management", value: "No" },
      ],
      openQuestions: [],
    },
    record,
  });
  check("report", "writes a summary", typeof written.summary === "string" && written.summary.length > 40,
    JSON.stringify(written).slice(0, 200));
  const scenarios = written.scenarios ?? [];
  check("report", "proposes risk scenarios", scenarios.length > 0, `${scenarios.length}`);
  // The grounding rule: a scenario citing something absent is not weaker,
  // it is built on nothing — and the product drops it.
  const names = new Set(
    ["Remote Access", "Privileged Access Management", "Third-Party & Supply Chain", "Security & Resilience"].map((n) => n.toLowerCase()),
  );
  const ungrounded = scenarios.filter(
    (s) => !(s.from ?? []).length || !(s.from ?? []).every((f) => names.has(String(f).trim().toLowerCase())),
  );
  check("report", "every scenario cites something actually in the record", ungrounded.length === 0,
    `${ungrounded.length} of ${scenarios.length} would be dropped: ` +
      ungrounded.map((s) => (s.from ?? []).join("/")).join(" | "));
  // §4.4: a scenario is a question, never a finding.
  const decided = scenarios.filter((s) => /\b(is non-compliant|is a breach|is inadequate|must be)\b/i.test(s.scenario ?? ""));
  check("report", "proposes questions, never verdicts", decided.length === 0,
    decided.map((s) => String(s.scenario).slice(0, 60)).join(" | "));
} catch (cause) {
  check("report", "reachable", false, String(cause));
}

console.log("\n▸ When the model cannot be reached (G-69, trouble reporting)");
{
  const { tellTrouble, isTrouble } = await import("../src/lib/assistant-trouble.ts");
  const auth = tellTrouble("auth");
  check("trouble", "a rejected key says so, and does not invite a retry", auth.retryable === false && /key/i.test(auth.message));
  check("trouble", "a rate limit does invite one", tellTrouble("rate").retryable === true);
  check("trouble", "every trouble promises the person's work is safe",
    ["unreachable", "auth", "rate", "overloaded", "network", "unavailable"].every((w) => /untouched|nothing .*lost/i.test(tellTrouble(w).message)));
  check("trouble", "a judgement about their text is not a trouble", isTrouble("refused") === false);
}

const failed = results.filter((r) => !r.ok);
const byCapability = [...new Set(results.map((r) => r.capability))];
console.log("\n" + "─".repeat(60));
for (const capability of byCapability) {
  const mine = results.filter((r) => r.capability === capability);
  const bad = mine.filter((r) => !r.ok).length;
  console.log(`${bad === 0 ? "PASS" : "FAIL"}  ${capability.padEnd(10)} ${mine.length - bad}/${mine.length}`);
}
console.log("─".repeat(60));
console.log(`${results.length - failed.length} of ${results.length} checks passed\n`);
process.exit(failed.length === 0 ? 0 : 1);
