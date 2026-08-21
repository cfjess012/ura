# CLAUDE.md — Universal Risk Assessment

SPEC.md is the BRAIN: requirements (§20), slices (§17), acceptance criteria
(§19), build rules (§0), and the governance log (§13) all live there. Do not
build anything untraceable to a requirement ID. Follow the Build Rules (§0):
vertical slices in order, tests green before advancing, simplest consistent
implementation, stop on ambiguity.

## Slice status

- S1 Intake — DONE (review round 1 applied); UI upgrade to SPEC §23 pending
- S2..S10 — not started (do not scaffold ahead; SPEC §0 rule 5)

## Commands

```sh
# Postgres: this machine has NO Docker. We use Homebrew postgresql@16 on
# :5432, database `ura`, role ura/ura. docker-compose.yml is kept for
# AWS/CI parity only — `pnpm db:up` needs Docker and will not work here.
pnpm dev          # web on :3100 (old-platform dev uses :3000)
pnpm db:migrate   # DATABASE_URL from .env
pnpm test         # vitest (PGlite applies REAL migrations — no docker needed)
pnpm e2e          # playwright against a running dev server
pnpm typecheck
```

## Every slice owes (SPEC §21)

Pre-flight before starting; review after, containing: what changed · at
least two self-critiques · what was deliberately not done · open questions
with recommendations · a demoable artifact · the **agentic opportunity**
registered for Phase 2 (§22) · **UI evidence** against the demo-ready
standard (§23). Critique is owed in both directions (Build Rule 14).

## Non-negotiables (from SPEC, enforced here)

- AWS-ready by construction (SPEC §6.4): containerized, env-only config
  (DATABASE_URL), RDS-compatible Postgres, no dependency without an
  AWS-managed equivalent.
- Instrument/intake content is DATA (src/lib/intake.ts now; seed files from
  S2). No hardcoded question content in components.
- No internal identifiers in user-facing text (NFR-9). Labels only.
- File budgets: new files ≤400 lines, hard ceiling 800 (NFR-6).
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
