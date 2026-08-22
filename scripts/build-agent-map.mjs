#!/usr/bin/env node
/**
 * Generates the agent topology page from the repository itself — subagent
 * definitions, skill files, hooks, and the Phase-2 register in SPEC §22.1.
 *
 * Generated, never hand-written: a hand-copied map of what agents are told
 * drifts from what they are actually told within a week, and a map that
 * lies about guardrails is worse than no map.
 *
 * Usage: node scripts/build-agent-map.mjs [outputPath]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
// Both outputs move together. A test that regenerated into a temp
// directory still overwrote `src/data/agents.json` at the repo root,
// which silently repaired a tampered artifact *before* the Stop gate
// could notice it was stale — so the gate's staleness branch was
// unreachable dead code, and a hand-edited artifact went red once and
// green on the retry (enforcement-layer verification, gate 1).
const OUT = process.argv[2] ?? join(ROOT, "docs", "agent-map.html");
const DATA_OUT = process.argv[3] ?? join(ROOT, "src", "data", "agents.json");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Frontmatter + body from a skill or agent markdown file. */
function parseMd(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([a-z]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: match[2].trim() };
}

/** The first real sentence of a body — what the thing says it is, in its own words. */
function gist(body) {
  const prose = body
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("Implements SPEC"))
    .join(" ");
  const sentence = prose.split(/(?<=\.)\s/).slice(0, 2).join(" ");
  return sentence.replace(/\*\*/g, "").replace(/`/g, "").slice(0, 300);
}

// ---------------------------------------------------------------- build-time
const TRIGGERS = {
  "slice-review": "Before a slice starts, and again when its done-when holds.",
  "full-gates": "Before any commit, and before claiming anything is done.",
  "error-handling": "Before writing an action, a mutation, or any failure path.",
  "ui-craft": "Before building or restyling any screen.",
  "ux-audit": "When finishing a screen, or deciding how a question should behave.",
  "aws-ready": "When adding a feature, utility, or data-access path.",
  "question-design": "Before adding, rewording, or challenging any question.",
  "agentic-design": "Before proposing or specifying anything an agent would do.",
  "instrument-change": "Before changing any question, option, or condition.",
  "uat-checkout": "When handing the owner something to test.",
};

const SKILL_ACCESS =
  "None of its own. A skill is instructions the assistant loads into the work it is already doing — it acts with exactly the access that session already had, and adds no new reach.";

const build = [];

const agentsDir = join(ROOT, ".claude", "agents");
const agents = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
build.push({
  group: "Subagents — independent reviewers with their own context",
  nodes: agents.map((file) => {
    const { meta, body } = parseMd(readFileSync(join(agentsDir, file), "utf8"));
    return {
      name: meta.name ?? file.replace(".md", ""),
      status: "live",
      what: meta.description ?? "",
      trigger:
        "At the end of every slice, before the review is written. A FAIL blocks the slice; a PASS with findings means they are fixed and it runs again.",
      access:
        "Reads any file in the repository and searches it. Runs commands — the test suites, the database, and a browser it drives like a person. It cannot edit a single line of code: it reports, and someone else fixes.",
      gist: gist(body),
      full: body,
      where: `.claude/agents/${file}`,
    };
  }),
});

const skillsDir = join(ROOT, ".claude", "skills");
build.push({
  group: "Skills — procedure, loaded at the moment it is needed",
  nodes: readdirSync(skillsDir).map((dir) => {
    const { meta, body } = parseMd(readFileSync(join(skillsDir, dir, "SKILL.md"), "utf8"));
    return {
      name: meta.name ?? dir,
      status: "live",
      what: (meta.description ?? "").split(". Use ")[0],
      trigger: TRIGGERS[dir] ?? (meta.description ?? "").split(". Use ").slice(1).join(" "),
      access: SKILL_ACCESS,
      gist: gist(body),
      full: body,
      where: `.claude/skills/${dir}/SKILL.md`,
    };
  }),
});

const hooksDir = join(ROOT, "scripts", "hooks");
// Prose nobody derives, describing machinery that changes. Both entries
// had already drifted into falsehood: advise no longer merely *names* the
// standard, and the stop gate does far more than run two commands — it
// reads CLAUDE.md, every uat record and the demo file. A map that lies
// about a guardrail is worse than no map, so the wiring below comes from
// .claude/settings.json and these strings are kept to what stays true
// (enforcement-layer verification).
const HOOK_META = {
  "advise.mjs": {
    name: "advise",
    what: "Puts the governing standard's own checklist in front of the work, the instant a governed file is edited",
    access:
      "Sees the path of the file just edited, and reads the standards that apply to it. No network, no database, no other files.",
  },
  "stop-gate.mjs": {
    name: "stop-gate",
    what: "Work cannot conclude on a red build, a stale generated artifact, a slice with no record, or a demo nobody has thought about",
    access:
      "Runs the type checker and the unit tests, regenerates the map into a scratch directory to compare it, and reads CLAUDE.md, every uat/ record and demo/readiness.md. It writes nothing.",
  },
};

/**
 * When a hook runs, read from the wiring rather than asserted in prose.
 * The map used to report a hook as live because its FILE existed, so
 * deleting the wiring left the page still promising the gate ran.
 */
const WIRING = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf8")).hooks ?? {};
const wiringFor = (file) => {
  for (const [event, entries] of Object.entries(WIRING)) {
    for (const entry of entries) {
      for (const hook of entry.hooks ?? []) {
        if (hook.command?.includes(file)) return { event, matcher: entry.matcher };
      }
    }
  }
  return null;
};
const triggerFor = (file) => {
  const wired = wiringFor(file);
  if (!wired) return "NOT WIRED — this hook exists as a file but nothing runs it.";
  if (wired.event === "Stop") return "Automatically, whenever a working session tries to finish.";
  if (wired.matcher)
    return `Automatically, after every ${wired.matcher.replace(/\|/g, ", ")}. Nothing has to remember to call it.`;
  return `Automatically, on ${wired.event}.`;
};
build.push({
  group: "Hooks — mechanical, and they do not rely on anyone reading anything",
  nodes: readdirSync(hooksDir)
    .filter((f) => f.endsWith(".mjs"))
    .map((file) => {
      const source = readFileSync(join(hooksDir, file), "utf8");
      const doc = source.match(/\/\*\*([\s\S]*?)\*\//);
      const meta = HOOK_META[file] ?? { name: file, what: "", access: "" };
      const wired = wiringFor(file);
      return {
        ...meta,
        name: wired ? `${meta.name} (${wired.event})` : `${meta.name} (not wired)`,
        trigger: triggerFor(file),
        // "live" is a claim about the wiring, not about the file existing.
        status: wired ? "live" : "inert",
        gist: doc ? doc[1].replace(/^\s*\*\s?/gm, "").trim().slice(0, 300) : "",
        full: source,
        where: `scripts/hooks/${file}`,
      };
    }),
});

// ------------------------------------------------------------------- runtime
const spec = readFileSync(join(ROOT, "SPEC.md"), "utf8");
// Any phase label, not a guessed shape. The previous pattern accepted "S2"
// and "S3+" and silently rejected "S1 Intake", "S1–S2" and "S3.5+", so five
// registered features never reached the map (found by the owner, who
// remembered there were more agents than it showed).
//
// Scoped to §22.1's own table, not the whole document. It used to regex
// every four-column row in SPEC.md whose first cell began with "S" — which
// happens to yield exactly the register today, but §18's table sits one
// near-miss away (a fourth column would enrol its rows as "registered
// agents" and the count test would then fail with a misleading message).
// The reference should be the section the register lives in
// (enforcement-layer verification, gate 3).
const registerSection = (() => {
  const at = spec.indexOf("### 22.1");
  if (at === -1) throw new Error("SPEC §22.1 not found — the agent register has moved or been renamed");
  const rest = spec.slice(at);
  const end = rest.search(/\n#{2,3} /);
  return end === -1 ? rest : rest.slice(0, end);
})();
const registerRows = [...registerSection.matchAll(/^\| (S[^|]*?) \| \*\*(.+?)\*\* \| (.+?) \| (.+?) \|$/gm)]
  .map((m) => [m[0], m[1].trim(), m[2].trim(), m[3].trim(), m[4].trim()]);

const RUNTIME_ACCESS = {
  "Intake quality assistant":
    "Would read: the description the requester wrote, their other intake answers, and a published rubric. Would not read: anything outside this project, and no other team's assessment.",
  "Assessment companion":
    "Would read: everything this requester has said or attached on this assessment, plus the instrument itself. Would not read: another team's content, and nothing leaves the boundary without the §22.3 policy.",
  "Consistency & contradiction chaining":
    "Would read: every answer captured on this assessment, structured and prose. Nothing external at all — the deterministic half runs with no model and no network.",
  "Technology profile library":
    "Would read: a ratified library of technology profiles held inside the platform. Would not search the web per question — profiles are seeded by research and ratified by a human before use.",
  "Precedent suggestion":
    "Would read: attested answers from comparable assessments, as counts and patterns only. Never another team's project name, content, or owner — and nothing at all below a minimum number of comparable assessments.",
  "Application profiles":
    "Would read: the attested history of systems this organisation has assessed before, attributed to the assessment and date that established each fact.",
  "Divergence signal":
    "Would read: the same aggregate precedent, compared against this assessment. Shown to reviewers only — never to the person answering.",
  "Policy-grounded definitions":
    "Would read: the organisation's own policy library, quoted verbatim with clause and version. Nothing from outside the organisation.",
  "Policy-grounded suggestions":
    "Would read: the policy library and the requester's own words. The policy grounds the definition; only the requester supplies the facts.",
  "Compliance checking":
    "Would read: attested answers and the policy version in force when they were attested. A later policy revision never rewrites a historical assessment.",
  "Instrument-to-obligation traceability":
    "Would read: the instrument and the obligation library, plus human-ratified mappings between them.",
  "Instrument contradiction lint":
    "Would read: the authored instrument only — questions, options, conditions and rubrics. No assessment data, no personal information, and it never edits what it reads.",
  "Plain-language term help on demand":
    "Would read: the term on screen and the organisation's own policy and standards library. Not the person's answers.",
  "Destination record drafting":
    "Would read: this assessment's answers and the destination's field map. It never reaches the destination system itself — the write stays out of scope (§27).",
  "Reverse pre-fill from a system of record":
    "Would read: an existing record in the downstream system for this same application, and this assessment's answers, to offer the overlap.",
  "Intake quality assistant":
    "Would read: the description the requester wrote, and the published rubric it is graded against. Nothing else.",
  "Assessment companion (conversational)":
    "Would read: everything captured in this assessment so far, plus the instrument. It answers about this assessment only.",
  "Consistency & contradiction chaining":
    "Would read: every answer captured so far in this assessment, to compare them with each other.",
};

// Which group a registered feature belongs to. Anything not named here
// still appears — under "Other" — because a hardcoded list that silently
// filters is how two features registered today vanished from a page whose
// entire purpose is that agents can be enumerated (G-25).
const runtimeGroups = {
  "Intake & conversation": [
    "Intake quality assistant",
    "Assessment companion (conversational)",
    "Consistency & contradiction chaining",
  ],
  Knowledge: [
    "Technology profile library",
    "Policy-grounded definitions",
    "Policy-grounded suggestions",
    "Compliance checking",
    "Instrument-to-obligation traceability",
    "Instrument contradiction lint (semantic half)",
    "Plain-language term help on demand",
  ],
  "Portfolio memory": [
    "Precedent suggestion (portfolio memory)",
    "Application profiles (our own systems)",
    "Divergence signal (reviewer-side)",
  ],
  Destinations: [
    "Destination record drafting",
    "Reverse pre-fill from a system of record",
  ],
};

const byName = new Map(
  registerRows.map((r) => [r[2], { phase: r[1], name: r[2], does: r[3], guard: r[4] }]),
);

const grouped = new Set(Object.values(runtimeGroups).flat());
const ungrouped = [...byName.keys()].filter((n) => !grouped.has(n));
if (ungrouped.length > 0) runtimeGroups.Other = ungrouped;

const runtime = Object.entries(runtimeGroups)
  .filter(([, names]) => names.length > 0)
  .map(([group, names]) => ({
  group,
  nodes: names
    .filter((n) => byName.has(n))
    .map((n) => {
      const row = byName.get(n);
      const short = n.replace(/\s*\(.*\)$/, "");
      return {
        name: short,
        status: "dormant",
        what: row.does.split(".")[0] + ".",
        trigger: `Not built. Registered in SPEC §22.1 for ${row.phase}; Phase 1 builds none of it and may foreclose none of it.`,
        access: RUNTIME_ACCESS[short] ?? RUNTIME_ACCESS[n] ?? "",
        gist: row.does,
        full: `WHAT IT WOULD DO\n\n${row.does}\n\nGUARDRAILS BEYOND THE STANDING SET\n\n${row.guard}\n\nSTANDING GUARDRAILS (inherited by every registered feature)\n\n· It reads what the requester provided; it never invents facts.\n· It proposes; a human accepts. Nothing it produces is final on its own.\n· Any rewrite reorganises the requester's own words, never adds to them.\n· It speaks plain language: no internal identifiers, no scores as verdicts.\n· Its judgements are recorded with their basis, so a reviewer can tell what\n  was machine-suggested from what a human confirmed.`,
        where: `SPEC.md §22.1 · ${row.phase}`,
      };
    }),
}));

