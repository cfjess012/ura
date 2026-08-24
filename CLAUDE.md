# CLAUDE.md — Front Door AI Risk Advisor

SPEC.md is the BRAIN: requirements (§20), slices (§17), acceptance criteria
(§19), build rules (§0), and the governance log (§13) all live there. Do not
build anything untraceable to a requirement ID. Follow the Build Rules (§0):
vertical slices in order, tests green before advancing, simplest consistent
implementation, stop on ambiguity.

## Slice status

- S1 Intake — DONE
- S2 Gates — DONE
- S2.5 People — DONE (the persona switcher is a pilot device, NOT auth)
- S3 Paths & engine — DONE (derived state COMPUTED, never stored)
- S4 Tier 2 — DONE (rubric anchors ARE the options)
- S4.7 Hand-offs — DONE 2026-08-22 (FR-36, legalized G-54)
- S4.8 Declared boundaries — DONE 2026-08-23 (FR-35: the seven pilot-scoped
  areas say on screen that they stop deliberately; derived, never listed)
- S5 Ledger — DONE 2026-08-23 (FR-10/FR-11: active paths, severities and the
  objectives they require, recomputed live and never stored; G-57)
- S7 Submit & findings — DONE 2026-08-23 (FR-14/FR-15/FR-37: the declaration
  records what was SHOWN; gaps named not counted; findings derived from the
  control answers. Verifier FAIL then fixed — see uat/S7.md)
- S6 Tier 3 — DONE 2026-08-23 (FR-12/FR-13: does the control exist; children
  on Yes only; notes required on Partial/No/N-A. FR-21 half-met — the free
  note is deferred to S8, see uat/S6.md)
- S4.5 Reference data — PARTIAL: searchable vendor picker and
  provenance-on-accept (FR-33) remain
- S3.5 Destinations — SPEC'd not built (§27) · S4.6 Attachments — blocked on
  §3.6 retention
- S5..S10 — not started (do not scaffold ahead; SPEC §0 rule 5)
- 2026-08-23 level set: SPEC rewritten to the official mission (G-51..G-55);
  agentic on Bedrock/AgentCore is the Phase-2 epic and the priority after
  the demo. The three §6.1 seams do NOT exist in code yet.
- `demo/readiness.md` = what the room sees; the stop gate blocks finishing
  until it covers every DONE slice (G-44). `db:reset` held for demo-data
  day. Audit C-6/7 open (`audits/instrument-2026-08-21.md`).

Instrument data lives in `src/data/instrument/*.json`, imported at build time
(never from disk at runtime). After editing, `pnpm instrument:seed` activates
a new version — activated versions are immutable, so a change means a new
version string.

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
pnpm db:reset --yes  # DESTRUCTIVE: rebuild the dev database. The only way
                  #   back to clean — answers are insert-only by design.
pnpm typecheck
pnpm agent-map     # regenerates docs/agent-map.html from the repo itself
pnpm uat:new S4    # UAT record skeleton for a slice (rows from SPEC §17/§20)
```

## Skills — load them at these moments (SPEC G-18)

Procedures live in `.claude/skills/`, not here. Load the skill *before* the
work, not after:

| Before you… | Load |
|---|---|
| commit, start/finish a slice, or claim anything is done | `verify` |
| write an action, mutation, or failure path | `error-handling` |
| build, change, audit, or point anything at a screen | `ui-craft` |
| add a feature, utility, or data access path | `aws-ready` |
| change anything a person is asked, or activate a version | `instrument` |
| propose or spec anything an agent would do | `agentic-design` |
| build, change or review a capability in the agent service | `agent-capability` |
| write anything to the owner | `owner-brief` |
| answer design feedback or a screenshot | `design-mock` |
| finish a review, prep UAT or the demo, or write down a claim | `demo-truth` |

Law lives in SPEC and is always true; procedure lives in skills and is
loaded on demand; teeth live in tests and hooks. Loading is probabilistic —
so anything that must ALWAYS hold is in SPEC or enforced by a test, never
only in a skill.

## Workspace law: build for AWS from the first line (SPEC §26)

The rules live in the `aws-ready` skill and are enforced by
`test/unit/architecture.test.ts` — pure logic separate from executors, state
external behind `src/lib/repo.ts`, config only via `src/lib/config.ts`,
three test tiers. One fact worth keeping resident: **the store engine is
settled — Postgres on RDS (G-53).** DB CHECK constraints carry the §5
invariants; that is a feature, not a portability risk.

## Non-negotiables (from SPEC, enforced here)

- AWS-ready by construction (SPEC §6.4): containerized, env-only config
  (DATABASE_URL), RDS-compatible Postgres, no dependency without an
  AWS-managed equivalent.
- Instrument/intake content is DATA (`src/lib/intake.ts`, `src/data/`). No
  question content in components.
- No internal identifiers in user-facing text (NFR-9). Labels only.
- File budgets: ≤400 new, 800 hard (NFR-6), stylesheets included.
- Demo-ready UI per slice (SPEC §23): designed states, accessible names,
  keyboard operable, plain language, screenshot in the review.
- Migrations: plain SQL in drizzle/, mirrored in src/lib/schema.ts; drift is
  caught by PGlite tests applying the real SQL.

## Parts shelf (SPEC G-8)

The prior platform lives at ../riskassess — READ-ONLY. Never edit, never run
its dev server, never develop it further. It is a source of proven parts;
salvage decisions happen at the slice that needs the part:
- reviewer workspace patterns (apps/web) · S8 · verbatim matcher and
  basis/never-guess machinery · eval harness + agent service · all Phase 2

Salvage = copy here, re-read, keep what the SPEC requires, delete the rest,
bring its tests. Never import across repos. S3 declined the first one (G-40).
