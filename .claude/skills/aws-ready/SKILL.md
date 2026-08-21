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