const DATA = { build, runtime, generated: new Date().toISOString().slice(0, 10) };

// ---------------------------------------------------------------- the page
const nodeHtml = (n) => `
  <article class="node ${n.status}" data-status="${n.status}">
    <button type="button" class="node-head" aria-expanded="false">
      <span class="node-top">
        <span class="node-name">${esc(n.name)}</span>
        <span class="chip ${n.status}">${n.status === "live" ? "Live" : "Registered"}</span>
      </span>
      <span class="node-what">${esc(n.what)}</span>
    </button>
    <div class="detail hidden">
      <p><span class="label">How and when it runs</span>${esc(n.trigger)}</p>
      <p><span class="label">What it can see</span>${esc(n.access)}</p>
      <p><span class="label">In its own words</span><span class="gist">${esc(n.gist)}</span></p>
      <details class="full">
        <summary>Read the full instructions</summary>
        <pre>${esc(n.full)}</pre>
      </details>
      <p class="where"><code>${esc(n.where)}</code></p>
    </div>
  </article>`;

const groupHtml = (g) =>
  `<p class="group-label">${esc(g.group)}</p>` + g.nodes.map(nodeHtml).join("");

const page = `<title>Agent Topology</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&display=swap">
<style>
  :root {
    --navy:#002855; --navy-2:#013a76; --accent:#c6ed08; --primary:#0076cf; --link:#0061a0;
    --tint-1:#f2f9fd; --tint-2:#e5f3fb; --tint-3:#cbe4f6; --page:#f6f8f9; --card:#ffffff;
    --ink:#1b2227; --ink-soft:#626d76; --line:#dbe2e7; --live:#008744; --live-bg:#e6fff2;
    --dormant:#96690f; --dormant-bg:#f7efdd;
    --mono: ui-monospace, "SF Mono", Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --navy:#0b1d31; --navy-2:#12314f; --primary:#67b0e8; --link:#8cc4f0;
      --tint-1:#16222c; --tint-2:#1a2b38; --tint-3:#24405a; --page:#10161b; --card:#182028;
      --ink:#e6eaed; --ink-soft:#9aa7b1; --line:#2a353f; --live:#7fd3a3; --live-bg:#163024;
      --dormant:#dcac5c; --dormant-bg:#2f2718;
    }
  }
  :root[data-theme="dark"] {
    --navy:#0b1d31; --navy-2:#12314f; --primary:#67b0e8; --link:#8cc4f0;
    --tint-1:#16222c; --tint-2:#1a2b38; --tint-3:#24405a; --page:#10161b; --card:#182028;
    --ink:#e6eaed; --ink-soft:#9aa7b1; --line:#2a353f; --live:#7fd3a3; --live-bg:#163024;
    --dormant:#dcac5c; --dormant-bg:#2f2718;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--page); color:var(--ink);
    font-family:Figtree,-apple-system,"Segoe UI",sans-serif; font-size:16px; line-height:1.5; }
  main { max-width:76rem; margin:0 auto; padding:2.5rem 1.25rem 5rem; }
  .kicker { font-size:.72rem; font-weight:800; letter-spacing:.16em; text-transform:uppercase;
    color:var(--primary); margin:0 0 .4rem; }
  h1 { font-size:2.1rem; font-weight:800; letter-spacing:-.02em; margin:0 0 .5rem; text-wrap:balance; }
  .lede { color:var(--ink-soft); max-width:48rem; margin:0 0 1.6rem; }
  .controls { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin-bottom:1.6rem; }
  .filter { font:inherit; font-size:.85rem; font-weight:600; cursor:pointer; border:1px solid var(--line);
    background:var(--card); color:var(--ink); border-radius:999px; padding:.35rem .9rem; }
  .filter[aria-pressed="true"] { background:var(--navy); border-color:var(--navy); color:#fff; }
  .filter:focus-visible, .node-head:focus-visible, summary:focus-visible { outline:2px solid var(--primary); outline-offset:2px; }
  .count { margin-left:auto; font-size:.85rem; color:var(--ink-soft); font-variant-numeric:tabular-nums; }
  .root { background:linear-gradient(180deg,var(--navy) 0%,var(--navy-2) 100%); color:#fff;
    border-radius:14px; padding:1.1rem 1.4rem; margin-bottom:.6rem; }
  .root h2 { margin:0; font-size:1.05rem; font-weight:800; }
  .root p { margin:.2rem 0 0; font-size:.9rem; color:#c3d6e6; }
  .root .accent { color:var(--accent); }
  .branches { display:grid; grid-template-columns:1fr auto 1fr; gap:0 1.4rem; align-items:start; }
  @media (max-width:960px){ .branches{grid-template-columns:1fr;} .divider{display:none;} }
  .branch-head { padding:1rem 0 .4rem; }
  .branch-head h3 { margin:0; font-size:1rem; font-weight:800; }
  .branch-head p { margin:.15rem 0 0; font-size:.86rem; color:var(--ink-soft); }
  .divider { width:1px; background:var(--line); align-self:stretch; margin-top:1.4rem; position:relative; }
  .divider::after { content:"stays behind   ·   migrates to AgentCore →"; position:absolute; top:5rem; left:50%;
    transform:translateX(-50%) rotate(90deg); white-space:nowrap; font-size:.66rem; letter-spacing:.1em;
    text-transform:uppercase; color:var(--ink-soft); }
  .group-label { font-size:.68rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase;
    color:var(--ink-soft); margin:1rem 0 .4rem; }
  .node { border:1px solid var(--line); border-left:3px solid var(--live); border-radius:10px;
    background:var(--card); margin-bottom:.4rem; overflow:hidden; }
  .node.dormant { border-left-color:var(--dormant); border-style:dashed; background:transparent; }
  .node-head { display:block; width:100%; text-align:left; font:inherit; color:var(--ink);
    background:none; border:0; cursor:pointer; padding:.65rem .85rem; }
  .node-head:hover { background:var(--tint-1); }
  .node-top { display:flex; gap:.6rem; align-items:baseline; justify-content:space-between; }
  .node-name { font-weight:700; font-size:.94rem; }
  .node-what { display:block; font-size:.85rem; color:var(--ink-soft); margin-top:.1rem; }
  .chip { font-size:.62rem; font-weight:800; letter-spacing:.06em; text-transform:uppercase;
    border-radius:999px; padding:.1rem .5rem; white-space:nowrap; }
  .chip.live { background:var(--live-bg); color:var(--live); }
  .chip.dormant { background:var(--dormant-bg); color:var(--dormant); }
  .detail { padding:0 .85rem .8rem; font-size:.87rem; }
  .detail p { margin:0 0 .6rem; }
  .label { display:block; font-size:.64rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase;
    color:var(--ink-soft); margin-bottom:.1rem; }
  .gist { color:var(--ink-soft); font-style:italic; }
  .full { border-top:1px dashed var(--line); padding-top:.5rem; }
  .full summary { cursor:pointer; font-weight:700; font-size:.83rem; color:var(--link); }
  .full pre { max-height:26rem; overflow:auto; background:var(--tint-1); border:1px solid var(--line);
    border-radius:8px; padding:.8rem; font-family:var(--mono); font-size:.74rem; line-height:1.5;
    white-space:pre-wrap; margin:.6rem 0 0; }
  .where { margin-top:.5rem; }
  .where code { font-family:var(--mono); font-size:.72rem; color:var(--ink-soft); }
  .hidden { display:none; }
  .laws { margin-top:2.4rem; border-top:1px solid var(--line); padding-top:1.4rem; }
  .laws h3 { font-size:1rem; margin:0 0 .8rem; }
  .law-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(255px,1fr)); gap:.6rem; }
  .law { background:var(--tint-1); border:1px solid var(--tint-3); border-radius:10px; padding:.75rem .9rem; }
  .law strong { display:block; font-size:.86rem; margin-bottom:.15rem; }
  .law span { font-size:.83rem; color:var(--ink-soft); }
  .stamp { margin-top:1.6rem; font-size:.78rem; color:var(--ink-soft); }
  @media (prefers-reduced-motion:reduce){ *{transition:none!important;} }
</style>
<main>
  <p class="kicker">Universal Risk Assessment · generated ${DATA.generated}</p>
  <h1>Agent Topology</h1>
  <p class="lede">
    Every agent in this project, what triggers it, what it can see, and its full instruction set.
    The line down the middle is the one that matters at migration time: the agents that
    <strong>build</strong> the product are Claude Code tooling and stay behind; the agents that
    <strong>are</strong> the product become AgentCore runtimes on AWS.
  </p>
  <div class="controls">
    <button class="filter" data-filter="all" aria-pressed="true">All</button>
    <button class="filter" data-filter="live" aria-pressed="false">Live today</button>
    <button class="filter" data-filter="dormant" aria-pressed="false">Registered, unbuilt</button>
    <span class="count" id="count"></span>
  </div>
  <div class="root">
    <h2>Universal Risk Assessment <span class="accent">·</span> one front door</h2>
    <p>SPEC.md is the brain. Phase 1 builds no runtime agent — and forecloses none.</p>
  </div>
  <div class="branches">
    <section>
      <div class="branch-head"><h3>Build-time — Claude Code</h3>
        <p>Builds and guards the product. Never ships, never migrates.</p></div>
      ${DATA.build.map(groupHtml).join("")}
    </section>
    <div class="divider" aria-hidden="true"></div>
    <section>
      <div class="branch-head"><h3>Runtime — the product</h3>
        <p>Registered in SPEC §22, deliberately unbuilt. These become AgentCore runtimes.</p></div>
      ${DATA.runtime.map(groupHtml).join("")}
    </section>
  </div>
  <div class="laws">
    <h3>The rules every runtime agent inherits</h3>
    <div class="law-grid">
      <div class="law"><strong>§22.2 · The evidence line</strong><span>World knowledge may inform the conversation. It may never become an answer's evidence — the person's confirmation is.</span></div>
      <div class="law"><strong>§22.3 · Our own AI risk</strong><span>External enrichment is data egress. Name what leaves, set a classification ceiling, assess the flow. The platform passes its own assessment first.</span></div>
      <div class="law"><strong>§22.4 · Precedent rules</strong><span>Attested answers only · aggregate, never disclose · never pre-selected · age is part of the fact.</span></div>
      <div class="law"><strong>§22.5 · Policy authority</strong><span>A policy defines what a term means and what is required. It never asserts a fact about this project.</span></div>
      <div class="law"><strong>Standing · Proposes, never decides</strong><span>Nothing an agent produces is final without a named human attesting it.</span></div>
      <div class="law"><strong>Standing · Grounded, or it asks</strong><span>Never invents facts. A rewrite reorganises the person's own words; it never adds.</span></div>
    </div>
  </div>
  <p class="stamp">Generated from the repository by <code>scripts/build-agent-map.mjs</code> — the instruction text below each node is the file itself, not a summary of it.</p>
</main>
<script>
  for (const head of document.querySelectorAll(".node-head")) {
    head.addEventListener("click", () => {
      const open = head.getAttribute("aria-expanded") === "true";
      head.setAttribute("aria-expanded", String(!open));
      head.parentElement.querySelector(".detail").classList.toggle("hidden", open);
    });
  }
  const nodes = [...document.querySelectorAll(".node")];
  const counter = document.getElementById("count");
  function applyFilter(which) {
    let shown = 0;
    for (const node of nodes) {
      const match = which === "all" || node.dataset.status === which;
      node.style.display = match ? "" : "none";
      if (match) shown++;
    }
    const live = nodes.filter((n) => n.dataset.status === "live").length;
    counter.textContent = shown + " shown · " + live + " live · " + (nodes.length - live) + " registered";
  }
  for (const button of document.querySelectorAll(".filter")) {
    button.addEventListener("click", () => {
      for (const other of document.querySelectorAll(".filter")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
      applyFilter(button.dataset.filter);
    });
  }
  applyFilter("all");
</script>`;

writeFileSync(OUT, page);

// The same data, for the in-app transparency page. Written as a module the
// app imports at BUILD time — never read from disk at request time, so the
// page works unchanged in a Lambda or a container (§26.1).
writeFileSync(
  DATA_OUT,
  JSON.stringify(
    {
      generated: DATA.generated,
      groups: [
        ...DATA.build.map((g) => ({ ...g, side: "build" })),
        ...DATA.runtime.map((g) => ({ ...g, side: "runtime" })),
      ],
    },
    null,
    2,
  ) + "\n",
);
const total = [...DATA.build, ...DATA.runtime].reduce((n, g) => n + g.nodes.length, 0);
console.log(`wrote ${OUT} — ${total} agents across ${DATA.build.length + DATA.runtime.length} groups`);
