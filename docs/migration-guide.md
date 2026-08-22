# Migration guide — running this on AWS

**Status:** deliverable required by SPEC §26.7, written against the migration
plan of record in §6.4. This is the plan; nothing here has been applied.

Written to be followed by someone with no prior AWS knowledge. Where a step
needs a decision rather than a command, it says so and gives the evidence for
choosing — it does not choose silently.

---

## 0. Before anything else — the one thing with a queue

**File the Bedrock model-access request today, before any infrastructure
exists.** SPEC §6.4 Tier 2 marks this the critical path in the plan itself:

> *the Bedrock model-access request is owner-side, approval time is
> uncontrollable, and everything model-dependent waits on it — it is filed
> before, not during, the migration.*

Approval is not instant and is not in our control. Every agentic feature —
the whole Phase-2 register in §22.1 — is blocked behind it. Infrastructure
can be built while it sits in a queue; it cannot be built after.

**How:** AWS console → Bedrock → *Model access* → request the Anthropic
Claude models, in the region you will deploy to. Region matters: access is
per-region, and requesting it in the wrong one means requesting it twice.

Nothing else in this guide is on a queue. This is the only step whose delay
you cannot compress by working harder.

---

## 1. What is actually true today

An honest inventory, because a migration guide that describes a system you do
not have is worse than none.

| | Today | Notes |
|---|---|---|
| Services | **One** container (web) | §6.4 Tier 1 describes two — web and agent. The agent service does not exist yet; it arrives with the agent seam (§4 below). |
| Runtime deps | **5** — next, react, react-dom, drizzle-orm, postgres | Satisfies §6.4 obligation 4: every one has an AWS-managed equivalent or is pure application code. |
| Database | Postgres 16, plain SQL migrations, 10 of them | RDS-compatible. Uses only `gen_random_uuid()` — built into Postgres 13+, so **no extensions to install**. |
| Config | One module (`src/lib/config.ts`) reads env | Enforced by `test/unit/architecture.test.ts`. Zero local-vs-cloud branches, per §6.4 obligation 2. |
| Container | `Dockerfile` at repo root, `output: "standalone"` | Builds from the repo root, per §6.4 obligation 1. **Never built or run — see §2.1.** |
| Tests | 237 unit+integration, 23 E2E, three separately runnable tiers | §26.4. Integration needs no daemon (PGlite). |
| Auth | **None, by design** | The persona switcher is a demo device. This is the decision §3.2 forces. |
| Observability | **None** | §6.4 obligation 5 wants OpenTelemetry spans from the agent service. No agent service, so nothing is violated yet — but it is a debt that comes due with §4. |

---

## 2. Tier 1 — the day-one lift

Goal: the app running on AWS, against RDS, reachable over HTTPS, with no code
changes — only environment variables (§6.4 obligation 2).

### 2.1 The local constraint that shapes everything

**This machine has no Docker.** The image cannot be built here. That is not a
blocker, it changes where the build happens: **AWS CodeBuild builds the image
from a source upload and pushes it to ECR.** The pipeline is therefore part of
the Tier-1 deliverable, not a later nicety.

Consequence worth knowing up front: you cannot smoke-test the container
locally. The first time this image runs is in AWS, so the first deploy is also
the first test of the Dockerfile. Budget one round of fixing it.

### 2.2 Decision 1 — compute shape

SPEC §6.4 leaves this open in exactly these words: *"ECS Fargate (or App
Runner for web)"*. Both satisfy §26; pick on effort and audience.

| | App Runner | ECS Fargate + ALB |
|---|---|---|
| Pieces to build | Service, VPC connector | Cluster, task definition, service, ALB, target group, listener, 2 security groups |
| HTTPS | Included, with a generated domain | ACM certificate + listener you configure |
| Rollout / autoscale | Managed | You configure it |
| Time to a working URL | ~half a day | ~1–2 days |
| Recognised by an AWS-literate reviewer as "the enterprise shape" | Less so | Yes |

**Recommendation: App Runner**, and revisit at Tier 3. The reason is not
laziness — it is that the second container (agent) and AgentCore change this
picture materially, and building the full ECS shape now means building it
twice. App Runner gets a real URL in front of people while the architecture
that will actually carry the agent is still being decided.

**If the room includes people who will judge the architecture**, take ECS
Fargate and pay the extra day.

### 2.3 Decision 2 — who can reach it

SPEC does not cover this, because the prototype was never going to be public.
It is now the most consequential open question in this guide.

The app has **no authentication**. Every screen is reachable by anyone who
reaches the URL, and the persona switcher lets a visitor become an admin by
choosing from a dropdown. The pilot data is synthetic, but nothing enforces
that — the moment this is on the internet, anything anyone types into it is
readable by anyone who finds it.

