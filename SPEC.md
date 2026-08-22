---
spec-version: 2026-08-21.14
---

# Universal Risk Assessment Platform — Specification

**Status:** ACCEPTED 2026-08-20. This is the spec of record; the governance log (§13) is active.
**This document is the BRAIN.** Requirements (§20), the delivery slices (§17), acceptance criteria (§19), and the governance log (§13) all live here and nowhere else — there are no side plans. Work traces to a requirement ID; requirements trace to a slice; slices trace to done-when gates. Anything not traceable here is, by definition, not being built.
**This document is the single source of truth for the product it describes.** Settled sections are not re-opened casually; changes to them are governance events recorded in the log (§13). The instrument's *content* (questions, rubrics, mappings) is not in this document — it lives as versioned data (§6.2); this document defines the *semantics* that content must obey.

---

## 0. Build Rules — how this specification is implemented

These rules bind any implementer, human or Claude Code, before a single line is written. They are the development-side twin of the product's never-guess invariant.

**Working discipline**

1. **Do not implement the entire specification in one pass.** Work in vertical slices, in the order given in §17.
2. **Before coding, inspect the existing repository** and determine what already exists. Reuse what satisfies the spec; never rebuild it.
3. **Do not proceed to the next layer until the previous layer's tests pass.** Green gates are the permission slip, nothing else is.
4. **Do not introduce technologies, abstractions, or dependencies** unless this specification requires them.
5. **Do not implement deferred or out-of-scope capabilities** (§16, §18) — not even scaffolding for them, beyond the interfaces §18 explicitly marks "design now".
6. **After each slice, run the relevant tests and report what changed** — files, LOC delta, tests added, behavior altered.

**Do-not-invent rules**

7. Do not invent requirements. Do not infer unspecified business logic.
8. Do not silently resolve contradictions — when the spec is ambiguous or self-conflicting, **stop and name the ambiguity**; resolution is an owner decision.
9. Do not add features because they seem useful. Prefer the simplest implementation consistent with the spec.
10. Do not change settled decisions (§13) without explicitly flagging the change and obtaining a governance-log entry.
11. **Every slice ends with the review protocol (§21), and no slice begins until the prior slice's review is closed.** Silence is never approval — from either side.
12. **Every slice plans its agentic opportunity** (§22) — designed and registered, not built. Phase 1 ships no agent; it may not ship anything that forecloses one.
13. **Every question ships designed.** Before any question a person answers reaches a screen, it passes the `question-design` probe: could they answer it without a glossary, what happens if it does not apply to them, and does it carry helper text that teaches. A question shipped without that pass is a defect, found later at ten times the cost.
14. **Every slice ships demo-ready UI** (§23) and obeys the experience principles (§24). A slice with working logic and unfinished interface is not done.
15. **Every slice is independently verified before it advances** — the slice-verifier subagent (§15) runs UAT and regression, and its report is attached to the review. Self-certification is not verification.
16. **Critique is owed, not optional.** The implementer must surface disagreements, weaknesses, and risks in the owner's instructions as readily as in its own work. Agreeable implementation of a flawed instruction is a failure of this specification, not a courtesy.

## 1. Mission and purpose

### 1.1 The mission

The organization runs **many risk assessments in many different places** — separate questionnaires, separate systems, separate owners — making the process slow and confusing for anyone trying to complete one. Real projects have spent **as much as 90 hours** working through the current assessments. This platform exists to collapse that:

> **One front door for the business user; every risk area's own process intact under the hood.**

The requester experiences a single, guided assessment. Each unique risk area (third-party, security, privacy, AI, legal, operational…) keeps its own custom processes and downstream systems — they **integrate behind the front door** through the instrument's routing and the export's destination mappings, rather than each demanding its own audience with the requester.

The stakes are strategic, not cosmetic: as AI accelerates delivery — and as more employees are trained and encouraged to build with it — siloed, slow risk processes become the binding constraint on the organization's ability to innovate safely. A user-friendly risk process with **governance embedded from the start** is what lets innovation speed up *without* risk review being skipped, gamed, or resented. If this is not solved, internal process — not technology — becomes the reason the organization falls behind.

**North stars, measured:**
1. **Time-to-complete** — from days of scattered effort (worst observed ≈ 90 hours) toward a single guided session; the agentic layer (§7) exists to push this further still.
2. **One collection spot** — a requester never visits a second system to be assessed; risk areas consume from the platform, not from the requester.
3. **Governance from the start** — rigor is embedded in the flow (routing, attestation, findings), never bolted on after.

### 1.2 The purpose

A platform that takes a business activity from **description to attested, exportable risk assessment** with the minimum burden on the business user and zero loss of rigor for the risk organization.

Three promises, in priority order:

1. **The instrument is rigorous.** A three-tier, condition-routed assessment: what is this activity, how severe is its risk along each activated path, and do the controls that risk profile demands actually exist.
2. **People only ever see what applies to them.** Routing is evidence-driven and explainable; a project that touches nothing sees almost nothing.
3. **Every answer is accountable.** Who said it, on what basis, who attested it, and — when AI assistance is active — the verbatim evidence it came from. Nothing is ever guessed.

Every requirement in §20 must serve at least one north star or one promise; anything that serves neither does not belong in the product.

## 2. Roles

| Role | Does | Does not |
|---|---|---|
| **Requester** (business owner) | Completes intake and Tiers 1–3; responds to reviewer questions; sees their own project only | Attest, resolve findings, change the instrument |
| **Risk Assessor** (reviewer) | Triages the queue; attests every visible answer (approve / correct / N-A-with-reason); disposes findings; accepts scenarios; runs final checks; packages | Author instrument content; approve their own four-eyes actions |
| **Admin** | Manages users, reviewer groups, scoring configuration; ratifies instrument changes | Bypass attestation or findings gates |

Attestation authority is enforced **server-side** against reviewer-group membership for the question's domain; admins are exempt. The UI is never the enforcement point.

## 3. The instrument — structural semantics

### 3.1 Shape

```
INTAKE  →  TIER 1 (per category: gate → path selection → conditionals)
        →  TIER 2 (severity per activated path + always-on block)
        →  TIER 3 (control objectives accumulated from Tiers 1–2)
```

- **Intake** — structured project metadata in ordered sections (description, ownership, categorization, compliance & data context). Intake fields may be conditional on other intake fields. Intake activates nothing by itself; it is the front door and the project's identity record.
- **Category** — a top-level risk area (third-party, solution architecture, AI/model, data & privacy, legal/regulatory, operational, security & resilience, governance, ethics & conduct, people & capacity, jurisdiction-bound execution). Each category owns exactly one **gate**: a yes/no question — *does this risk area apply at all?* Gate = No closes the category; nothing inside it is ever shown.
- **Path** — the routing currency. A named, human-readable risk thread (e.g. *Third-Party Logical Access*, *Agentic Autonomy*, *Cross-Border Data Transfer*). Tier-1 selections activate paths. The relationship is many-to-many: one selection may light several paths; one path may be lightable from several categories. **Paths, not categories, are what Tier 2 attaches to.**
- **Tier-2 severity question** — attached to a path; presents **Low / Medium / High with a written rubric anchor per band as the answer options themselves**. The anchor text is the definition; the requester self-rates against prose, never against a bare number. A small always-on block (business criticality, breadth, audience, material impact) is assessed on every project regardless of routing.
- **Conditional** — a follow-on question that reveals on a trigger:
  - *severity-fired* — reveals when its lead question's severity meets a threshold (typically Medium-or-High);
  - *always-fired* — reveals whenever its path is active (severity-independent);
  - *cross-tier* — additionally requires a specific Tier-1 selection;
  - *nested* — additionally requires a specific selection on a sibling conditional.
- **Control objective** (Tier 3) — a named control requirement with a family (IAM, Data Protection, Network & Boundary, Logging, Resilience, Ops, SDLC, AI Governance, Compliance, Privacy, Ethics, Governance, HR, Third-Party), a parent question, and optional child questions. Objectives **accumulate** from Tier-1/Tier-2 answers (§3.3) and are then **self-assessed**: does this control exist for this activity?

### 3.2 Routing rules (the engine's law)

1. **Positive evidence only.** An unanswered question satisfies nothing. Silence never activates, and negative operators (not-equals, excludes) do not pass on missing answers. No risk area can be waived by omission.
2. **Severity fails closed.** A severity comparison against an unknown severity is false. Unknown is never treated as Low.
3. **One visibility predicate.** A question is visible iff its category/path context is active AND its own display condition passes. Every surface — the requester flow, review queue counts, drafting scope (when the agentic layer is active), and the packaging gate — uses this single predicate. A question is in the funnel everywhere or nowhere.
4. **Union with provenance.** Path activation and control accumulation are unions across all satisfied triggers, and every activation retains its reasons ("lit by: …"). The requester and reviewer can always see *why* something is being asked.
5. **Derived severity.** Severity comes from anchored self-rating (the band is the answer) or is derived from a fact answer through a declared mapping (e.g. volume bands → Low/Medium/High). Derivations are data, never code.
6. **Capture vs. scoring.** Some questions exist to capture routing/registry detail without contributing severity (marked as capture). The distinction is explicit in the instrument data; capture answers never affect accumulation thresholds.
7. **Recompute, don't remember.** Activation and accumulation are pure functions of current answers. Changing an answer re-derives everything downstream; orphaned answers to no-longer-visible questions are retained as history but leave the funnel.

### 3.3 Control accumulation

Tier-1 selections and Tier-2 severities accumulate control objectives:

- a Tier-2 severity question may require objectives at **minimum severity thresholds** (e.g. *PAM required when provider access ≥ Medium*);
- specific option selections (Tier-1 or conditional) may require objectives directly, each with a stated reason.

Accumulation is expressed **as activation conditions over the same engine** (§6.3) — there is no second evaluator. The accumulated set, with reasons, is continuously visible to the requester (the ledger).

### 3.4 Tier-3 self-assessment semantics

Each accumulated objective is answered with exactly one of:

| Answer | Meaning | Consequence |
|---|---|---|
| **Yes** | Control exists and applies | Child questions reveal (subject to their own cross-tier conditions) for detail |
| **Partial** | Something exists; enhancement needed | Written note **required**; produces an enhancement finding at submit (§4.3) |
| **No** | Gap | Written note **required**; produces a control-gap finding at submit (§4.3) |
| **N-A** | Does not apply to this activity | Written justification **required**; exported explicitly as "N-A — reason", never as blank |

Child questions never fire unless the parent is Yes. Suppressed children (cross-tier condition unmet) are invisible, not "skipped".

### 3.5 Pre-deploy verification

Objectives and children may carry pre-deploy tags. The pre-deploy stage activates for build/change activities and **unlocks only when every visible assessment-stage answer is attested** — "what you built" is checked only after "what you said" is signed. Pre-deploy checks link to the claims they verify through ratified relationships.

## 4. The process

### 4.1 Stages

```
DRAFT (requester)          →  IN REVIEW (assessor)        →  EXPORTED
intake → T1 → T2 → T3 →       attest all visible →           packaged, immutable,
submit (findings synth)       findings disposed →            replayable
                              scenarios → final check →
                              package
```

Stage transitions are one-way facts (submitted-at, exported-at timestamps). Submission with open gaps is allowed but explicit: the requester confirms a named list of unanswered questions; reviewers see gaps exactly as they are.

### 4.2 Review & attestation

