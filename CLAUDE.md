# CLAUDE.md — Universal Risk Assessment

SPEC.md is the BRAIN: requirements (§20), slices (§17), acceptance criteria
(§19), build rules (§0), and the governance log (§13) all live there. Do not
build anything untraceable to a requirement ID. Follow the Build Rules (§0):
vertical slices in order, tests green before advancing, simplest consistent
implementation, stop on ambiguity.

## Slice status

- S1 Intake — IN PROGRESS
- S2..S10 — not started (do not scaffold ahead; SPEC §0 rule 5)

## Commands

```sh
pnpm dev          # web on :3100 (old-platform dev uses :3000)
pnpm db:up        # postgres 16 on :5433 (old platform uses :5432)
pnpm db:migrate   # applies drizzle/*.sql in order (ledger: _migrations)
pnpm test         # vitest (PGlite applies REAL migrations — no docker needed)
pnpm e2e          # playwright against a running dev server
pnpm typecheck
```

## Non-negotiables (from SPEC, enforced here)

- AWS-ready by construction (SPEC §6.4): containerized, env-only config
  (DATABASE_URL), RDS-compatible Postgres, no dependency without an
  AWS-managed equivalent.
- Instrument/intake content is DATA (src/lib/intake.ts now; seed files from
  S2). No hardcoded question content in components.
- No internal identifiers in user-facing text (NFR-9). Labels only.
- File budgets: new files ≤400 lines, hard ceiling 800 (NFR-6).
- Migrations: plain SQL in drizzle/, mirrored in src/lib/schema.ts; drift is
  caught by PGlite tests applying the real SQL.

## Parts shelf

The prior platform lives at ../riskassess (untouched, read-only). Salvage
decisions happen per-slice per SPEC G-8 — first candidate moment is S3
(condition engine).
