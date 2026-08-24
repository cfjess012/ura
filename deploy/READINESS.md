# AWS readiness

Where this stands for a deploy into the sandbox account, what has been
verified and how, and what has not. Written to be read before you start, not
after something fails.

**Status: ready to deploy, never deployed.** Everything below that says
"verified" was actually run. Nothing here is an intention.

---

## The honest headline

No image has been built and no stack created. There is no Docker on the
machine this was developed on and no credentials for the sandbox account.
What _has_ been done is the next best thing: the production artifact itself
was built and run, against a deliberately unreachable database, and the
failure modes that a first deploy actually hits were found by reading the
container against what a deploy does.

Expect the first run of `deploy/README.md` to take about 25 minutes, most of
it waiting for RDS.

---

## What is ready

| Piece                 | State                          | How it was checked                                                                                                                                                                   |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web container         | Ready                          | `pnpm build` produces the standalone server; it was run and served traffic                                                                                                           |
| `/healthz`, `/readyz` | **Verified**                   | Run against a dead database: 200, 503-with-reason, and `/` 500 — which is why the health check must not be `/`                                                                       |
| CloudFormation stack  | Written, not run               | Template parses; resources are ECR ×2, RDS 16, security group, three IAM roles                                                                                                       |
| Runbook               | Written                        | Every step states what it should print; failure modes are named where they happen                                                                                                    |
| Agent container       | Ready                          | Its own image, its own typecheck and tests; runs and serves `/healthz`                                                                                                               |
| Bedrock path          | **Seam verified, Bedrock not** | The provider seam was exercised end to end against a local model over the identical Anthropic Messages API; `AGENT_PROVIDER=bedrock` swaps the client and no other code path differs |
| Migrations            | **Verified**                   | 24 plain-SQL files, applied in order, exercised by the integration suite on every run                                                                                                |
| Demo data             | **Verified**                   | `pnpm demo:seed` produces four assessments, one already with a reviewer                                                                                                              |

## Four defects already found and fixed

Found by reading the container against what a deploy does, not by running
one. Each would have failed the first attempt and looked like something else:

1. **No `.dockerignore`** — `.env` would have shipped inside the image.
2. **`HOSTNAME` unset** — Next's standalone server binds to localhost, the
   load balancer never connects, and the platform reports a crash loop.
3. **No `packageManager`** — corepack picks a pnpm the lockfile was not
   written by.
4. **No health endpoint that avoids the database** — `/` reads the people
   directory, so an unreachable Postgres would fail the health check and
   read as a broken application rather than a missing security-group rule.

## Decisions already taken

- **Compute is ECS Express Mode**, not App Runner — App Runner closed to new
  customers on 30 April 2026 (G-62).
- **Database is public, restricted to one address**, so migrations run from
  CloudShell. A deliberate trade for a sandbox holding synthetic data.
- **`DATABASE_URL` is a plain environment variable.** Acceptable for
  synthetic pilot data; for anything real, move it to Secrets Manager and
  create the service from your own task definition.
- **No S3 bucket**, because no files are stored — documents are kept as
  extracted text only while §3.6 retention is open (G-66).

## What to expect to go wrong

In rough order of likelihood:

1. **`create-express-gateway-service` fails with an assume-role error.** IAM
   is eventually consistent and the stack has just made the roles. Wait a
   minute, run it again. This is expected, not a mistake.
2. **`/readyz` returns 503 while `/healthz` returns 200.** The app is fine
   and the tasks cannot reach Postgres — almost always the `VpcCidr`
   parameter not matching the VPC the tasks are in.
3. **`docker build` runs out of disk in CloudShell.** Use the CodeBuild
   fallback in `deploy/codebuild.md`.
4. **`pnpm db:migrate` hangs.** Your CloudShell IP changed between sessions;
   redeploy the stack with the current one.
5. **The agent has no Bedrock model access.** `aws bedrock
list-foundation-models` will tell you what is granted; set `AGENT_MODEL`
   to one of those.

## What has not been verified, and cannot be from here

- **Any of it, on AWS.** No stack has been created.
- **Bedrock specifically.** The seam is proven against an API-compatible
  local model, which proves the seam and not the grant.
- **Express Mode's behaviour** — the CLI syntax is from the current AWS
  documentation, not from a run.
- **Cost.** The figures in `architecture.md` are list-price arithmetic.

## Before the demo

- Run the deploy once, end to end, on a day that is not demo day.
- `curl` both health endpoints and open the URL.
- Run `pnpm walk:demo` locally the morning of — it asserts the run sheet
  still matches the product, and it has caught a stale run sheet twice.
- Decide whether the agent is connected. The product is complete without it
  and says so; with it, drafting and the assistant appear.