- Every **visible** question requires attestation before packaging: approve as-is, correct-and-attest, or N-A with reason.
- Attestation of an answer shared across assessments warns about its reach and records the confirmation.
- Attested answers are correctable only by an explicit correct-and-re-attest act — never silently re-waivable.
- Reviewer keyboard loop (next/previous, approve, edit, N-A) is a first-class requirement, and focus management across dialogs is part of its acceptance criteria.

### 4.3 Findings

At submission, Tier-3 answers synthesize findings automatically: **No → control gap**, **Partial → enhancement**. Findings — however raised — resolve only through four governed dispositions:

1. **Answer corrected** (the underlying answer was wrong);
2. **Not applicable** (with justification);
3. **Remediation planned** (owner + due date required);
4. **Risk accepted** (four-eyes: a second, named person accepts; expiry required; **expired acceptances reopen automatically**).

One rule decides "open" everywhere (packaging, queue, obligations): unresolved, or accepted-but-expired.

### 4.4 Risk scenarios

Accepted findings and evidenced answers seed proposed risk scenarios; each scenario must cite the exact answers it builds on. Scenarios count only when a Risk Assessor accepts them. Accepted scenarios ship in the package.

### 4.5 Packaging & export

Packaging requires: every visible question attested · zero open findings · zero open conflicts. The export is **insert-only and replayable**: a structured record mapping every attested value (including explicit N-A strings) to destination fields, plus accepted scenarios, plus the coverage of what was asked and why. Re-export creates a new record; nothing is overwritten.

### 4.6 Scoring — deliberately open

A frozen grade may be computed at packaging (machinery permitted) but **no composite score is displayed** anywhere in the flow. Whether a composite exists at all is an open governance question (§14) inherited from the URA's no-composite stance. This spec does not settle it.

## 5. Invariants (non-negotiable, enforced in the schema and tests — never only in UI)

1. **Evidence records are insert-only.** Drafted/AI-produced answers are never updated in place; corrections are new records.
2. **Never-guess.** Any AI-produced answer states its basis — *stated* (with a verbatim quote), *inferred* (with grounding), or *not-stated* (full abstention). A stated answer without a verbatim quote is structurally impossible (database CHECK + gate). Abstention is a correct, scoreable outcome.
3. **One verbatim matcher.** Quote verification is whitespace-normalized substring matching, defined once, used by every consumer (gate, scorer, highlighter). A second matcher is a defect by definition.
4. **One visibility predicate** (§3.2.3). **One similarity rule** for duplicate detection.
5. **Human attestation is the only path to "counts".** Nothing AI-produced is final without a named human attestation, authorized server-side (§2).
6. **Relationships go live only via propose → ratify.** Even seed data walks this path. Ratified edges carry evidence.
7. **Instrument versions are immutable once activated.** Change = new version. Answer records pin the version they were made under; history always renders.
8. **Four-eyes** on instrument activation and risk acceptance: proposer ≠ approver, enforced structurally.
9. **N-A is never blank** — always a recorded reason, exported explicitly.
10. **Routing law** (§3.2.1–2): positive evidence only; severity fails closed.

## 6. Architecture

### 6.1 The seams (do not scatter)

- **Agent access** — exactly one module knows how the agent is reached. Local transport now; AgentCore Runtime later; nothing else in the codebase may address the agent.
- **Session/conversation state** — exactly one module reads/writes it, shaped for an AgentCore Memory swap.
- **Model access** — only the agent service knows a model exists. The web application never imports a model SDK.

### 6.2 Instrument-as-data

The instrument (categories, gates, paths, questions, rubrics, conditionals, objectives, accumulation rules, destination mappings) is **versioned seed data**, validated by a coherence gate (§8) before it can activate. Prose reference documentation is *generated from* the data — the human-readable rendering can never drift from the machine truth. Changing the instrument is a data change through governance (§8), never a code change; anything the instrument cannot express in data triggers a design conversation, not a workaround.

### 6.3 The engine

One condition engine evaluates: equals / not-equals / includes / excludes / any-of / all-of (set membership on scalars) / answered / blank / numeric thresholds / severity-at-least / path aliases, with all / any / not nesting. Everything routes through it — gates, path activation, conditional reveals, control accumulation, pre-deploy. It renders any condition as one English sentence (the explainability surface) and lints authored conditions for contradictions.

### 6.4 AWS deployment — settled (G-7)

**The deployment target is AWS. This is settled, not aspirational**, carried forward from the prior platform's governance without reopening. The prototype runs locally for iteration speed; AWS is the destination, and every Phase-1 decision must keep that path open by construction. The migration plan of record:

- **Tier 1 — the day-one lift.** Two containers (web, agent) built from the repo root; ECS Fargate (or App Runner for web); RDS for PostgreSQL 16 with pgvector; ALB in front of the web service; the agent service internal-only (reachable solely from web tasks). Deployment changes environment variables, never code.
- **Tier 2 — managed model access.** Bedrock for all model calls, behind the model seam. **Critical path: the Bedrock model-access request is owner-side, approval time is uncontrollable, and everything model-dependent waits on it — it is filed before, not during, the migration.**
- **Tier 3 — AgentCore as substrate.** Runtime behind the agent seam, Memory behind the session seam, Gateway for enterprise connectors, Observability for traces. AgentCore is substrate, **never** an autonomous orchestrator of the governed pipeline.

**Phase-1 obligations (firm — these are built now even though cloud execution is Phase 3):**

1. Both services containerized from the first commit; images build from the repo root.
2. All environment-specific behavior flows through environment variables; zero `local vs. cloud` branches in code.
3. Postgres-only persistence, RDS-compatible; migrations as plain SQL.
4. No dependency without an AWS-managed equivalent, absent an explicit governance-log entry accepting the exception.
5. OpenTelemetry spans from the agent service from day one — console locally, CloudWatch later, same instrumentation.

A Phase-1 change that violates any of these five is rejected in review regardless of how well it works locally.

## 7. The agentic layer — defined, dormant

The platform is designed for AI assistance; this spec defines its contract even while the capability is disconnected from the flow:

- **What it does when active:** drafts answers from requester-provided evidence (documents, conversation) with verbatim citations and basis labels; renders answer choices as tappable options whose labels are quotable evidence; issues receipts naming exactly what was recorded and what failed with a next step; explains any question's routing on request; hands off (never performs) submission.
- **What it may never do:** answer from nothing; paraphrase evidence; utter internal identifiers to users; advance the interview on silence; attest, resolve, or accept anything.
- **How it is measured:** a ground-truth eval over the live instrument in which full abstention on absent evidence is a scored correct answer; per-domain accuracy baselines are committed artifacts and CI blocks regressions. Local-model runs measure the harness, never the quality bar.
- **Reconnection is a planned epic** against the stable instrument — including conversational intake, drafting passes, and the agent-reviewed instrument-change workflow. Until then the layer stays compiled, tested, and unreachable from the product UI.

## 8. Governance

- **Instrument changes:** seed-data pull request → coherence gate (referential integrity; activation satisfiability; no cycles; reachability of every question and objective; rubric completeness; duplicate sweep; destination coverage; ground-truth coverage when the agentic layer is active; constraint-relaxation deny-list on any prompt text) → **parity/regression harness** → four-eyes review → merge = ratification. No runtime authoring surface: the database can never fork away from the versioned data.
- **The governance log** (in this document) records every settled decision and every deliberate deferral, numbered, dated, one paragraph each.
- **Automated gates:** the full check chain (tests, type-safety, coherence gate, eval when active) runs on every change; sensitive paths (applied migrations, instrument seeds, environment files) are write-guarded; file-size budgets are enforced mechanically.
- **Independent audits:** standing auditor roles re-verify ratified relationships against their evidence, quote provenance against sources, and coherence after any instrument change.

## 9. User experience commitments

- **Requester:** one instrument, guided; category-per-screen with visible progress; every screen explains *why it's being asked*; the live ledger (activated paths with reasons, severities, accumulated objectives) is always visible; plain language everywhere — internal identifiers never surface; conditional reveals are visually distinguished from base questions; notes/questions can be attached anywhere and travel to the reviewer.
- **Reviewer:** queue ordered by need (findings first, then age); master-detail workspace; keyboard-first attestation; evidence and provenance one click from every answer; irreversible acts are named and confirmed; long operations always show pending state — **no silent seconds, ever**.
- **Both:** basis and severity are never conveyed by color alone; warning states are never restful; counts shown are always funnel counts (what the person can actually act on).

## 10. Quality bars

- **Engine:** every operator and routing rule pinned by unit tests including negative and unanswered-input cases; property/differential testing against the instrument's reference behavior; recompute performance budget (full-instrument re-derivation in single-digit milliseconds).
- **Instrument:** the coherence gate green is a precondition of activation, always.
- **End-to-end:** the full requester and reviewer journeys proven headless against rendered DOM (never server-markup greps) on every change.
- **UAT:** scripted, numbered checks with objective pass lines, two rounds (builder, then owner), sign-off required before any milestone is called done.
- **Migration safety:** schema and SQL are asserted equivalent by tests that apply real migrations to an in-memory Postgres; historical projects must always render.

## 11. Clean-code charter

- No parallel implementations of anything the engine, matcher, or predicate already does.
- File budgets enforced mechanically (components ≤ 400 lines; hard ceiling 800).
- Dead code is deleted in the same change that orphans it, with accounting; an unused-export gate keeps it dead.
- Comments state constraints, not narration or history; behavior is pinned by tests, not comment archaeology.
- Documentation is short, current, and rewritten rather than appended; anything derivable from data is generated.

## 12. Out of scope (this spec version)

Composite scoring policy (§14) · framework crosswalks (planned; will anchor to control objectives) · runtime instrument authoring UI · customer-supplied framework/questionnaire import · multi-tenancy and production identity (SSO) · the agentic layer's reconnection (planned epic) · destination-system write-back.

## 13. Governance log

