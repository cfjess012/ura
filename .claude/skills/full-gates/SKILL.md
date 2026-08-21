---
name: full-gates
description: Run the complete verification chain before calling any work done — typecheck, the three test tiers, and the E2E journey. Use before every commit, at the end of every slice, and whenever asked whether the build is green.
---

Implements SPEC §0 (Build Rule 3) and §26.4.

## The chain, in order

```sh
pnpm typecheck            # strict tsc — fastest signal, run first
pnpm test:unit            # pure logic; needs only Node
pnpm test:integration     # real SQL on in-process Postgres; no daemon
pnpm e2e                  # needs the dev server running on :3100
```

`pnpm verify` runs the first three (everything that needs no server).

## Rules

- **Green is the permission slip.** A red gate stops the slice; it is never
  "known failing" or "fixed in the next commit".
- **Start the dev server before E2E** and confirm it answers:
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/` → 200.
- **Read the failure, don't re-run it.** Re-running a red test hoping for
  green is how a real defect gets shipped as flakiness.
- **When a test fails after an intentional change**, decide explicitly:
  either the code is wrong (fix it) or the test encoded the old intent
  (update it, and say so in the commit). Never delete a failing test.
- **File budgets** are part of the chain: nothing over 800 lines, new files
  ≤400 (`find src -name "*.ts*" -exec wc -l {} + | sort -rn | head`).

## Reporting

State the actual numbers ("35 tests, typecheck clean, E2E green"), never
"tests pass". If any tier was skipped, say which and why.
