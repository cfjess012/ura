---
name: aws-ready
description: Keep every feature deployable to serverless AWS — pure logic separated from executors, state externalised, config through one module, tests in tiers. Use when adding a feature, a utility, an action, or a data access path.
---

Implements SPEC §26 (and §6.4, G-7).

## The shape of a feature

```
src/lib/<feature>.ts          pure rules — no framework, no driver, no env
src/lib/repo.ts               the only place the database driver appears
src/app/actions.ts            executor: request → pure fn → store → Result
src/lib/config.ts             the only place process.env is read
```

Anything in the pure layer must lift into a Lambda handler or AgentCore
task **with no edit to its body**. That is the test: could you copy this
file into a new project and have it compile with only its own imports?

- Convert web shapes (`FormData`, `Request`) at the boundary. A pure module
  that mentions `FormData` has already failed.
- No local filesystem state, no hardcoded paths, no in-memory session.
- Small connection pools: serverless scales instances, not connections.

## Config

Add new settings to `src/lib/config.ts` only, with validation and an error
naming both the local fix and the AWS source (Secrets Manager / Parameter
Store). Never read `process.env` anywhere else.

## Tests in tiers

- `test/unit/` — pure logic, mocks everything external, needs only Node.
- `test/integration/` — real SQL on in-process Postgres (PGlite); no
  daemon, no local setup.
- `e2e/` — the running app.

Group by feature domain. Each tier must run inside a CI container with no
local terminal setup, because each becomes a CodeBuild step.

## The store engine is undecided

Postgres today; **DynamoDB is a live candidate** (§14.6). Flag any
Postgres-specific choice in the slice review as a constraint on that
decision. The crux to remember: §5 invariants are enforced by DB CHECK
constraints, which DynamoDB does not have — moving would relocate those
guarantees into application code.

## Enforcement

`test/unit/architecture.test.ts` fails the build on drift: a framework
import in a logic module, driver access outside the store, `process.env`
outside config, or a hardcoded connection string. Add a case there when you
add a rule.

## The deployment actually exists now (2026-08-23)

`deploy/` holds the real path, and it is the reference — do not invent a
second one:

- `deploy/README.md` — the CloudShell runbook, top to bottom.
- `deploy/infra.yaml` — CloudFormation: ECR, RDS Postgres 16, the security
  group, and the two IAM roles ECS Express Mode requires.
- `deploy/architecture.md` — what runs today, and what changes at Phase 2.
- `deploy/codebuild.md` — the fallback when CloudShell runs out of disk.

**Compute is ECS Express Mode, not App Runner.** App Runner closed to new
customers on 30 April 2026; Express Mode is AWS's named successor and gives
the same one-command shape (Fargate + ALB + TLS + a URL).

### Things that will break a deploy, learned the hard way

- **Health checks must point at `/healthz`**, which answers without touching
  Postgres. Pointed at `/`, an unreachable database fails the health check,
  the platform restarts the task, and it reads as a broken application. Use
  `/readyz` to ask whether the database is reachable — it answers in one
  line and scrubs credentials out of the driver error.
- **`HOSTNAME=0.0.0.0` in the image.** Next's standalone server otherwise
  binds to localhost and nothing can reach it.
- **`packageManager` in package.json.** Without it corepack picks a pnpm
  that does not match the lockfile.
- **`.dockerignore` must exclude `.env`.** The build context ships into the
  image.
- **The task's route to Postgres** is the `VpcCidr` parameter. Wrong value,
  and the app deploys healthy while `/readyz` reports the database
  unreachable — which is the endpoint doing its job.

### Adding an environment variable

It goes in `src/lib/config.ts` and nowhere else (§26.3), then into the
`--primary-container` JSON in the runbook. Never a `local vs cloud` branch
in code — that is §6.4 obligation 2 and it is checked in review.
