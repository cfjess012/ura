# Front Door AI Risk Advisor

One front door for enterprise risk intake. A business owner describes an
activity once, in their own words; every risk area's process integrates
behind that single description instead of sending them another form.

`SPEC.md` is the source of truth. Nothing here is built that does not trace
to it, and every settled decision is recorded in its governance log with the
reasoning that produced it.

> **This is a pilot, and it has no authentication by design.** You choose
> who you are from a list on the front door. That is a deliberate stand-in
> for an identity provider (SPEC §2) and it means **this must not be exposed
> beyond a sandbox**. All data in it is synthetic.

## What works today

The deterministic platform, end to end:

- **Structured intake** with conditional fields, then **Tier-1 routing** —
  which risk areas apply, and _why_, in the words the person used.
- **Tier-2 severity** on rubric-anchored questions, with bands derived where
  the answers already imply them rather than asked twice.
- **Tier-3 control objectives** accumulated from those answers, each one
  naming the answer that pulled it in.
- **Submission and declaration** — the submitter stands behind the record,
  by name.
- **Review and attestation** — a Risk Assessor signs each control answer
  under their own risk area, and findings close one of exactly four governed
  ways, including risk acceptance that needs a second person and expires.
- **The agent service** — drafts answers from supplied evidence with
  verbatim quotes, and abstains when the evidence is silent.

## What is deliberately not built

Stated so nobody has to discover it: destination write-back, real identity,
attachment storage (blocked on a retention decision), and composite scoring
— which is an open question, not an oversight.

## Running it

```sh
pnpm install
cp .env.example .env    # then read it — the Docker port note matters
pnpm db:up && pnpm db:migrate && pnpm instrument:seed
pnpm demo:seed          # four curated assessments, one already with a reviewer
pnpm dev                # http://localhost:3100
```

**`pnpm db:up` publishes Postgres on 5433, not 5432** — deliberately, so the
container cannot collide with a Postgres already running on the machine. If
you use it, point `DATABASE_URL` and `E2E_DATABASE_URL` at 5433; `.env.example`
carries both forms.

### If you cannot run Docker

Nothing here needs Docker, and nothing needs administrator rights. `db:up` is
a convenience; the app wants a reachable Postgres 16 and does not care where
it came from. Pick whichever your machine allows and set `DATABASE_URL`:

| Instead of Docker               | How                                                                                                          | Port         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
| **Postgres.app** (macOS)        | Drag to Applications and open it. No installer, no admin.                                                    | 5432         |
| **Homebrew** (macOS)            | `brew install postgresql@16 && brew services start postgresql@16`                                            | 5432         |
| **A hosted instance**           | A free Neon or Supabase project. Nothing is installed at all, which is the answer for a locked-down machine. | in their URL |
| **A Postgres you already have** | Just point at it.                                                                                            | yours        |

With a server that is not the compose one, create the two databases once:

```sh
createdb ura && createdb ura_e2e     # or: psql -c 'create database ura'
pnpm db:migrate && pnpm instrument:seed && pnpm demo:seed
```

The e2e suite creates its own database if the role may (`pnpm e2e:db` says so
plainly if it may not), so `E2E_DATABASE_URL` only needs to name one.

This is not theoretical: the development and demo work for this repository,
including the full end-to-end suite, has been run against Homebrew Postgres
with Docker not running at all. The block above was verified from an empty
database — 29 migrations applied, 15 tables, three instrument versions
activated and 27 people seeded — with no container involved.

### Windows, without administrator rights

Every part of this runs from a user folder. Nothing needs an installer, a
service, or a machine-wide change.

| You need        | Without admin                                                                                                                                                                                                                                                        | Notes                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Node 22.9+**  | The official **.zip** build from nodejs.org — unzip anywhere and add that folder to your _user_ PATH. `fnm` also installs per-user. 22.9 is the floor, not 22.0: the agent scripts use `--env-file-if-exists`, and an unknown flag kills Node before it runs a line. | The `.msi` installer is the one that wants admin. The zip is the same Node.                |
| **pnpm**        | `corepack enable pnpm` — corepack ships inside Node, so nothing is downloaded machine-wide.                                                                                                                                                                          | If corepack is blocked, `npm i -g pnpm` into a user-local prefix works too.                |
| **Postgres 16** | Either the **zip archive** from postgresql.org (`initdb -D data` then `pg_ctl -D data start`, both from the unzipped `bin`), or a **free hosted instance** — Neon, Supabase — where nothing is installed at all.                                                     | The EDB `.exe` installer wants admin and registers a service. Neither zip nor hosted does. |
| **Docker**      | Not needed. Skip `pnpm db:up` entirely.                                                                                                                                                                                                                              | See the table above.                                                                       |

On a genuinely locked-down machine the shortest path is **hosted Postgres**:
create a free database, paste its connection string into `DATABASE_URL` and
`E2E_DATABASE_URL` (two different database names), then:

A hosted connection string carries `?sslmode=require`, which is honoured —
the driver maps it through, and so do the migrate and reset scripts. What a
hosted plan usually will _not_ let you do is create a database from SQL, so
make both in their console rather than relying on `pnpm e2e:db`; that script
says so plainly instead of failing obscurely.