- **G-1 (settled):** This specification supersedes the prior platform spec; the prior instrument (placeholder catalog) is retired in full. Historical assessments remain readable via version pinning.
- **G-2 (settled):** The three-tier instrument defined in §3 — categories/gates/paths, rubric-anchored severity, threshold-based control accumulation, Tier-3 self-assessment — is the assessment model of record, transcribed from the owner's reference design and verified by differential testing.
- **G-3 (settled):** Structured intake is the front door. Conversational/AI intake returns only as part of the agentic reconnection epic.
- **G-4 (settled):** Tier-3 No/Partial answers synthesize findings at submission (§4.3); packaging remains blocked on open findings.
- **G-5 (settled):** No runtime instrument authoring; seed-PR governance only (§8).
- **G-6 (settled):** The agentic layer's contract (§7) is normative now, even while dormant — nothing may be built that would violate it later.
- **G-7 (settled):** AWS is the deployment target and §6.4's tiered migration is the plan of record. Phase 1 builds AWS-ready by construction (the five firm obligations in §6.4); cloud execution itself is Phase-3 work. The Bedrock model-access request is the standing critical-path item and is owner-owned.
- **G-20 (settled):** The intake question about what an activity introduces or changes is **removed entirely** (2026-08-21, owner call). Intake's job is the identity record; routing is Tier 1's, which asks the same ground eleven times, specifically, one gate at a time. A coarse preview of the gates at the front door was a worse question at a worse moment. Pre-fill (FR-22) survives on the signals intake genuinely owns — vendor names, initiative type, data classification, and the AI question — and the technology/non-technology label the risk organisation needs for queue routing is derived in S2 from the answered gates rather than guessed at intake.
- **G-19 (settled):** "Technology / Non-Technology" retired from intake 2026-08-21. It asked a business user to classify against our taxonomy — a coin flip for a SaaS purchase, a spreadsheet-based process, a vendor's own system, or a policy change configured in an existing tool — and an ambiguous answer at the front door corrupts everything routed from it. Replaced by "What is this activity introducing or changing?" (multi-select, recognisable options, honest-uncertainty escape). The classification the risk organisation needs for queue routing is **derived** from that answer, and each selection pre-answers a Tier-1 gate (FR-22). General rule recorded: when a question requires the person to know our taxonomy, ask about their world and derive the taxonomy.
- **G-49 (settled):** A value the platform worked out keeps saying so after the person accepts it (2026-08-21, owner feedback #10, FR-33). The owner asked that the Tier-2 data-classification question default to the intake answer, because being asked the same thing twice is exactly what §24.6 forbids. **G-39a is not reopened:** a pre-selected answer nobody looked at is still recorded as that person's answer, attributed to them, and attested later as if they decided it — the failure this platform exists to prevent. What was genuinely broken is narrower and was invisible until the owner walked it: the offer never named *which* prior question its value came from, and it disappeared the moment the person answered, so after one click nothing on screen or in the record said the platform had worked it out. Provenance now survives the click. If a true default is still wanted after seeing that, it is a governance change and gets its own entry.
- **G-48 (settled):** A value a person supplies off-list belongs to their assessment immediately and to everyone else only when ratified (2026-08-21, owner feedback #5, FR-32). Letting a requester add a vendor is right — being blocked because a list is incomplete is the friction this product exists to remove — but a shared option list written from a request path means one person's typo becomes an option everyone else sees and picks, and the platform industrialises an error instead of catching one. §22.4 already forbids exactly this for precedent; the same reasoning governs the option list itself. Propose then ratify, with actor and timestamp, producing a new list version — the pattern the instrument's relationships already use.
- **G-47 (settled):** An unlisted answer is a different shape, not a different string (2026-08-21, owner feedback #7/#8, FR-30, FR-31). Answers are values from a known set, and the submission validators **refuse** anything else — a guard that has caught real defects. Storing typed text where an option id belongs would silently disarm it: nothing could then tell a real option from something somebody typed once, not the validator, not the reviewer, not a count of how many chose X. An unlisted value is therefore its own shape, accepted only where the question declares it allowed, so "can this be answered off-list?" is authored rather than incidental.
- **G-46 (settled):** Reference lists are versioned data, and an answer stores the label it displayed (2026-08-21, owner feedback #2–#6, FR-29, NFR-22). A picker needs a list, and the question is whether that list is instrument-shaped or an ordinary table. Renames settle it: correct "Novara Health" to "Novara Health Systems" in an editable table and every past answer silently claims something nobody said. This is the problem `module_versions` solves for questions, one layer down, so it takes the same mechanism — versioned, immutable once activated, a change is a new version — and the answer additionally records the **label as it appeared on screen**, redundantly and on purpose, because a reviewer six months later must read what the person saw rather than what the list says today. **One deliberate exception:** the people directory is operational, not versioned; `people` already exists for the persona switcher and a real deployment replaces it with an IdP lookup rather than a file. Rename-safety there comes from the stored label alone.
- **G-45 (settled):** A rubric anchor is the option, not a label on one (2026-08-21, S4, FR-6). Tier 2 asks "how severe" by showing three sentences and letting a person pick the one that describes their situation — *"privileged / admin access to production and/or broad access across environments"* — never the bare word "High". Two assessors reading a sentence about production access reach the same answer; two assessors reading "High" do not, and the portfolio numbers built on top stop meaning anything. Twenty-six questions, seventy-eight anchors, all verbatim from the owner's own instrument. Three consequences kept: a band the platform can work out from a fact already given is **offered and never pre-answered** (FR-7 — the suggestion is dashed, nothing is selected, and the person's click is still the answer, because a pre-selected band is an answer nobody gave, G-42); accumulated controls carry **every** reason that pulled them in, not the first; and the accumulation is computed on every render rather than stored, so changing a band changes the workplan with no migration (NFR-3).
- **G-44 (settled):** Demo readiness is tracked as an artifact, and finishing a slice forces the conversation about it (2026-08-21, owner's question "how are you tracking features to demo?"). The answer was: build completeness — slices, requirements, UAT records — and not demo readiness, which is a different thing. A requirement can be fully met and still be unfit to show: FR-4 is met while the screen that delivers it has fifteen tab stops before its first control, and the two beats that carry the demo's punchline (a severity answer summoning a control, the ServiceNow record) are not built at all. `demo/readiness.md` holds one row per beat — what the room sees, what delivers it, whether it is built, **whether a person has walked it**, and what to do if it breaks live — plus the risks that are not features (it runs on a laptop; the list opens on test data; no curated scenario) and an explicit list of what will not be claimed. The teeth: the Stop gate refuses to finish while `slices-covered` lags the slices marked DONE, and it asks the four questions rather than reporting a failed check. The distinction the file exists to hold: **a beat nobody has used is not ready, however green the tests are** — every defect that mattered this session was found by a person using the product.
- **G-43 (settled):** Anything that must always happen is a hook or a test, and the hook emits the procedure rather than naming it (2026-08-21, owner's question). §21 item 6 requires every slice to register its agentic opportunity; it lived in a skill and a prose line, so it fired when the owner asked for it — three finished slices had no such section at all. Three gates close the class: the Stop gate refuses to let work end while a generated artifact is stale or a slice marked DONE lacks a record containing its required sections **including the agentic one**; the agent-map parity test counts §22.1's rows and compares them to the map, an **external** reference instead of the generator grading its own output; and the advise hook now emits a skill's own checklist at the moment a governed file is edited, so procedure arrives in context whether or not anyone chose to load it. The division that makes this work: **mechanism answers "did it happen", judgement answers "was it any good"** — a hook can guarantee the first and never the second, which is what the verifier and the skills are for.
- **G-42 (settled):** The product may never state as the person's answer something the person was not asked (2026-08-21, S3 round two). Three instances in two rounds: a gate reason naming intake evidence when the source was another gate; a summary card reading *"you told us none of the specific threads apply"* to someone never asked; and, underneath both, an autosave that wrote a positive *"none of these apply"* for every open area the moment one box was ticked anywhere — fabricating three answers and making the false sentence consistent with the database. The rule has a mechanical shape: **a sentence attributing something to a person must be conditioned on the record of them saying it, not on the absence of a record.** "No paths are lit" and "they told us none apply" are different facts and must render differently; an autosave writes only what was touched, while submitting a form — an explicit act covering every question on screen — writes all of it. Provenance must also reach every surface: the round-one fix reached the gate screen and left the rail and the summary lying, because three places rendered the same fact from three hardcoded strings.
- **G-41 (settled):** A claim that a rule is enforced must be enforced (2026-08-21, S3 verification, B3). The S3 commit stated that the validator rejected chained gate pre-fills and chained derived paths. It rejected neither: the gate check looked only for a rule reading its own key, and the path check inspected one field name out of the several a rule can use — so a chained rule passed validation and then **silently never fired**, which is worse than a rejection because the author sees no error and the rule looks right. The shipped instrument already contained a two-hop gate chain, and a unit test asserted it as correct. Three fixes and one rule: chaining is now checked across the whole instrument rather than per category; gate resolution runs to a **fixed point** bounded by the category count, because two passes silently capped derivation at one hop and made chain depth decide whether an authored rule worked; and where the design genuinely wants a chain (intake → architecture → security, audit C-5) it is allowed and its provenance names the real source. **The rule: when a commit message says "enforced by X", the reviewer's first move is to break X.** Three consecutive rounds have now found a claimed guarantee that was not one.
- **G-40a (settled):** An operation a person experiences as one act is one transaction (2026-08-21, S3 verification, B1). The paths screen wrote four areas in a loop, so a failure partway committed the first two and then told the person *"nothing was saved"* — false, and the uncommitted ticks vanished on the next load, while the slice's own UAT record claimed "nothing is lost and the person is told". One call, one transaction, all or none; the sentence is now true because the behaviour changed to match it. Two corollaries kept: an answer is saved when it is given, not when a form is submitted, because the primary navigation on that screen used to discard ticks silently (§24.3); and a transport failure carries a per-incident reference, not a class name like `OFFLINE`, because support correlates incidents, not categories.
- **G-40 (settled):** Derived state is computed, never stored (2026-08-21, S3, NFR-3). The engine answers three questions from the answers given — which paths are lit, which gates another gate settles, and what each of those depends on — and writes none of it down. Changing an upstream answer therefore re-derives everything downstream with no migration, no reconciliation job, and no stale row that can disagree with the answers it came from; the end-to-end suite proves it by reopening the AI area from intake and watching the cross-domain path appear. Two rules fall out and are enforced: a derived path may depend on chosen selections but never on another derived path (one level, no cycles, checked by the validator), and a gate may not pre-fill from its own answer. **Parts-shelf decision #1 (§17): rewrite, not salvage.** The prior platform's engine solves module activation for a flat questionnaire; paths, severity bands and threshold routing are a different shape, and adapting ~1,000 lines built for another model would have cost more than the ~150 written here against the predicate this codebase already had. Its *test patterns* were taken. The shelf was consulted and declined on the evidence, which is what G-8 asks for.
- **G-39a (settled):** Every path the engine lights without asking carries the sentence that explains it (2026-08-21, FR-5, §24.5). "Supplier concentration — every supplier gets this one" and "personal information in AI — you told us personal information is involved and that this uses AI" are shown next to the question they replace, in the same treatment as an intake pre-fill, because they are the same promise: we already knew this, so we did not ask. An assessment that silently expands its own scope is one people stop trusting, and the difference between *chosen* and *derived* stays visible in the data model, not just the screen.
- **G-39 (settled):** Nothing a person types is discarded by the framework (2026-08-21). Intake's fields are controlled inputs, so React's first render replaces whatever is in the DOM with the values the server sent — meaning anything typed in the window between the HTML arriving and the JavaScript hydrating vanished. Silently: no error, no sign, the answer simply gone, and the person had no way to know which keystrokes had counted. It surfaced as an end-to-end test losing a typed answer about one run in three on a page reached by redirect, and the tempting reading was "flaky test". It was not: the value never reached React at all, and the rail sat at "3 still needed" for five seconds proving it. The form now reads itself once on mount and adopts what it finds, and every control carries a `name` so there is a form to read. Two rules kept: **an intermittent failure is a defect until proven otherwise** — "it passes on a retry" is a description, not a diagnosis; and a server-rendered form that looks usable before it is usable is making a promise the framework has to keep.
- **G-38 (settled):** Data classification is one answer on a named scale (2026-08-21, audit C-3, owner call). It was a multi-select whose own help text said "choose the highest classification of any data involved" — the words asked for one answer and the control accepted four, so two people describing identical data produced records that could not be compared, and any later severity reading "the classification" got a different answer depending on who filled the form. It is now a single choice, rendered as the scale it is rather than a dropdown: four cards in order, each with a sentence describing what belongs in it, rank shown by position and filled pips as well as by name (never colour alone, §11.1). The label changed with it — "Data Classification" was our vocabulary; "What's the most sensitive data involved?" asks the question and makes the "highest one wins" rule part of the question instead of an instruction underneath it. Existing rows keep their high-water mark (migration 0010). Second effect, which is why it was worth the migration: `Public` became expressible, so genuinely public data now **closes** the privacy area. Deliberately no "I'm not sure" option — the four descriptions place almost any situation, and the help says to choose the higher of two when caught between; if that proves wrong in use, the escape hatch is the fix, not the scale.
- **G-37 (settled):** Required means required, and negative paths are verified by default (2026-08-21, owner found it in use). Clicking Next four times through intake while answering nothing landed on the risk areas with a completely empty identity record — so nothing pre-filled, all eleven gates were asked, and the platform's central claim quietly stopped being true. `required: true` in the instrument data was decoration: no control carried it, no submit checked it, and no server route refused it. **Root cause, and the reason three layers of checking missed it: it was not a requirement.** FR-1 described sections and conditional fields; nothing said enforcement, so there was no §19 criterion, no UAT row, no test, and nothing for a verifier working requirement-by-requirement to check — while every journey in the suite filled the form in order, front to back. This is the third defect of one shape (see G-28, G-33): **the suite tests the path the feature was designed for, and verification tests the requirements as written, so anything nobody wrote down is invisible to both.** Two fixes, one for the defect and one for the shape: FR-28 makes enforcement a requirement with the refusal server-side, and NFR-21 makes an adversarial input pass — empty submit, skipped step, URL bypass, stale re-submit — a standing step in every verification, owed whether or not a requirement mentions it. Partial saves remain allowed and nothing typed is ever discarded; what is refused is treating an unfinished record as finished.
- **G-36 (settled):** A risk area that applies to everyone is stated, not asked (2026-08-21, audit C-8, owner call). Governance & Oversight would have been Yes on very nearly every assessment, and it asked in risk-department vocabulary a business user cannot answer confidently ("decision rights", "oversight responsibilities"). **The area is not removed and its coverage does not change** — the question is. It is marked `alwaysApplies` in the instrument, shown in the rail as "Applies · not asked", excluded from the count of what a person still has to do, and reachable by link so that a person who goes looking is told there is nothing to answer and why, rather than being silently redirected. Deliberately *not* modelled as a pre-fill: a pre-fill invites correction, and this is not the requester's to correct. Three related gates were examined and left alone — People & Capacity needs re-anchoring on checkable facts rather than removal, Security & Resilience needs the pre-fill in C-5, and Ethics & Conduct is genuinely uncertain until real projects have been walked through.
- **G-35 (settled):** Intake asks whether a third party is involved, rather than inferring it from a name field (2026-08-21, audit C-2, owner call). The condition engine is positive-evidence-only by design (§3.2.1), so an empty vendor-name box proved nothing: the Third-Party area could only ever be opened, never closed, and someone typing "none" opened it on a false positive. A plain Yes / No / I'm not sure question now closes the area outright when the work is in-house, and the name field is revealed only by a Yes. **Distinguished from G-20:** the question the owner removed asked a business user to classify their activity against our risk taxonomy; this asks a fact about their own project that they already know, and its answer is checkable. Measured effect: the audit's worst case — a process change with no technology, no vendor, no AI — went from 0 of 11 areas pre-answered to two closed before Tier 1 begins, and one never asked.
- **G-34 (settled):** Destinations registered 2026-08-21 (§27, owner call): the assessment becomes a source that downstream systems of record draw from, first instance the ServiceNow AI Use Case Record. Two decisions inside it. The offer is **opt-in** — the owner chose the prompt over silent registration, and the count in it must be computed rather than written, because a real "24 of 29 already answered" is the whole argument and an invented one is a lie in the demo. And the field map is versioned data marked provisional on screen until the organisation confirms the live field list, so the demo can be honest about what it has: the values are real answers, the field names are our best guess, and swapping them is a file edit. The write to ServiceNow is deliberately out of scope; the payload is real and downloadable, the send is labelled not connected, and nothing mimics a successful send.
- **G-33 (settled):** A role is what it permits **on the object**, not only in the listing (2026-08-21, N1 — blocking, second verification round). G-29's fix scoped the assessment list and stopped there, so every assessment stayed open to every persona by URL: a requester edited the administrator's project, and an assessor answered a gate on a requester's, both written with the wrong person's attribution. The list rule and the object rule are now one function (`mayOpenAssessment`), a unit test requires them to agree for every role, and a route that loads an assessment without going through the single access helper fails an architecture test. The lesson is narrower and more useful than "check permissions": **a fix aimed at a finding tends to stop at the finding.** F2 was reported as a listing problem, so it was fixed as one. The question that was not asked is the one to ask next time — *what else was relying on the thing I just found to be missing?*
- **G-32 (settled):** Refusals are designed states, not exceptions (2026-08-21, N2/N3/N15). A server action that throws lands the person on the generic error boundary, which told them the page had failed to draw and never mentioned the rule that had actually been applied. Server actions now return typed failures for every outcome including refusal; the architecture test that was meant to enforce this matched `throw new Error` only and let a bespoke error class through, which is worse than no test because it reads as coverage. `retryable` is now honoured in the interface rather than merely produced: a permanent failure offers the way out, not "Try again".
- **G-31 (settled):** A test suite may not write to the environment a person works in (2026-08-21, F11). The end-to-end suite created a project per journey in the *development* database, so the assessment list a demo opens on had filled with rows named `Scope 1787327552901`. The suite now brings its own database and its own server, created and migrated by `scripts/prepare-e2e-db.mjs` — which is also the shape a fresh environment takes (create, migrate, activate). **Honest limit:** nothing runs it on a clean machine yet — there is no CI in the repository, so "it builds from scratch" is a claim resting on one developer's laptop until a pipeline exists (N16). `pnpm db:reset` rebuilds the development database the same way, which is the only way back to a clean environment given that an assessment holding answers cannot be deleted (F13). Listings say what they are withholding rather than truncating quietly.
- **G-30 (settled):** Intake is evidence, not a scratchpad (2026-08-21, F5). Gate answers recorded their author from S2.5; intake did not, and because intake writes update a mutable row, the previous value simply vanished — "who changed the data classification, and from what?" had no answer anywhere in the system, while NFR-19 claimed attribution across the assessment. `intake_events` is insert-only like `answers`, keeps the previous value as JSON so a removed multi-select option is still visible, and carries a nullable author because fabricating one would be worse than admitting a gap. What moved is decided by pure logic (`intakeChanges`) so the history is testable without a database.
- **G-29 (settled):** A role is what it permits, not what it is called (2026-08-21, F2). The Risk Assessor was a distinct label with an identical permission set, and every role saw every project under a heading reading "Your assessments" — contradicting §2's "sees their own project only" on the very screen that introduces the product. A requester now sees their own work; a Risk Assessor and an administrator see the queue, which is the job; and a Risk Assessor may not start an assessment they would later review, refused server-side rather than by omitting the control. A unit test now requires every role's permission set to be distinct from every other's, so a role cannot be added as a label again.
- **G-28 (settled):** A submission writes only what it is responsible for (2026-08-21, F1 — blocking). Saving any intake section silently erased every multi-select answer in every other section, and reported success. The cause was a whole-instrument patch built from a partial form; the reason it survived a slice review, a UI pass and a green suite is that the unit test **asserted the defect as correct** and the end-to-end journey filled sections strictly forward, so it never crossed the boundary. A partial submission now declares its scope and fields outside it are left alone. Two lessons are kept: a test written from the implementation inherits the implementation's blind spot, and the first completed independent verification found in one run what three self-reviews had missed — §21's independent step is not a formality.
- **G-27 (settled):** §24.3 added 2026-08-21 from a defect the owner found in use — the persona switcher required choosing a person *and then* pressing "Switch", so choosing appeared to do nothing and the control read as broken. A control now responds to the action a person takes; confirmation is reserved for the irreversible. The suite had not caught it because the journey was written knowing the implementation (select, then click) — the exact blind spot independent verification exists to cover, and the verifier had still never completed a run.
- **G-26 (settled):** Personas built at S2.5 (2026-08-21) rather than deferred to the review slice, for one decisive reason: answers are insert-only, so a row written without an author can never be attributed afterwards, and every slice would grow that unattributable population. The role model is real and enforced server-side; the switcher over seeded people is explicitly a pilot device and says so on screen. Production identity (single sign-on, tenancy) remains out of scope (§12) — replacing the switcher touches `current-person.ts` alone and moves no authority rule. Rows written before this slice keep a null author and read as "recorded before attribution existed"; fabricating an author would have been worse than admitting the gap.
- **G-25 (settled):** AI transparency is a product feature, not a debug screen (2026-08-21, FR-24). The administration page at `/admin/agents` lists every agent — build-time and runtime — with when it runs, what it can reach in plain words, its guardrails, and its complete instructions. It is **generated from the codebase** at build time and imported (never read from disk at request time, §26.1); `test/unit/agent-map.test.ts` regenerates and compares, so adding an agent without regenerating fails the build, and the advise hook says so the moment an agent or skill file is edited. Scope note: this sits outside the Phase-1 boundary in §16 and is admitted deliberately, because an organisation cannot govern agents it cannot enumerate — it is the visible half of §22.3. **Honest limit: there is no identity yet, so the page cannot actually be restricted to administrators; it says so on the page rather than implying protection it does not have.**
- **G-24 (settled):** UAT is an artifact, not a conversation (2026-08-21). Every finished slice carries `uat/<slice>.md` — one row per owned requirement, with what was done, what was observed, a pass/fail result, and evidence — committed with the slice and stamped with the spec version it was run against. Six criteria are enforced by test rather than by review: coverage of every owned requirement, no orphan rows, substantive evidence ("works" is not evidence), no blank results, follow-up on every failure, and a matching spec version. Adapted from the artifact-reviewer pattern; implemented as tests because this project puts teeth in tests. SPEC.md now carries a `spec-version` so a record can say what it was checked against.
- **G-23 (settled):** 2026-08-21 — questions must be designed before they ship (Build Rule 13), and two experience laws added from a live finding: every question says what to do when it doesn't apply (§24.9), and every question carries teaching helper text (§24.10). Both are enforced by tests rather than by review, because the finding that prompted them — an empty vendor field with no way to say "nothing, it's all in-house" — survived a slice review, a UI pass, and a screenshot before the owner caught it.
- **G-22 (settled):** Policy grounding registered 2026-08-21 — definitions, suggestions, compliance checking, and instrument-to-obligation traceability — governed by §22.5. An internal policy is authoritative for definitions and requirements (the one legitimate exception to §22.2's evidence line) but never for facts about a project; quotes are verbatim with clause and version named; policies are versioned like the instrument so a revision raises a finding rather than rewriting history. Salvage note: the prior platform's policy machinery (library sources and items, verbatim claim extraction, answer-to-policy alignment, findings with four dispositions) is proven and is the salvage candidate; the policy corpus itself comes from the organisation.
- **G-21 (settled):** Portfolio memory registered 2026-08-21 — precedent suggestion, application profiles, and reviewer-side divergence signals — governed by §22.4's four rules: attested-only (no precedent laundering), aggregate-never-disclose with a minimum comparable count, no anchoring (never pre-selected; for binary gates prefer showing patterns after the answer), and age shown as part of the fact. Divergence is a reviewer triage signal, never pressure on the requester toward the majority.
- **G-18 (settled):** Documentation architecture — law in SPEC (short, governed, traceable), procedure in skills (loaded on demand), teeth in tests and hooks. Skills may not carry normative rules that must always hold, because loading is probabilistic; anything always-true is stated here and routed from CLAUDE.md. Adopted 2026-08-21.
- **G-17 (settled):** The persistence engine is an open decision under standing assessment (§14.6), not a settled choice — Postgres is Phase 1's implementation behind the store interface, DynamoDB is a live candidate. Store-specific choices must be flagged in slice reviews; the implementer reports with evidence after S9 and before the AWS migration. Recorded 2026-08-21 at the owner's direction.
- **G-16 (settled):** §26 cloud-native construction rules adopted 2026-08-21 as workspace law (NFR-14 to NFR-17): pure logic separated from executors, state and persistence externalised behind one interface, configuration only through a single validated env module, and three separately-runnable test tiers. The migration guide (§26.7) is a named deliverable before production. Recorded correction: development-time subagents do not migrate; the runtime agents are the Phase-2 features in §7.
- **G-15 (settled):** §25 error-handling standard adopted 2026-08-21 (NFR-13): expected failures are typed values not exceptions; the user gets a sentence and a quotable reference while the log keeps the detail; every message says what happened, whether their work is safe, and what to do next; input is never lost; error paths are tested.
- **G-14 (settled):** §24 experience principles adopted 2026-08-21 — each derived from a defect found in this build, audited by the slice-verifier, and binding on every surface. The first two, in the owner's framing: never re-ask what someone said they don't know, and pace the journey rather than presenting a wall.
- **G-13 (settled):** Independent verification is a Phase-1 capability, not a Phase-2 one: the slice-verifier subagent runs UAT and regression against every slice before it advances, cannot edit code, and its report is part of the slice review. Adopted 2026-08-21.
- **G-12 (settled):** Every slice ships demo-ready UI to the §23 standard; a slice with working logic and unfinished interface is not done. Taste calls belong to the owner and are applied before the next slice begins.
- **G-11 (settled):** Every slice registers its agentic opportunity (§22) as a designed, guard-railed Phase-2 feature. Phase 1 builds none of it and may foreclose none of it. First entry: the intake quality assistant (rubric grading, contradiction detection, opt-in rewrite of the requester's own words).
- **G-10 (settled):** Intake question set refined 2026-08-21 (S1 review): AI capture with a conditional detail field; plain-language "new vs. update" replacing the acronym list, with an optional prior-work pointer; objective launch date replacing self-reported priority; lifecycle stage retired (absorbed by initiative type); procurement status softened to Yes/No/Not-sure; compliance-obligation areas and granular PII detail removed from intake — both are asked at Tier 1/2 where they route (T1-LRC-2, T2-PRIV-1.C). Consequence: intake now carries routing-relevant answers, which is why FR-22 exists.
- **G-9 (settled):** Delivery runs under the slice review protocol (§21) — pre-flight before each slice, structured review with mandatory self-critique after it, refinements applied and re-gated before the next slice. Adopted 2026-08-21 after the intake review demonstrated its value in both directions.
- **G-8 (settled):** Execution route — **fresh repository, built slice by slice (§17)**. The prior repository is retained untouched as the **parts shelf**: proven components (condition engine, invariants schema, verbatim matcher, eval harness, agent service) are salvage candidates, and each salvage-or-rebuild decision is made at the slice that needs the part, recorded against that slice. The prior repository is never developed further and is decommissioned only after Phase-1 acceptance.

## 14. Open questions (decisions owed, not forgotten)

1. **Composite scoring** — does a composite grade exist at all, and if so where may it appear? (Inherited; owner decision.)
2. **Tier-3 audience** — requester-completes vs. control-SME persona; affects reviewer groups only, not structure.
3. **Re-ask policy** — when, if ever, an unanswered asked question resurfaces (matters mainly once the agentic layer returns).
4. **Help text per audience** — single help string today; requester vs. reviewer variants require a data-model addition.
5. **History posture at handoff** — keep full git history or squash to a clean initial commit.
6. **Persistence engine — Postgres or DynamoDB (owner decision, standing assessment).** Postgres is Phase 1's implementation behind the §26.2 interface; DynamoDB is a live candidate for the AWS target. The implementer assesses and reports at two checkpoints — **after S9** (the data model is fully known) and **before the AWS migration** — against these criteria, with evidence rather than preference:
   - **Invariant enforcement (the decisive one).** §5's invariants are currently enforced by database CHECK constraints, which DynamoDB does not have. Moving to DynamoDB relocates those guarantees into application code, weakening "enforced in the schema, never only in the UI". That is a governance trade, not a technical preference, and would need its own governance entry.
   - **Access patterns.** Whether reads stay key-shaped (a project by id) or need relational work (queue triage across projects, findings by state, answers joined to instrument versions).
   - **Operational fit.** DynamoDB: scale-to-zero, no connection ceiling, no RDS Proxy, cheap at pilot volume. Postgres: joins, ad-hoc reviewer queries, multi-row transactions, and pgvector if Phase 2 wants embeddings.
   - **Migration cost at the decision point**, measured against the store interface as it then stands.

## 15. Claude Code operating layer

This repository is operated with Claude Code as a first-class tool; the operating layer is versioned in the repo, not tribal.

- **CLAUDE.md** — the working contract, ≤120 lines, containing exactly: the command surface, the two seams, a pointer to §5's invariants, the seeds-as-truth rule, and the gotchas that cost real time. It describes the system that exists; history lives in git.
- **Hooks** (versioned in `.claude/settings.json` + `scripts/hooks/`):
  - *Pre-write guard* — blocks edits to applied migrations, environment files, instrument seeds outside the governed workflow, and settled SPEC sections without a governance-log entry.
  - *Post-write* — formatter + package typecheck on every edit.
  - *Stop gate* — the full chain (tests · coherence gate · eval when active · **file-budget check**) must pass before any session concludes work. The budget check enforces §11 mechanically.
- **Skills** (`.claude/skills/`): `/instrument-change` — the governed seed-PR workflow end to end (edit → validate → parity → ground truth → four-eyes PR); `/full-gates` — the complete gate chain; `/uat-checkout` — generates a numbered, objective-pass-line test script for the current milestone. Procedures are commands, not lore.
- **Subagents** (`.claude/agents/`): **slice-verifier** (mandatory — see below), *contract-guard* (before any seam-adjacent commit), *coherence-auditor* (after any instrument change), *provenance-auditor* (before any eval-baseline commit), *ontology-auditor* (sampling ratified relationships). Each definition states its trigger moment; using them at those moments is part of the definition of done for the relevant change.
- **The slice-verifier is not optional.** Every slice is independently verified before its review is written: full gate chain, requirement-by-requirement UAT driven through the running app, **regression over every prior slice's journey**, acceptance criteria including negative cases, a §23 UI audit, a §24 experience audit, an invariant spot-check, and a scope check. It may not edit code — it reports. **A FAIL blocks the slice; a PASS with findings means the findings are fixed and it is re-run.** Its report is attached to the slice review (§21).
- **Conventions the layer enforces**: file budgets; no parallel implementations (§11); generated docs only regenerated, never hand-edited; model access confined to the agent service.

## 16. Phase boundaries — what "build this" means

**Phase 1 (the MVP — the only phase authorized by accepting this spec):**

Build a functioning assessment using **static seed instrument data**, comprising:

- structured intake (with conditional fields);
- Tier-1 routing (gates → paths, union with provenance);
- Tier-2 severity (rubric-anchored + derived) with conditionals;
- Tier-3 control accumulation and self-assessment (Yes/Partial/No/N-A);
- full recomputation semantics (§3.2.7);
- the requester flow with the live ledger;
- reviewer attestation (keyboard loop included);
- findings synthesis and the four dispositions;
- basic packaging/export (attested values, explicit N-A strings, findings, coverage).

The instrument ships in two profiles from one pipeline — a curated **demo profile** (all gates, selected paths, 6–8 control objectives) and the full profile as trailing data work. Phase 1 is delivered as slices S1–S10 (§17), which collectively own every FR/NFR in §20. Phase-1 acceptance = the demo profile end to end: create → intake → T1/T2/T3 → submit (findings synthesized) → attest → dispose → package → export renders, with the full gate chain green and both UAT rounds (§10) signed off.

**Phase 1 explicitly excludes:** AI/agentic capabilities, AgentCore, AWS deployment, risk scenarios, framework mappings, runtime instrument authoring, pre-deploy verification, scoring display, and independent-auditor automation. Exclusions are binding on the implementer per Build Rule 5. The Phase-1 list may shrink by owner decision; it may not silently grow.

**Phase 2 (planned, not authorized):** agentic reconnection (§7) — drafting, conversational intake, receipts, eval activation. **Phase 3 (planned):** pre-deploy verification, scenarios, crosswalks anchored to control objectives, and the AWS migration executed per §6.4/G-7. Each phase begins with its own acceptance criteria added to this document.

## 17. Delivery plan — the slices

Phase 1 is delivered as **ten vertical slices, built strictly in order**. Each slice ends demoable and reviewable; **do not start a slice until the previous slice's done-when holds and its owned requirements (§20) pass** (Build Rule 3). Execution route per G-8: fresh repository; the prior repository is the **parts shelf** — salvage decisions are made per-slice, at the moment a slice needs the part, never in advance.

| # | Slice | Builds | Owns | Done when |
|---|---|---|---|---|
| **S1** | Intake | New repo (minimal web + Postgres); the four intake sections with conditional fields; project list. Needs nothing from the parts shelf. | FR-1, FR-2 · NFR-5, NFR-6, NFR-7, NFR-9 | Create a project, complete intake, close the browser, reopen: everything is there. Owner reviews before S2. |
| **S2** | Gates | Schema for instrument + answers with §5 CHECKs; the 11 category gates, one per screen; instrument content as seed data from day one. | FR-3, FR-22 · NFR-1, NFR-8, NFR-11 | Gate answers persist; No closes its category; migration tests green. |
| **S2.5** | People | Role model (requester · Risk Assessor · admin) enforced server-side; persona switcher; attribution on every answer. | FR-25 · NFR-19 | Switching persona changes what the platform permits, not only what it shows; every new answer records who gave it. |
| **S3** | Paths & engine · DONE 2026-08-21 | Condition engine + one visibility predicate + recompute; Tier-1 path selection lighting paths with reasons. **Parts-shelf decision #1: salvage the engine or rebuild it.** | FR-4, FR-5, FR-9 · NFR-2, NFR-3, NFR-4 | §19 engine + routing criteria pass; changing an upstream answer re-derives everything. |
| **S3.5** | Destinations · AI Use Case Record | The assessment assembles a record for a downstream system of record. When intake records AI, offer registration; assemble the ServiceNow AI Use Case Record from answers already given; show it field by field with provenance and gaps; download the payload. **The write to ServiceNow is deliberately not built.** | FR-26, FR-27 · NFR-20 | Answering "Yes" to AI offers registration with a real count of fields already answered; the assembled record shows source per field and names what is still missing; the payload downloads; nothing claims to have been sent. |
| **S4** | Tier 2 · DONE 2026-08-21 | Severity questions with rubric anchors as options; derived severities; all four conditional kinds. | FR-6, FR-7, FR-8 · NFR-10 | §19 criteria; a Medium/High answer reveals its conditionals; a derived band routes. |
| **S4.5** | Reference data & unlisted answers | Versioned reference lists (business units, vendors) and people-backed owner fields; pickers on the fields the owner named; "something else" with free text; off-list values recorded and ratifiable; provenance that survives acceptance; the derived fourth-party path; the sign-in picker. | FR-29, FR-30, FR-31, FR-32, FR-33 · NFR-22 | Choosing from the list and typing something not on it both work; the typed one appears in no other assessment until ratified; renaming a list entry does not change what a past answer says; accepting a worked-out value leaves its source question on screen. |
| **S5** | Ledger | Control accumulation compiled to engine conditions; live ledger (paths · severities · objectives, each with reasons). | FR-10, FR-11 | §19 accumulation criteria; ledger updates on every answer with no page reload. |
| **S6** | Tier 3 | Objective self-assessment (Yes/Partial/No/N-A, required notes); children on Yes; notes/questions attachable anywhere. | FR-12, FR-13, FR-21 | §19 criteria; suppressed children invisible; N-A without justification impossible. |
| **S7** | Attachments | Upload for prior assessments and supporting documents, stored outside the app filesystem, classified, retained under a stated policy. **Blocked on §3.4** — the retention posture is written before the first byte is stored. | FR-34 | A document uploads, is retrievable, carries a classification, and the retention rule is written down first. |
| **S7** | Submit & findings | Submission with named-gaps confirmation; findings synthesis (No → gap, Partial → enhancement). | FR-14, FR-15 | Submit produces exactly the findings the T3 answers imply, carrying their notes. |
| **S8** | Review & attest | Reviewer queue, attest/correct/N-A with keyboard loop, server-side authority, four dispositions with four-eyes + expiry reopen. **Parts-shelf decision #2.** | FR-16, FR-17, FR-18 · NFR-10, NFR-12 | §19 attestation + findings criteria; forged client attestation fails. |
| **S9** | Package & export | Packaging gates; insert-only replayable export with explicit N-A strings. | FR-19, FR-20 | §19 packaging criteria; full-journey E2E create → export green. |
| **S10** | Harden & hand off | Both UAT rounds; perf budgets; dead-code gate on; HANDOFF.md; generated instrument reference. | NFR-4, NFR-6, NFR-7 (final) | Owner sign-off = Phase-1 acceptance (§16). |

Estimated ~6–7 focused days end to end; S1 is hours. A timing slip cuts between slices, never through one.

**Every slice is additionally bracketed by the review protocol (§21): a pre-flight before it starts and a slice review when its done-when holds. A slice whose review is still open is not done, and the next slice does not begin.**

## 20. Requirements register

The register and the slices are **synced by construction**: every Phase-1 requirement names its owning slice; every slice's done-when includes its owned requirements passing. A requirement without an owner, or an owner without a done-when, is a spec defect to fix before building. Phase-2/3 requirements are added to this register when their phase is authorized — never before.

### 20.1 Functional requirements (Phase 1)

| ID | Requirement | Detail | Slice |
|---|---|---|---|
| FR-1 | Structured intake in four ordered sections with conditional fields (hasValue · equalsAny · includesAny) | §3.1 | S1 |
| FR-2 | Projects persist and resume; intake is the project's identity record, and a partial submission never disturbs an answer outside its own scope | §3.1, G-28 | S1 |
| FR-3 | One gate per category; No closes the category entirely | §3.1 | S2 |
| FR-4 | Tier-1 selections activate paths; union semantics with reasons retained | §3.2.4 | S3 |
| FR-5 | Any visible question can explain itself in one English sentence | §6.3 | S3 |
| FR-6 | Tier-2 severity presents Low/Medium/High rubric anchors as the answer options | §3.1 | S4 |
| FR-7 | Severity derivable from fact answers via declared mappings | §3.2.5 | S4 |
| FR-8 | Conditionals: severity-fired, always-fired, cross-tier, nested | §3.1 | S4 |
| FR-9 | Answer changes re-derive all routing; history never deleted | §3.2.7 | S3 |
| FR-10 | Control objectives accumulate from thresholds and option-adds, with reasons | §3.3 | S5 |
| FR-11 | Live ledger: active paths, severities, accumulated objectives, always visible | §9 | S5 |
| FR-12 | Tier-3 self-assessment: Yes/Partial/No/N-A; notes required on Partial/No/N-A | §3.4 | S6 |
| FR-13 | Child questions fire only on parent Yes, subject to cross-tier conditions | §3.4 | S6 |
| FR-14 | Submission allowed with gaps only via explicit, named-gaps confirmation | §4.1 | S7 |
| FR-15 | Findings synthesized at submit: No → control gap; Partial → enhancement | §4.3 | S7 |
| FR-16 | Reviewer queue + attestation: approve / correct-and-re-attest / N-A-with-reason | §4.2 | S8 |
| FR-17 | Attestation authority enforced server-side by domain reviewer-group | §2 | S8 |
| FR-18 | Four finding dispositions; four-eyes acceptance; expiry reopens | §4.3 | S8 |
| FR-19 | Packaging blocked until all visible attested, zero open findings | §4.5 | S9 |
| FR-20 | Insert-only replayable export; N-A exported as explicit reason strings | §4.5 | S9 |
| FR-21 | Notes/questions attachable at any point; travel to the reviewer | §9 | S6 |
| FR-22 | An intake answer that duplicates a Tier-1 gate pre-answers that gate — visibly, with its reason, and changeable | §3.1 | S2 |
| FR-23 | Where a requester may genuinely lack visibility, "I'm not sure" is a first-class answer that routes to a reviewer rather than blocking | §3.2.1 | S1 |

### 20.2 Non-functional requirements (Phase 1)

| ID | Requirement | Detail | Enforced |
|---|---|---|---|
| NFR-1 | Evidence and export records are insert-only (schema CHECKs, not convention) | §5.1 | S2, S9 |
| NFR-2 | One visibility predicate consumed by every surface | §5.4 | S3 onward |
| NFR-3 | Positive evidence only; severity fails closed | §3.2 | S3 |
| NFR-4 | Full-instrument recompute in single-digit milliseconds | §10 | S3, re-proven S10 |
| NFR-5 | AWS-ready by construction: the five §6.4 obligations | §6.4, G-7 | S1 onward, review-enforced |
| NFR-6 | File budgets (≤400 new / ≤800 hard) + dead-code gate — measured over stylesheets as well as modules | §11 | Every slice; gate on from S10 |
| NFR-7 | Every slice gated: tests green before advance; E2E on rendered DOM only | §0, §10 | Every slice |
| NFR-14 | Pure logic separated from executors; no framework/driver/env imports in logic modules | §26.1 | Every slice |
| NFR-15 | All persistence behind the store interface; no state in process memory or local files | §26.2 | Every slice |
| NFR-16 | Configuration read only via the config module, validated at the boundary | §26.3 | Every slice |
| NFR-17 | Tests in three separately-runnable tiers, each CI-container-ready | §26.4 | Every slice |
| FR-25 | Three roles (requester · Risk Assessor · administrator), each differing in what it *permits* — including which assessments it can see and whether it may start one — enforced server-side, with a persona switcher that demonstrates them | §2, G-29 | S2.5 |
| FR-24 | An administration page lists every agent, when it runs, what it can see, and its full instructions — generated from the codebase, never hand-written | §22.3, G-25 | S2 |
| NFR-19 | Every answer **and every intake change** records who made it and what it replaced; authority is decided by role in one pure module, never in a screen | §2, §5.5, G-30 | S2.5 onward |
| NFR-18 | Every finished slice carries a committed UAT record meeting the six §10 criteria | §10, G-24 | Every slice |
| NFR-13 | Errors handled to the §25 standard: typed results, no internals on screen, referenced logs, input preserved, error paths tested | §25 | Every slice |
| NFR-8 | Instrument entirely as versioned seed data; zero hardcoded content | §6.2 | S2 onward |
| NFR-9 | No internal identifiers in any user-facing text | §9 | S1 onward |
| NFR-10 | State never conveyed by color alone; reviewer flow fully keyboard-operable | §9 | S4, S8 |
| FR-26 | When intake records AI, the requester is offered registration as an AI Use Case Record, with a real count of how many of its fields the assessment has already answered | §27, G-33 | S3.5 |
| FR-27 | An assembled destination record shows every field with where its value came from, what was derived, and what is still missing; the payload is downloadable; an unbuilt destination write says so plainly and is never mimicked | §27, §24.8, G-33 | S3.5 |
| NFR-20 | Destination field maps are versioned data, never code — a new destination is a map file, and a changed field list is a new map version | §27, §5 | S3.5 |
| FR-28 | A field marked required is enforced: the forward control refuses and names what is missing, the answers already given are kept, and the next stage is refused server-side — not only by the form | §3.1, G-37 | S1 (repaired 2026-08-21) |
| NFR-21 | Every slice is verified against its negative paths — empty submit, skipped step, URL bypass, stale re-submit — whether or not a requirement names them | §10, G-37 | Every slice |
| FR-29 | A field whose answer is a name held in a real system — a person, a business unit, a vendor — is answered by choosing from a reference list, not typed free-hand | §5, G-46 | S4.5 |
| FR-30 | Every reference-backed field accepts a value that is not on the list; the person is never blocked, and the unlisted value is stored distinguishably from a listed one | §7, G-47 | S4.5 |
| FR-31 | A multi-select that can be incomplete offers an explicit "something else" option revealing a required free-text field; the text is stored as its own value, never as an option id | §24.10, G-47 | S4.5 |
| FR-32 | A value supplied off-list is recorded against that assessment immediately and enters the shared list only when an admin ratifies it, with actor and timestamp | §5.7, G-48 | S4.5 |
| FR-33 | A value the platform worked out names the question it came from and keeps saying so after the person accepts it | §24.5, G-39a, G-49 | S4.5 |
| FR-34 | Prior assessments and supporting documents attach to an assessment, are stored outside the application filesystem, and carry a classification | §26.2, §3.4 | S7 |
| NFR-22 | Reference lists are versioned data, immutable once activated; every answer pins the list version and stores the label as displayed when chosen | §5.6, G-46 | S4.5 onward |
| NFR-11 | Instrument versions immutable once activated — neither editable nor deletable; answers pin their version | §5.7 | S2 |
| NFR-12 | Agent/session/model access only through the three seams | §6.1 | S8 review; seam tests |

## 18. Now / design-now / later — the sophistication triage

The product vision includes machinery that must **not** inflate Phase 1's surface. Every sophisticated element is triaged; the implementer honors this table over any enthusiasm elsewhere in the document.

| Element | Triage | Phase-1 obligation |
|---|---|---|
| Never-guess, insert-only records, one predicate/matcher, four-eyes, N-A-with-reason | **MUST EXIST NOW** | Schema CHECKs + tests from layer 2. These are cheap at birth and ruinous to retrofit. |
| Recompute-don't-remember routing | **MUST EXIST NOW** | Engine semantics from layer 4. |
| Instrument-as-data + coherence gate | **MUST EXIST NOW** | Layers 3 and 11. |
| The two seams (agent, session) + model-access confinement | **MUST BE DESIGNED NOW** | Interfaces exist and are the only path (layer 12); nothing behind them is built. |
| Agentic contract (§7) | **MUST BE DESIGNED NOW** | The contract constrains today's design (e.g., option labels quotable); no drafting, chat, or eval activation. |
| Pre-deploy verification | **MUST BE DESIGNED NOW** | A stage field on questions; no verification flow. |
| Parity/differential harness | **NOW iff transcribing** from the reference design (it is the transcription's safety net); otherwise LATER. |
| Property-based testing beyond the harness | **BUILD LATER** | Unit + differential coverage suffices for Phase 1. |
| Constraint-relaxation deny-list | **BUILD LATER** | Meaningful only when prompt text exists (Phase 2). |
| Independent auditor automation | **BUILD LATER** | Subagent definitions may exist (§15); scheduled audit runs are Phase-2 discipline. |
| AWS readiness (§6.4's five obligations) | **MUST EXIST NOW** | Containers, env-only config, RDS-compatible persistence, dependency rule, OTel — enforced in review from layer 1. |
| AWS cloud execution + AgentCore substrate | **BUILD LATER** | The target is settled (G-7); the migration itself is Phase-3 work. No cloud infrastructure in Phase 1. |
| Scoring machinery | **BUILD LATER** | Open question §14.1; nothing computed or displayed in Phase 1. |

## 19. Subsystem acceptance criteria

Executable acceptance per major subsystem — each becomes a named test before its layer is called done.

**Condition engine (layer 4)**
- Given an unanswered question, `equals` returns false; so do `not_equals` and `excludes` (positive evidence only).
- Given unknown severity, `severity_at_least(Medium)` returns false.
- A scalar answer `"high"` satisfies `any_of ["medium","high"]` (set membership).
- Any condition renders to exactly one English sentence naming question text and human option labels, never identifiers.
- A condition requiring `includes X` and `excludes X` is flagged by the contradiction lint.

**Routing / visibility (layer 5)**
- Given two satisfied activation rules for one path, the path is active with **both** reasons retained.
- Gate = No hides every question in the category regardless of other answers.
- Changing an upstream answer removes downstream activation and visibility **without deleting historical answers**.
- Queue counts, wizard progress, and the packaging gate all agree with the predicate on the same project state.

**Control accumulation (layer 6)**
- A severity of Medium accumulates objectives with `min: Low` and `min: Medium`, not `min: High`.
- A capture-marked answer never changes the accumulated set.
- Every accumulated objective carries at least one human-readable reason.

**Attestation (layer 8)**
- Attesting requires reviewer-group membership for the question's domain, enforced server-side (a forged client request fails).
- An attested answer cannot be N-A'd; it can only be corrected-and-re-attested.
- Attesting a shared answer records the confirmed reach.

**Findings (layer 9)**
- Submitting with a Tier-3 "No" creates exactly one control-gap finding carrying the objective's note.
- Risk acceptance by the resolver themselves is rejected (four-eyes).
- An acceptance past its expiry reopens the finding and re-blocks packaging.

**Packaging / export (layer 10)**
- Packaging with any visible unattested question fails, naming questions by text.
- The export contains an explicit "N-A — reason" string for every N-A attestation, never a blank.
- Re-export creates a new record; the prior export is byte-identical after.

## 21. Slice review protocol (the refinement gate)

Every slice is bracketed by two conversations; building without them is a Build-Rule violation (§0.11), not a shortcut. **Procedure: `/slice-review`.**

**Pre-flight — before the first line.** The implementer restates the slice's owned requirements in its own words, names the design decisions it intends to make, and lists every ambiguity or assumption it would otherwise resolve silently. The owner confirms, corrects, or defers; unresolved ambiguity blocks the slice (§0.8).

**Slice review — when the done-when holds.** One message containing, at minimum:
1. What changed — files, requirement IDs, tests, gates with real numbers.
2. **Self-critique — at least two items.** "Nothing" is not an acceptable answer.
3. What was deliberately not done, and where it is recorded.
4. Open questions, each with a recommendation.
5. A demoable artifact — never a claim without evidence.
6. The agentic opportunity registered for Phase 2 (§22).
7. UI evidence against §23, and any §24 deferrals.
8. The slice-verifier's report (§15).

Refinements are applied and re-gated **before the next slice starts**; a refinement that changes the instrument or a requirement updates §20 and §13 first.

**Why it exists:** the two failure modes of AI-assisted delivery are an implementer that agrees too readily and an owner reviewing only the finished pile. This forces critical thinking at both ends, at the smallest reviewable unit of work.

## 22. Agentic opportunity planning

Phase 1 builds no agent (§16). It nonetheless **designs** for one, because the cheapest moment to notice that a decision forecloses an agentic feature is while making it.

**The rule:** every slice registers, in its review, what an agent would do for the work that slice just made possible — the job, the evidence it would read, the guardrails it needs, and the human decision it must never take. Registered features enter the Phase-2 backlog (§22.1) and are built only when Phase 2 is authorized. A slice may not ship a design that makes its registered feature impossible (e.g., discarding the raw text an agent would need to read).

**§22.2 The evidence line (binding on every registered feature).** An agent may use world knowledge — technology profiles, regulatory context, research — to *inform the conversation*: to explain, to suggest, to ask a better question. World knowledge may **never become an answer's evidence**. "The internet says Snowflake works this way" is a third-party assertion about a product, not a fact about this implementation. The correct pattern is: the agent proposes using world knowledge, and **the person's confirmation is the evidence** — their words, quotable, attributable. This preserves the provenance chain that the entire platform rests on.

**§22.3 The platform's own AI risk.** Any external enrichment sends project content outside the boundary, and this product asks people to classify that content as Confidential or Restricted. Before any externally-grounded feature ships: a policy for what may leave (recommended default — the technology name, never the description), a classification threshold above which nothing leaves, and the platform's own assessment of the flow. The risk platform passes its own assessment first.

**§22.4 Precedent rules (binding on any feature that learns from other assessments).** Portfolio memory is powerful and has four specific failure modes; each has a rule.

1. **No precedent laundering.** Precedent may be built only from **attested** answers — human-signed, per §4.2. Drafts, pre-fills, and unconfirmed values are invisible to it. Without this, one early mistake copied forward becomes institutional truth, and the platform industrialises an error instead of a control.
2. **Aggregate, never disclose.** Precedent surfaces *patterns* ("11 of 13 comparable assessments answered Yes"), never another team's content, project name, or owner. Below a minimum comparable count, show nothing at all — a "precedent" drawn from one assessment is gossip, not evidence, and it also leaks who.
3. **No anchoring.** A precedent is never pre-selected, never the default, and never phrased as a recommendation the person must argue with. It is context beside a choice they still make. Where anchoring risk is highest — binary gates — prefer showing precedent *after* an answer as a check rather than before it as a prompt.
4. **Age is part of the fact.** Every precedent carries how many, and how recently. A pattern from assessments two years old describes a system that may no longer exist; recency is shown, never silently weighted away.

**§22.5 Policy authority (the one legitimate exception to §22.2).** An organisation's own policies and standards are **not** world knowledge — they are authoritative internal artifacts, and they may legitimately ground *definitions and requirements*. The line moves, but it does not disappear:

- A policy may define **what a term means** and **what is required**. It may **never assert a fact about this project** — only the requester can do that.
- Therefore the chain is always three parts: the **policy** supplies the definition, the **requester** supplies the facts, and the **person's confirmation** is the answer's evidence.
- Policy text is quoted **verbatim or not at all**, with policy, clause, and version named. A paraphrased policy is not a policy.
- Policies are **versioned like the instrument** (§5.7): an answer cites the version in force when it was given, and a later revision never silently rewrites a historical assessment — it raises a finding against the current one instead.

**Standing guardrails for every registered feature** — inherited from §7 and non-negotiable at design time:
- It reads what the requester provided; it never invents facts.
- It proposes; a human accepts. Nothing it produces is final on its own.
- Any rewrite is **reorganization of the requester's own words**, never addition. Content it cannot ground in what they wrote is surfaced as a question, not inserted.
- It speaks plain language: no internal identifiers, no scores presented as verdicts.
- Its judgments are recorded with their basis so a reviewer can see what was machine-suggested versus human-confirmed.

### 22.1 Phase-2 feature register

| From | Feature | What it does | Guardrails beyond the standing set |
|---|---|---|---|
| S1 Intake | **Intake quality assistant** | Grades the description against a published rubric (specificity, scope, data handling, dependencies, outcomes); flags contradictions *within* the intake (e.g. "no personal data" versus an employee-PI selection, or a vendor named while the third-party answer says none); offers a rewrite that reorganizes and tightens the requester's own words. | The rubric is data and visible to the requester — no black-box grade. A low grade never blocks submission; it routes to a reviewer with the specifics. Contradictions are *shown*, never auto-resolved. The rewrite is opt-in, diffed against the original, and rejectable; the original text is always retained. |
| S1–S2 | **Assessment companion (conversational)** | An always-available assistant a person can ask anything of while assessing: "based on my description, what do you think?", "what does this question mean?", "can you word this another way?". Proposes gate answers with its reasoning, explains routing, and drafts nothing without a human click. | World knowledge may inform the *conversation*, never the *evidence* (see §22.2). Every proposal is shown with what it was derived from. It never answers a question on the person's behalf — the click is theirs, and the record says so (source `person`). |
| S1–S2 | **Consistency & contradiction chaining** | Continuously reads everything captured so far and surfaces disagreements — across intake prose, gate answers, and later tiers. Two passes: a **deterministic** pass over structured answers (cheap, exact, testable — "no personal data" versus an employee-PI selection) and a **semantic** pass over prose (an LLM catching "the description says customer-facing but the audience answer says internal-only"). | Contradictions are *shown*, never auto-resolved. The deterministic pass must stand alone: if the model is unavailable, consistency checking still works. Every flag names both sides and quotes them. |
| S2 | **Technology profile library** | Named technologies and vendors ("Snowflake", "Databricks", a SaaS product) resolve to ratified profiles — what the technology is, and which risk areas it typically implies. The companion uses profiles to suggest gate answers and explain them. | Profiles are **seeded from research and ratified by a human**, never fetched live per turn: consistency across assessments matters more than freshness, and a reviewer must be able to see the profile that drove a suggestion and when it was ratified. Degrades gracefully — no network, no external dependency at request time. |
| S2+ | **Precedent suggestion (portfolio memory)** | While answering, the person can see how comparable assessments answered the same question — same vendor, same technology, same activity shape — and use that as a starting point. Turns 200 completed assessments from a filing cabinet into institutional memory a first-timer inherits. | Precedent draws **only on attested answers** (§4.2) — never on drafts, never on unattested pre-fills, so an unreviewed mistake cannot become institutional truth. Always aggregate, never verbatim content from another team's assessment. Never pre-selected: precedent is shown as *how others answered*, and the click stays the person's (§22.2). Always carries counts and recency. |
| S2+ | **Application profiles (our own systems)** | A system this organisation has assessed before carries a profile built from its own attested history — what it is, where it runs, what it touches. Reassessing it starts from what we already know rather than from nothing. | Profile facts are attributed to the assessment and attestation that established them, with dates. A profile is a **starting point that must be re-confirmed**, never an inherited answer: systems change, and last year's truth is this year's finding. |
| S2+ | **Divergence signal (reviewer-side)** | When an assessment answers materially differently from comparable ones, the reviewer's queue says so. "Answered No to third-party where 14 of 15 comparable assessments answered Yes." | A divergence is a **triage signal, not a verdict** — being different is often correct, and the platform must never pressure a requester toward the majority. Shown to reviewers, not as a nag to the person answering. Requires the same aggregation floor as precedent. |
| S3 | **Instrument contradiction lint (semantic half)** | Reads the authored instrument as a whole and reports rules that cannot both be satisfied, questions that mean the same thing in different words, and paths no realistic answer set can reach. The *structural* half — unsatisfiable conditions, cycles, chained derivations, unreachable options — is deterministic and belongs in the validator, not here. | Reports to a human as findings; never edits the instrument (§8 — changing what is asked is a governance event). Every finding names the two rules or questions it compares, verbatim, so the reader judges the comparison rather than the verdict. |
| S3 | **Plain-language term help on demand** | Where a question uses a term a business user may not know — "RAG", "privileged access", "fourth party" — the person can ask what it means and get an answer grounded in the organisation's own policy or the cited standard, in context, without leaving the question. | Definitions come from a named, versioned source (§22.5) and are quoted, not paraphrased; a term with no grounded definition says so rather than inventing one. Never rewrites the question itself. |
| S3.5+ | **Destination record drafting** | The agent drafts the inventory narrative from what the requester already wrote — purpose, description, what the AI does — and maps it onto the destination's fields, flagging what the destination requires that the assessment never asked (model provider, training data source, human oversight). | Every drafted field carries the assessment answer it came from, verbatim; a field with no source is left empty and named as missing, never inferred (§22.2). |
| S3.5+ | **Reverse pre-fill from a system of record** | Where a use-case record already exists for this application, the assessment pre-fills from it — the "asked twice" complaint answered from the other end. | Pre-filled values are visibly sourced to the external record with its id and date, unconfirmed until a person accepts them (FR-22), and never silently overwrite an answer a person gave. |
| S3+ | **Policy-grounded definitions** | Where a person must choose against a standard — data classification, criticality, retention — the governing policy's own words appear beside the choice, quoted verbatim with a link to the clause. Turns "Confidential" from a bare word into a decision someone can actually make. | Quotes are **verbatim** or they do not appear. Every quote names its policy, clause, and version. A policy may define a term; it may never assert a fact about this project (§22.5). |
| S3+ | **Policy-grounded suggestions** | The agent proposes an answer citing two things: the clause that defines the standard, and the requester's own words that meet it. "This looks like Confidential — §3.2 defines it as X, and you told us you hold employee wage bands." | The person confirms; their confirmation is the answer's evidence (§22.2). The policy grounds the *definition*, never the *fact*. A suggestion is never pre-selected. |
| S3+ | **Compliance checking** | An attested answer that contradicts a policy requirement raises a finding with both quotes side by side — the requirement and the answer — resolvable only through the four governed dispositions (§4.3). | Findings are raised against **attested** answers, never drafts. The finding cites the policy version in force when the answer was attested; a later policy revision does not retroactively rewrite history. |
| S3+ | **Instrument-to-obligation traceability** | Every question traces to the standard or obligation that requires it — so "why are you asking me this?" is answered with an authority, not only a routing rule. Read the other way it produces two coverage reports: obligations with **no question** (a gap in the instrument) and questions citing **no obligation** (a candidate for deletion). | Traceability edges are **proposed by the agent and ratified by a human** before they are shown as authority. An unratified mapping may inform authoring; it may never be quoted to a requester as the reason they are being asked. |
## 23. UI/UX standard — demo-ready

Every slice ships an interface that could be shown to leadership without apology. **Procedure, patterns, and checks: `/ui-craft`.**

A surface is demo-ready when: (1) colour, type, spacing, radius and motion come from named tokens, never raw values; (2) **every state is designed** — empty, loading, success, failure, disabled, overflow; (3) hierarchy reads at a glance, with one unmistakable primary action; (4) motion is explanatory and honours reduced-motion; (5) it is accessible by construction — accessible name on every control, full keyboard operation, visible focus, sufficient contrast, and state never by colour alone; (6) the words are designed too — plain language, no internal identifiers, help where a business user would hesitate; (7) it is responsive to a laptop viewport, with wide content scrolling in its own container; (8) a screenshot of each surface accompanies the slice review.

**The remaining 10%** is cross-slice work — global navigation, the progress model, final brand treatment — deferred by name in the review, never discovered later. **Taste is the owner's call:** the standard sets the floor, the owner's judgment sets the bar, and direction raised in a review is applied before the next slice starts.

## 24. Experience principles (how the product treats a person)

§23 sets the visual floor; these set the behavioural one. Each was written after a real defect in this build. **The reasoning, origins, and audit procedure: `/ux-audit`.** The mechanically checkable ones are enforced in `test/unit/experience.test.ts`.

1. **Never re-ask what someone just told you they don't know.** Uncertainty is absorbed by the system and routed to a human — never returned as another question. The correct response to "I'm not sure" is a reassurance naming who will find out and confirming nothing is blocked.
2. **One decision per screen; pace the journey.** Prefer stepped, carded progression over long scrolls.
3. **A control responds to the action a person takes.** Choosing from a list, toggling a switch, or picking an option *is* the action — a control that needs a second confirming press reads as broken, and a person will conclude the feature does not work before they find the extra button. Confirmation is for the irreversible, not the routine.
4. **Every wait has a state; every failure has a cause and a next step.** No silent seconds; failure is a designed state, not the absence of one.
5. **Reveal on evidence, and say why.** Conditional content always carries a plain-language reason.
6. **Never make a person repeat themselves.** An answer given once is reused where it applies, shown with its source, and remains changeable (FR-22).
7. **The system absorbs complexity; the person answers in their own words.** If a business user would need a glossary, the question is wrong — not the user.
8. **Show the whole journey honestly, including what isn't built** — future stages read as upcoming, never as broken.
9. **Progress is measured in what's left for the person**, never in internal counts.
10. **Every question tells a person what to do when it doesn't apply to them.** An optional field with no guidance leaves someone staring at an empty box deciding whether blank means "none" or "I forgot" — and the reviewer inherits that ambiguity. Say it: "leave blank if everything is in-house". Enforced in `test/unit/intake.test.ts`.
11. **Every question a person answers carries helper text that teaches**, not text that restates the label. Only a self-evident label may go without. Enforced mechanically.

## 25. Error handling standard

Failure is a designed state (§24.3); this is how it is built. Applies to every action, route, and background job. **Pattern, message-writing guide, and tests: `/error-handling`.**

1. **Expected failures are values, not exceptions** — actions return a typed result the caller must branch on, so a missing `catch` cannot swallow a failure. Unexpected failures are caught at the boundary; transport failure is its own case.
2. **The user gets a sentence; the log gets the truth.** No driver text, SQL, constraint name, or stack trace reaches a screen. The server logs the real error with a short reference, and the same reference is shown so support starts with a fact.
3. **Every user-facing error answers three questions in order** — what happened, is my work safe, what do I do now. "Something went wrong" answers none and is not acceptable.
4. **Retryable is distinguished from permanent**, and the person's input is never lost or cleared to reach a clean state.
5. **Errors are announced, not merely displayed** (live region, no stranded focus), and **every error path has a test** proving the message is safe, the reference present, and the input preserved.

## 26. Cloud-native construction rules (workspace law)

AWS is settled (§6.4, G-7). This section makes it a **construction** rule rather than a deployment plan: every feature, utility, and test is written so it can move to a serverless target without redesign. It binds all code, starting now.

**26.1 Pure logic, separate executors.** Business rules live in modules that import no framework, no database driver, and no environment. The thing that *executes* — a server action, a route handler, later a Lambda handler or AgentCore task — reads the request, calls the pure function, calls the store, and returns. Any pure module must be liftable into a standalone function with no edit to its body. Web-specific shapes (`FormData`, `Request`) are converted at the boundary, never passed inward.

**26.2 State is external; persistence is behind one interface.** No feature state lives in process memory, on the local filesystem, or in a hardcoded path. All reads and writes go through the store interface; no route, action, or component touches the driver. *Honest limit:* this makes a store swap **contained**, not free — a different query model still needs a real implementation. What is guaranteed is that only the store module and its wiring change.

**The engine choice is open and under standing assessment (§14.6).** Postgres is the Phase-1 implementation, not a settled destination. Two obligations follow: (a) no slice may adopt a store-specific feature without flagging it in its review as a constraint on the choice; (b) the implementer reports on the choice at the checkpoints in §14.6 with evidence from the data model as it actually exists, not from preference.

**26.3 Configuration only through the environment, read in one place.** No hardcoded secrets, hosts, or connection strings. Env is read in the config module alone, validated at the boundary, and fails with a message naming both the local fix and the AWS source (Secrets Manager / Parameter Store).

**26.4 Lego-block tests.** Three tiers, separately runnable, each a candidate CI step: **unit** (pure logic, mocks everything external, needs nothing but Node), **integration** (real SQL against in-process Postgres, no daemon or local setup), **e2e** (the running app). Tests are grouped by feature domain, never a single tangled runner, and every tier must run inside an isolated CI container with no local terminal setup.

**26.5 Migrations are a task, not a request path.** Schema changes are plain SQL applied by a standalone runner that can execute as a one-off ECS task or CodeBuild step.

**26.6 Serverless-shaped defaults.** Connection pools stay small because serverless scales instances rather than connections (RDS Proxy fronts the database on AWS); containers build from the repo root; nothing assumes a warm process, local disk, or a long-lived server.

**26.7 The migration guide is a deliverable.** Before production, a step-by-step guide is written plainly enough to be followed without prior AWS knowledge, covering: infrastructure and IAM; how the product's agentic layer (§7) becomes AgentCore runtimes, wired through AgentCore Gateway using **OpenAPI** schemas (the open REST-description standard, formerly Swagger — unrelated to OpenAI, which this project does not use); how features map to Lambda or container tasks; and a checklist for running all three test tiers in the cloud to prove parity with local. **Terminology note:** the `.claude/agents/*.md` subagents are *development-time* tooling and do not migrate; the runtime agents are the Phase-2 product features in §7 and §22.1.

---

*Accepted 2026-08-20. The governance log is active at G-1 through G-8; the prior platform's spec is retired and its repository is the parts shelf per G-8.*

## 27. Destinations — the assessment as a source for systems of record

The loudest complaint about assessment programmes is being asked the same
thing by different teams. The answer is not a better form; it is for the
assessment to become the **source** other systems draw from. A destination is
a downstream system of record needing facts this assessment already holds.
**First destination:** the ServiceNow **AI Use Case Record**, offered when intake records that an activity uses AI.

1. **A destination is a versioned map, not code** (NFR-20). One file per
   destination: target field, label, whether it is required, and where the
   value comes from — an answer, a derivation, or nothing. When the real
   field list arrives it is a file edit. Unconfirmed field names are marked
   provisional **on screen**: a demo implying a live mapping it does not have
   is the kind of claim this specification exists to prevent.
2. **The offer is opt-in and never blocks.** When AI is recorded, the
   requester is offered registration with a real, computed count ("24 of 29
   fields are already answered"). One click, changeable later, stored as an
   ordinary answer — insert-only, attributed, no new machinery.
3. **The assembled record is shown in three parts** (FR-27): already
   answered, each with the question its value came from; derived; and still
   needed. The third is the honest part and is never hidden.
4. **The write is out of scope and says so** (§12). The payload is real and
   downloadable; the send is labelled not connected, and nothing mimics a
   successful one. A connector, when built, goes behind the same interface as
   everything else external (§26.2) and does not change the map.
5. **Destinations are a pattern, not a feature.** Vendor records, privacy and
   security reviews have the same shape; the second one must be a map file
   plus wiring. If it needs new mechanism, this section was built wrong.
