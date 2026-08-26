---
name: repository-audit
description: Full engineering audit of an existing codebase. Checks the code against engineering best practices, audits the spec for bloat and traces every functional requirement to code and tests, runs the app and test suite to prove each requirement is operational, finds dead code with tooling and confirms it by hand, validates every SKILL.md and agent instruction file (CLAUDE.md, AGENTS.md) in the repository, and evaluates the overall repository structure. Produces an evidence-backed report with severity-rated findings, a requirements traceability matrix, and a prioritized remediation plan. Use whenever the user asks to review, audit, evaluate, clean up, tighten, or sanity check a repository, a spec, code quality, dead code, or skills files — even if they mention only one of those parts, or just say "look over my codebase".
---

# Repository Audit

Implements SPEC §11 (the clean-code charter), and audits against §10 (quality
bars), §19 (subsystem acceptance criteria), §20 (the requirements register)
and §21 (the slice review protocol). `verify` is the gate chain for one
change; this is the standing audit of the whole repository, and it is the
only procedure allowed to say the gates themselves are wrong.

Audit an existing codebase end to end and produce a report the owner can act
on. The audit answers six questions:

1. Does the code follow engineering best practices?
2. Is the specification lean, and does every functional requirement trace to
   code that actually runs?
3. Is there dead code?
4. Are the skills files (`SKILL.md`) and agent instruction files written
   correctly?
5. Is the repository structured well?
6. What should be fixed first?

## The standard of evidence

The person receiving this report will check it. **A finding that turns out to
be a framework convention, a test that was never actually run, or a "dead"
function that is loaded dynamically costs more credibility than ten correct
findings earn.** So the audit runs on hard evidence.

- **Verify the baseline before flagging.** Ask "is this actually outside
  normal parameters for this framework and language, and can I prove it?" A
  file in a Next.js `app/` directory with no imports is a route, not dead
  code. A `.env.example` full of placeholder values is expected. Look up the
  convention before calling something wrong.
- **Execute, do not infer.** "Verified working" means you ran it in this
  session and it passed. Reading code and concluding it probably works is a
  different status, and the report says so.
- **Separate facts from inferences and label them.** Facts cite a file and
  line, a command and its output, or a document section. Inferences say
  "likely" and give the reasoning.
- **Cite locations.** Every finding names the file (and line where possible)
  so it can be checked in seconds.
- **Never fabricate results.** If a tool could not be installed, a test could
  not run, or credentials were missing, record that under "Not verified"
  instead of guessing.

## Workflow

Run the phases in order; later phases depend on the inventory and the
requirement list from earlier ones. **Keep a running scratch file at
`audit/working-notes.md`** as you go so nothing is lost between phases.

1. Inventory the repository
2. Audit the spec and extract requirements
3. Verify requirements operationally
4. Review engineering practices
5. Detect dead code
6. Validate skills and agent instruction files
7. Evaluate repository structure
8. Write the report

## Phase 1 — Inventory

Run the bundled inventory script first; it is faster and more complete than
browsing:

```bash
python3 scripts/repo_inventory.py /path/to/repo --json audit/inventory.json
```

It reports languages and line counts, manifests and lockfiles, spec
candidates, skills files, tests and CI configuration, container and
infrastructure files, environment variables declared versus used, TODO and
FIXME density, commented-out code hotspots, large files, build artifacts that
appear to be committed, and strings that look like secrets.

Then read, in this order: README, the spec, package manifests
(`package.json`, `pyproject.toml`, `go.mod`, and so on), CI configuration,
`Dockerfile` and compose files, `.env.example`, and any `CLAUDE.md`,
`AGENTS.md`, or `.cursorrules`.

Record the stack, the entry points, how the app is started, and how tests are
run. **If the repo has no README or no instructions for running it, that is
itself a finding.**

## Phase 2 — Spec audit

Locate the spec (typical names: `SPEC.md`, `docs/spec*`, `requirements*`,
`PRD*`, `docs/design*`). If several exist, note which one the repo treats as
the source of truth, audit that one, and list the others as consolidation
candidates.

Extract every functional requirement into a numbered list. **Keep the spec's
own IDs when it has them**; otherwise assign `FR-001`, `FR-002`, and so on in
document order and record the section each came from.

A functional requirement is a statement of observable behavior. Constraints
(stack, platform, compliance) are recorded separately as `CON-` items because
they are verified differently.

For each requirement capture: ID, text (verbatim), section, acceptance
criteria (as written, or "none stated"), and whether it is marked mandatory.

Then assess bloat with the rubric in `references/report-template.md` (section
"Spec bloat rubric"). **Every bloat call needs evidence:** quote the two
duplicate statements, name the missing acceptance criterion, show the
contradiction. Do not propose cutting a constraint the spec marks as mandated
(a required platform, a compliance rule); flag it as a question for the owner
instead.

**Deliverable:** the requirement list and the bloat table. Both go in the
report.

## Phase 3 — Verify requirements operationally

This is the phase that most often gets skipped, and it is the one the owner
cares most about. For each functional requirement:

1. **Trace to code.** Find the modules that implement it (search for domain
   terms, route names, schema fields). Record file paths.
2. **Trace to tests.** Find tests that exercise it. Record paths and test
   names.