Three options, in the order I would defend them:

1. **Cognito in front (recommended).** A real sign-in before the app loads;
   the persona switcher stays as the demo device behind the door. You control
   the user list; no self-signup. This is the answer that survives a
   governance-minded room asking *"who can see this?"* — which is the room
   this product is being built for, about a product that asks people to
   classify data as Confidential.
2. **IP allowlist.** Reachable only from named addresses. Faster, no login
   friction — and it breaks the instant someone watches from a phone or a
   conference network.
3. **Open.** Only defensible on synthetic data, and "synthetic only" would be
   a rule enforced by nothing. Not recommended for anything shown to
   leadership.

**This decision is required before the service is created**, not after —
retrofitting auth in front of a running service means recreating it.

### 2.4 Infrastructure inventory

Assuming App Runner and Cognito. Region: **us-east-2** (already configured
locally, and where the Bedrock request in §0 should be filed).

| Resource | Purpose |
|---|---|
| ECR repository `ura-web` | Holds the container image |
| CodeBuild project `ura-build` | Builds the image from a source zip in S3, pushes to ECR |
| S3 bucket `ura-build-source` | Where the source zip lands |
| VPC (2 private subnets, 1 public), one NAT | RDS is private; App Runner reaches it via a VPC connector |
| RDS Postgres 16, `db.t4g.micro`, not publicly accessible | The database |
| Secrets Manager secret `ura/database-url` | The connection string. Never an environment literal. |
| App Runner service `ura-web` | Runs the container, terminates HTTPS |
| App Runner VPC connector | Lets the service reach RDS privately |
| Cognito user pool + hosted UI | Sign-in |
| CloudWatch log groups | Application and build logs |

**IAM — three roles, each scoped to one job:**

- **CodeBuild role** — read the source bucket, push to ECR, write its own logs.
- **App Runner access role** — pull from ECR. Nothing else.
- **App Runner instance role** — read exactly one secret (`ura/database-url`),
  write logs. **At Tier 2 this role gains `bedrock:InvokeModel` and nothing
  more** — it is the only place model access is granted, which is what makes
  "who can call a model" answerable.

Everything else is deny-by-default. No role gets `*`.

### 2.5 The order to build it

1. **Re-authenticate.** `aws sts get-caller-identity` currently fails with
   `InvalidClientTokenId`. Run `aws sso login` (or `aws configure`) until that
   command prints your account. Nothing works before this.
2. **Install Terraform** — `brew install terraform`. Chosen over CDK
   deliberately: CDK would put infrastructure dependencies inside the app's
   package tree, and SPEC Build Rule 4 forbids dependencies the spec does not
   require. Terraform stays entirely outside `package.json`.
3. **Network and database first** — VPC, subnets, RDS, the secret. These have
   the longest creation time (RDS is ~10 minutes) and everything else depends
   on them.
4. **Build pipeline** — ECR, S3, CodeBuild. Then run one build and confirm an
   image lands in ECR. *This is the first real test of the Dockerfile.*
5. **Run the migrations as a one-off task**, not from the app. SPEC §26.5:
   schema changes are a task, not a request path. The runner
   (`packages`-free, `pnpm db:migrate`) is already standalone and takes
   `DATABASE_URL` from the environment — it runs as a CodeBuild job against
   the same secret.
6. **Seed the instrument** — `pnpm instrument:seed`, same shape as above.
   Activated versions are immutable, so this is safe to re-run.
7. **The service** — App Runner pointing at the ECR image, VPC connector
   attached, `DATABASE_URL` sourced from Secrets Manager.
8. **Cognito in front.**
9. **Smoke test** — §5 below.

### 2.6 What changes in the repo

Almost nothing, and that is the point of §26. Expected:

