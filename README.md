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
pnpm db:up && pnpm db:migrate && pnpm instrument:seed
pnpm demo:seed          # four curated assessments, one already with a reviewer
pnpm dev                # http://localhost:3100
```

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