```powershell
pnpm install
Copy-Item .env.example .env    # then set DATABASE_URL and E2E_DATABASE_URL
pnpm db:migrate; pnpm instrument:seed; pnpm demo:seed
pnpm dev                       # http://localhost:3100
```

That is the whole product, with the AI deliberately off. To turn it on, in a
second terminal:

```powershell
pnpm agent:install    # once — the agent is a separate project with its own deps
pnpm agent:claude     # needs ANTHROPIC_API_KEY in .env
```

then set `AGENT_TRANSPORT=local` in `.env` and restart `pnpm dev`. Leave it
`none` when no agent is running: availability is read from that setting, not
by reaching the agent, so `local` with nothing listening puts "Assistant on"
in the app bar and then apologises when somebody clicks it.

Two things that used to break here and no longer do, both worth knowing in
case you meet an older checkout:

- The agent scripts carried their own environment inline
  (`AGENT_PROVIDER=anthropic … node …`). That is POSIX shell syntax; on
  Windows it is not an assignment and the whole line fails — including
  `pnpm agent:claude`, the one command that turns the AI on. They now go
  through `scripts/agent.mjs`, which has no shell in it.
- Paths were taken from file URLs with `.pathname`, which on Windows yields
  `/C:/…` and is not a path anything will open. They use `fileURLToPath`.

**`pnpm demo:prod` is macOS/Linux only** — it uses `cp -r` and `/dev/null`.
It is a production-build convenience; `pnpm dev` is what a demo runs on.

_Verified on macOS. The Windows-specific items above are the constructs that
were fixed and the install routes that avoid an installer — they have not
been executed on a Windows machine, so budget ten minutes to walk it once
before you rely on it._

The agent is a separate service and is **off by default** — with no agent
connected the product says so rather than implying one runs. To see the AI
features, start both with one command:

```sh
pnpm dev:ai             # the agent on a local model, plus the web app wired to it
```

It needs `ollama serve` running, and it says so plainly if that is not the
case. `pnpm dev` on its own gives you the product with no AI, which is the
same thing a deployment with `AGENT_TRANSPORT` unset gives you.

To run it against Claude instead, copy `.env.example` to `.env`, put your
own API key in it, and start the two halves:

```sh
pnpm agent:claude       # the agent on :8790, reading .env
pnpm dev                # the web app on :3100, already pointed at it
```

**No administrator rights are needed for any of this.** `.env` is an
ordinary file in the project folder — not a system keychain, not a PATH
change, not a global install — so anyone who can clone the repository can
supply their own key. The agent prints which source the key came from at
startup (`[agent] ANTHROPIC_API_KEY from project .env`), because a shell
profile exporting a stale one silently wins over the file otherwise, and
the API's reply — "API key is invalid" — names neither.

The key is yours and is billed to you; none is committed, and `.env` is
ignored by git.

To check the AI is genuinely working rather than merely reachable:

```sh
pnpm ai:check           # all six capabilities against the real model
```

**Where the AI actually shows up.** Every feature is scoped to a screen, so
an assessment that has not reached that screen will not show it:

| Feature          | Where                                                | Needs                                                              |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Assistant        | Bottom-right of any assessment screen                | An agent                                                           |
| Intake scoring   | The description field, "How does this read?"         | An agent                                                           |
| Policy authority | Each control question, "Why you are asked this"      | Controls to exist — answer a severity question first               |
| Policy breach    | The reviewer's queue, on the control that breaches   | A submitted assessment. **Sable claims triage** is seeded that way |
| Handoff report   | "Read the handoff summary →" in the reviewer's queue | Submitted; the agent adds the summary and scenarios                |

See `agent/README.md` for Bedrock, and `deploy/README.md` to put it on AWS.

## The parts that are load-bearing

Worth knowing before changing anything:

- **Evidence is insert-only.** Answers, attestations, dispositions and
  hand-offs are never updated or deleted — corrections are new rows.
  Enforced by database triggers, not by convention.
- **Rules live in the schema.** Four-eyes on a risk acceptance is a CHECK
  constraint, not an `if`. A rule somebody can forget is not a rule.
- **Derived state is computed, never stored.** Which questions apply, which
  controls are required, whether a finding is open — all recomputed.
- **Authority is derived from the question**, never from the request. A
  permission check that reads a value the requester chose is not a
  permission check.
- **The agent proposes; a person decides.** It may never attest, declare,
  accept or resolve anything, and a quote that is not found verbatim in its
  source invalidates the draft rather than lowering its confidence.

## Deploying it

`deploy/READINESS.md` says where this stands for AWS — what has been
verified and how, and what has not. `deploy/README.md` is the runbook,
written to be run top to bottom in CloudShell.

Compute is **ECS Express Mode** on Fargate (App Runner closed to new
customers on 30 April 2026), with RDS PostgreSQL 16 behind it and the agent
as a second, optional service talking to Bedrock.

## Checks

```sh
pnpm verify        # typecheck, unit, integration
pnpm e2e           # the full journey in a browser
pnpm walk:demo     # asserts the demo run sheet still matches the product
pnpm agent:test    # the gate, against fabricated model replies
```