- A `terraform/` directory (new, outside the app's dependency tree).
- A `buildspec.yml` for CodeBuild.
- Possibly a fix to the `Dockerfile` after its first real build.
- **No application code.** If a step here requires a code change, that is a
  §26 violation and should be recorded as a finding, not patched around.

---

## 3. Tier 2 — model access behind one seam

Blocked on §0. Buildable the day it clears.

**The seam does not exist yet, and it must exist before the first feature
calls a model.** One module — call it `src/lib/model.ts` — is the only thing
in the codebase that knows how a model is reached. Everything else asks it a
question and gets an answer.

Why this is worth being fussy about: the prior platform learned it the
expensive way and ended up with the right shape, where switching transports is
an environment variable rather than a refactor. Built first, the seam is an
afternoon. Built after three features call a model directly, it is a rewrite
of all three.

What the seam owes:

- **`MODEL_TRANSPORT`** decides the implementation. `bedrock` in AWS. A local
  transport for development, so the laptop loop does not require cloud
  credentials.
- **No caller ever learns which one it got.** No branching on transport
  outside this file — §6.4 obligation 2, applied to models.
- **Bedrock permission lives on the App Runner instance role** (§2.4), not in
  application credentials.
- **OpenTelemetry spans from day one** (§6.4 obligation 5) — console locally,
  CloudWatch in AWS, the same instrumentation either way.

And the rule that outranks all of it, from §22.2: **world knowledge may inform
the conversation and may never become an answer's evidence.** The seam carries
that boundary — what a model returns is a *proposal*; the person's
confirmation is the evidence.

---

## 4. Tier 3 — AgentCore as substrate

Not before Tier 2 works. SPEC §6.4 is explicit that AgentCore is **substrate,
never an autonomous orchestrator of the governed pipeline** — it runs things;
it does not decide what may be answered or attested.

Four services, each behind a seam that must exist before it is used:

| AgentCore | Sits behind | What it replaces |
|---|---|---|
| **Runtime** | the agent seam | The in-process call to the model layer |
| **Memory** | the session seam | Conversation state, currently nowhere because there is no conversation |
| **Gateway** | — | Enterprise connectors, described with **OpenAPI** schemas (the open REST-description standard, formerly Swagger — unrelated to OpenAI, which this project does not use) |
| **Observability** | the OTel instrumentation from §3 | Console/CloudWatch traces |

This is also where the **second container** in §6.4's Tier 1 arrives: the
agent service, internal-only, reachable solely from web tasks — never from the
internet. If §2.2 chose App Runner, this is the moment to revisit ECS Fargate,
because two services with a private one behind a public one is the shape ECS
expresses naturally.

**Features map to compute like this:**

- **Per-request, conversational** (the companion, term help) → the agent
  service / AgentCore Runtime. Warm, low latency, holds a session.
- **Bounded and one-shot** (intake grading, contradiction lint, destination
  record drafting) → Lambda. No warm state needed, scales to zero.
- **Batch and scheduled** (precedent aggregation, portfolio memory) → a
  container task on a schedule. Reads attested answers only, per §22.4.

---

## 5. Proving parity — the three tiers in the cloud

SPEC §26.4 requires each tier to be separately runnable in an isolated CI
container with no local setup. The checklist §26.7 asks for:

- [ ] **Unit** (`pnpm test:unit`) runs in CodeBuild with only Node installed.
      No database, no network. Expect 237 passing.
- [ ] **Integration** (`pnpm test:integration`) runs in the same container.
      PGlite applies the real migrations in-process — **it must not connect to
      RDS.** If it needs a database URL, something has regressed.
- [ ] **Migrations apply cleanly to an empty RDS instance**, in filename
      order, and the app renders a historical project afterwards (§10,
      migration safety).
- [ ] **E2E** (`pnpm e2e`) runs against the deployed URL with its **own
      database**, never the one being demoed. This is the one tier that needs
      real infrastructure; give it its own RDS instance or its own database on
      the same instance.
- [ ] **The stop gate passes in CI** — `node scripts/hooks/stop-gate.mjs`.
      It needs no network, and it is the check that catches a stale generated
      artifact reaching production.
- [ ] **A forced failure speaks properly in the cloud.** Break the database
      connection and confirm the person sees a plain sentence with a reference
      and no driver text (§25). Error handling that works locally and leaks a
      stack trace in production is a common and embarrassing gap.

---

## 6. Cost and teardown

Rough monthly, us-east-2, nothing under load: RDS `db.t4g.micro` ~$15,
App Runner (1 vCPU, idle-capable) ~$5–25, NAT gateway ~$32, ECR/S3/CodeBuild
~$1. **The NAT gateway is the largest line and the least obvious** — it exists
so the private service can reach the internet. If nothing needs egress, it can
go, and that is most of the cost with it.

Write the teardown before the buildup: `terraform destroy` must leave nothing
behind except the ECR images and the S3 source bucket, both of which are
cheap. An environment nobody can delete confidently is an environment nobody
turns off.

---

## 7. What this guide does not cover

- **Any of it applied.** Nothing here has been run. The first deploy will find
  something this document is wrong about; that is expected, and the fix is to
  correct the document in the same change.
- **Domain and TLS beyond App Runner's generated URL.** A custom domain needs
  Route 53 and ACM, and nobody has said whether a real domain is wanted.
- **Backups, DR, and retention.** RDS automated backups default to 7 days.
  Nothing here decides how long real assessment data should live — and that
  question is not answered anywhere in SPEC either.
- **Multi-environment.** One environment is described. Staging plus production
  doubles the infrastructure and needs a decision about which one gets demoed.
- **Whether the demo should run on AWS at all.** It should — the owner has
  settled that. Recorded so the guide is not read as neutral on a question
  that was actually decided.
