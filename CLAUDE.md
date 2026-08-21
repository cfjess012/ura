# CLAUDE.md — Universal Risk Assessment

SPEC.md is the BRAIN: requirements (§20), slices (§17), acceptance criteria
(§19), build rules (§0), and the governance log (§13) all live there. Do not
build anything untraceable to a requirement ID. Follow the Build Rules (§0):
vertical slices in order, tests green before advancing, simplest consistent
implementation, stop on ambiguity.

## Slice status

- S1 Intake — DONE
- S2 Gates — DONE (built; owner review pending)
- S2.5 People — DONE (roles enforced server-side; persona switcher is a
  pilot device, NOT auth; every answer AND every intake change records who
  made it)
- Independent verification of S1/S2/S2.5 ran 2026-08-21: FAIL, 14 findings,
  all addressed (SPEC G-28..G-31; corrected rows in `uat/S*.md`).
- S3..S10 — not started (do not scaffold ahead; SPEC §0 rule 5)

Instrument data lives in `src/data/instrument/*.json`, imported at build
time (never read from disk at runtime). After editing it run
`pnpm instrument:seed` to activate a new version — activated versions are
immutable, so a change means a new version string.

## Commands

```sh
# Postgres: this machine has NO Docker. We use Homebrew postgresql@16 on
# :5432, database `ura`, role ura/ura. docker-compose.yml is kept for
# AWS/CI parity only — `pnpm db:up` needs Docker and will not work here.
pnpm dev          # web on :3100 (old-platform dev uses :3000)
pnpm db:migrate   # DATABASE_URL from .env
pnpm test         # vitest (PGlite applies REAL migrations — no docker needed)
pnpm e2e          # playwright: its OWN server (:3101) + OWN database
                  #   (E2E_DATABASE_URL) — never the one you demo from
pnpm e2e:db       # create + migrate + seed that database (pnpm e2e runs it)
pnpm typecheck
pnpm agent-map     # regenerates docs/agent-map.html from the repo itself
pnpm uat:new S3    # UAT record skeleton for a slice (rows from SPEC §17/§20)
```

## Skills — load them at these moments (SPEC G-18)

Procedures live in `.claude/skills/`, not here. Load the skill *before* the
work, not after:

| Before you… | Load |
|---|---|
| start or finish a slice | `slice-review` |
| commit, or claim anything is done | `full-gates` |
| write an action, mutation, or failure path | `error-handling` |
| build or restyle any screen | `ui-craft` |
| finish a screen or design a question's behaviour | `ux-audit` |
| add a feature, utility, or data access path | `aws-ready` |
| challenge or design a question a person answers | `question-design` |
| propose or spec anything an agent would do | `agentic-design` |
| audit the instrument as a whole (tiers, rubrics, coverage) | `instrument-coherence` |
| change any question, option, or condition | `instrument-change` |
| hand the owner something to test | `uat-checkout` |

Law lives in SPEC and is always true; procedure lives in skills and is
loaded on demand; teeth live in tests and hooks. Loading is probabilistic —
so anything that must ALWAYS hold is in SPEC or enforced by a test, never
only in a skill.

## Workspace law: build for AWS from the first line (SPEC §26)

- **Pure logic, separate executors.** Business rules import no framework, no
  driver, no env — so any module lifts into a Lambda/AgentCore task
  unchanged. Actions/routes only: read request → call pure fn → call store.
  Convert FormData/Request at the boundary; never pass them inward.
- **State is external.** No process memory, no local files, no hardcoded
  paths. All reads/writes through `src/lib/repo.ts`; nothing else touches
  the driver.
- **The store engine is UNDECIDED** (SPEC §14.6): Postgres is today's
  implementation, DynamoDB is a live candidate. Flag any Postgres-specific
  choice in the slice review; assess with evidence after S9 and before the
  AWS migration. Note: §5 invariants currently rely on DB CHECK
  constraints, which DynamoDB does not have — that trade is the crux.
- **Config in one place.** Only `src/lib/config.ts` reads process.env, and it
  validates. Secrets Manager / Parameter Store swap in there alone.
- **Three test tiers**: `pnpm test:unit` (pure, no deps) · `test:integration`
  (PGlite, no daemon) · `test:e2e` (running app). Each is a CI step.
- These are enforced by `test/unit/architecture.test.ts` — drift fails the
  build, it does not rely on anyone remembering.

## Non-negotiables (from SPEC, enforced here)

- AWS-ready by construction (SPEC §6.4): containerized, env-only config
  (DATABASE_URL), RDS-compatible Postgres, no dependency without an
  AWS-managed equivalent.
- Instrument/intake content is DATA (src/lib/intake.ts now; seed files from
  S2). No hardcoded question content in components.
- No internal identifiers in user-facing text (NFR-9). Labels only.
- File budgets: ≤400 lines new, 800 hard (NFR-6) — stylesheets included;
  `globals.css` is imports only, one sheet per area in `src/app/styles/`.
- Demo-ready UI per slice (SPEC §23): designed states, accessible names,
  keyboard operable, plain language, screenshot in the review.
- Migrations: plain SQL in drizzle/, mirrored in src/lib/schema.ts; drift is
  caught by PGlite tests applying the real SQL.

## Parts shelf (SPEC G-8)

The prior platform lives at ../riskassess — READ-ONLY. Never edit, never
run its dev server, never develop it further. It is a source of proven
parts only; salvage decisions happen at the slice that needs the part.

Salvage candidates and the slice that decides:
- condition engine + its tests (packages/contract) ....... S3
- reviewer workspace patterns (apps/web) ................. S8
- verbatim matcher, basis/never-guess machinery .......... Phase 2
- eval harness + agent service (apps/agent) .............. Phase 2

Salvage = copy the code here, re-read it, keep what the SPEC requires,
delete the rest, bring its tests. Never import across repos.