3. **Execute.** Install dependencies, build, and run the test suite. Then
   exercise the requirement directly where tests do not cover it: start the
   app, hit the route with `curl`, run the script, call the function in an
   interactive session, run the seed and query the database. Save the command
   and its output.
4. **Assign a status** from the traceability statuses in
   `references/report-template.md` and record the evidence.

If execution is blocked (missing API keys, external service, no database), try
to remove the blocker cheaply: a local Postgres in Docker, a stub provider the
code already supports. If it still cannot run, the status is **"Implemented,
not verified here"** with the blocker named. **Never upgrade it to "Verified"
on the strength of reading the code.**

**Watch AI features especially.** A requirement like "the model prepopulates
answers with a source quote" is only verified when you have seen an actual
output containing the quote and checked it against the source. If the repo
ships evals (an `evals/` directory or an eval runner), run them and report the
numbers.

## Phase 4 — Engineering best practices

Work through `references/best-practices-checklist.md`. It is organized by
category — correctness, types, security, testing, configuration,
observability, dependencies, style, documentation, CI/CD, performance, and
practices specific to AI and LLM features — and for each item says what good
looks like and how to check it.

**Prefer tools over eyeballs.** Run the linter, the type checker, the
formatter in check mode, `npm audit` or `pip-audit`, and a secrets scanner if
one is available. Capture the output. When the repo has no linter or type
checking configured, say so and run a sensible default (for TypeScript:
`npx tsc --noEmit` and `npx eslint .`).

Rate each category on the four-point scale in the report template and back
each rating with the specific findings under it.

## Phase 5 — Dead code

Follow `references/dead-code-playbook.md`. It lists the tools per language
(TypeScript: `knip`, `ts-prune`, `depcheck`; Python: `vulture`, `ruff`,
`deptry`), the manual checks the tools miss (unused environment variables,
unused prompts and assets, orphan migrations, feature flags that are never on,
commented-out blocks), and the false-positive traps that make automated output
unreliable on its own.

**Every dead code candidate gets a second look before it lands in the
report:** search for dynamic imports and string-based lookups, check framework
routing conventions, check `package.json` `exports` and `bin`, check test
fixtures.

Report two lists: **confirmed dead** (you proved nothing references it) and
**suspected dead** (a tool flagged it and you could not fully confirm), with
the reason for each.

## Phase 6 — Skills and agent instruction files

Run the validator across the repo:

```bash
python3 scripts/validate_skills.py /path/to/repo
```

It finds every `SKILL.md`, checks the frontmatter against the published rules
(allowed keys, kebab-case name that matches its folder, description length, no
angle brackets), checks body length, confirms that `references/`, `scripts/`,
and `assets/` paths mentioned in the body exist, and compiles any Python
scripts.

Then apply the qualitative checks in `references/skill-file-standards.md`:
does the description say both **what** the skill does and **when** to use it,
is the body imperative and does it explain why, are scripts runnable, do two
skills overlap in scope, is anything stale.

Also review `CLAUDE.md`, `AGENTS.md`, and similar files against the actual
repository. **Instructions that reference commands, paths, or conventions that
no longer exist are a finding, because an agent will follow them.**

## Phase 7 — Repository structure

Evaluate the layout against the framework's conventions and against what the
spec implies. Cover:

- separation of concerns (does business logic live in the UI layer?)
- naming consistency
- configuration sprawl (how many config files, are they all needed)
- essential files present (README, LICENSE, `.gitignore`, `.env.example`, CI
  config, CONTRIBUTING if there are contributors)
- generated artifacts or build output committed
- oversized files
- lockfile present and consistent with the manifest
- tests colocated or separated consistently
- docs in one place

Sketch the current tree at two levels and a recommended tree if changes are
warranted.

## Phase 8 — Write the report

Use the exact template in `references/report-template.md`. Write to
`./audit/<YYYY-MM-DD>-repo-audit.md` unless the user names a location, and put
the findings table in `./audit/<YYYY-MM-DD>-findings.csv` so they can be
tracked.

**The executive summary comes first and must stand alone:** overall verdict,
the three to five things that matter most, the requirement verification tally
(verified, implemented but not verified, partial, missing), the dead code
count, and whether the skills files pass. An executive reader should be able
to stop after that section.

Every finding carries: ID, severity, category, location, evidence, why it
matters, recommended fix, estimated effort. **The remediation plan orders
fixes by severity and dependency, not by the order you found them.**

Close with **"Not verified in this audit"**, listing anything you could not
execute and why. Silence about gaps reads as coverage.

## Scope and pacing

**Large repositories:** audit breadth first (inventory, spec, structure), then
depth on the highest-risk areas — authentication, data handling, AI calls,
anything touching money or personal data — and state clearly which directories
got full review versus sampling. A partial audit that says what it covered
beats a full audit that quietly skipped things.

**Questions for the owner:** collect them as you go and ask them together at
the end unless one blocks the audit entirely. Typical questions: which spec is
canonical, whether a constraint is mandated, whether an unused module is
intentionally retained for a future phase.

**Keep deliverables company-agnostic** unless the user says otherwise:
describe destination systems and vendors generically in the report, and quote
internal names only where they appear in the code or spec being audited.
