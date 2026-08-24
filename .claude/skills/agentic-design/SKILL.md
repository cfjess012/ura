---
name: agentic-design
description: Design an AI-assisted feature for this product without breaking its provenance guarantees — the evidence line, propose-never-decide, precedent rules, privacy of external calls, and graceful degradation. Use whenever proposing, specifying, or reviewing anything an agent would do for a person.
---

Implements SPEC §7 (the agentic contract), §22 (opportunity register), and
the precedent rules in §22.4.

## The one line that decides most designs

**World knowledge and portfolio patterns may inform the conversation. They
may never become an answer's evidence** (§22.2).

An answer's evidence must trace to what *this* requester said or provided.
"The internet says Snowflake works this way" and "eleven other teams
answered Yes" are both assertions about the world, not facts about this
implementation — their Snowflake may be single-tenant, their pipeline
different. The correct shape is always:

> agent proposes, using whatever knowledge it has →
> the person confirms in their own words or with their own click →
> **that confirmation is the evidence.**

Every feature below is a variation on that sentence. If a design cannot be
expressed in it, the design is wrong.

## The five checks

Run these before writing a line of a feature spec.

**1. Who decides?** The agent drafts, suggests, explains, flags. A human
attests. If a feature would let a value become final without a person
choosing it, stop — it violates §5.5, not merely a preference.

**2. What happens when it's wrong?** Assume the model is confident and
wrong. What does the person see, what does the reviewer see, and how does
the mistake get caught? A feature with no answer here is not ready. Prefer
designs where being wrong is *visible* (a proposal a person rejects) over
designs where being wrong is *silent* (a value quietly written).

**3. What leaves the boundary?** Any external call is data egress, and this
product asks people to classify their content Confidential or Restricted
(§22.3). Name exactly what is sent. Default: the technology name, never the
description. Name the classification threshold above which nothing leaves.

**4. What happens with no model?** Every agentic feature needs a defined
degraded state: the deterministic half still runs, the surface still works,
nothing blocks. If the product is unusable when the model is down, the
model has become an invariant — and only §5 gets to be that.

**5. Does it anchor?** Showing a suggestion before a person thinks changes
their answer. That is fine for a draft they will edit; it is corrosive for
a binary judgement. For gates and yes/no decisions, prefer showing patterns
*after* the answer as a check, not before as a prompt (§22.4.3).

## Policy-grounded features specifically

An internal policy is the **one legitimate exception** to the evidence line
(§22.5) — but only for part of the chain:

- The policy defines **what a term means** and **what is required**.
- The requester supplies **the facts about their project**.
- Their **confirmation** is the answer's evidence.

A design that lets a policy assert a project fact ("the standard says
systems like this store PII, so we recorded Yes") has broken the chain as
badly as a web-grounded one. Quote **verbatim or not at all**, always with
policy, clause, and version. Version policies like the instrument: a
revision raises a finding against a current assessment, it never rewrites a
historical one.

## Precedent features specifically

Anything that learns from other assessments obeys §22.4:

- **Attested only.** Precedent is built from human-signed answers.
  Otherwise an early error compounds into institutional truth — the
  platform industrialises the mistake instead of catching it.
- **Aggregate, never disclose.** Patterns and counts, never another team's
  content, project, or owner. Below the minimum comparable count, show
  nothing: precedent from a single assessment is gossip, and it identifies
  the source.
- **Age is part of the fact.** Always show how many and how recent.
- **Divergence belongs to the reviewer.** "Different from fourteen
  comparable assessments" is a triage signal for a reviewer, never a nag
  that pressures a requester toward the majority. Being different is often
  correct — that is frequently the whole point of the assessment.

## Writing the register entry (§22.1)

Four columns, and the guardrail column is the one that matters:

| From | Feature | What it does | Guardrails beyond the standing set |

Write the guardrails as the things you would refuse to build, not as
aspirations. "Proposes, never decides" is a guardrail. "Aims to be
accurate" is not.

## Phase discipline

Phase 1 builds **none** of this and forecloses **none** of it (§16, Build
Rule 12). The practical obligation while building today: keep the raw
material an agent will need — the requester's own prose, the attestation
record, the reason a value was derived. Discarding those is what makes a
registered feature impossible later.

## Building one, now that the seams exist (2026-08-23)

The three seams from §6.1 are in code. A capability is added **behind** them
or it is added wrong.

| Seam | File | Rule |
|---|---|---|
| Agent access | `src/lib/agent.ts` | The only module that may address the agent. `AGENT_TRANSPORT` selects `none` \| `local` \| `agentcore`; `none` is the default and returns a plain refusal. |
| Session state | `src/lib/session.ts` | The only module that may read conversation state. Narrow on purpose — append and history — because AgentCore Memory offers other things differently. |
| Model access | the agent service only | Nothing under `src/` may import a model SDK. Asserted in `test/unit/architecture.test.ts`. |

The wire contract is `src/lib/agent-contract.ts`. It is a **deployment
boundary**: both images ship separately and can be at different versions, so
changing it is a compatibility event. It carries no field that could record
an attestation, and a test enforces that — drafting and signing are
different acts by different parties.

### The order to build in

1. **The agent service itself** — its own image, its own Express Mode
   service. OpenTelemetry spans from its **first day** (§6.4 obligation 5);
   the web app is exempt, the agent service is not.
2. **One capability**, end to end, with its eval. `draft` is the obvious
   first: it is the one the whole product is shaped around.
3. Only then the next one. The §22.1 register has fifteen and they are
   sequenced there, not here.

### What a drafted answer must carry

Every one, with no exceptions and no "confidence" instead:

- the **verbatim** quote it came from — the receiving side verifies it
  appears in the source, and one that does not is an **error**, not a
  lower-confidence answer;
- the source, named as a person would name it;
- a `because` in words a requester can judge.

**Full abstention on absent evidence is a correct answer** and is scored as
one. An agent that answers from nothing has failed even when it is right.

### Where it plugs into what already exists

The reviewer's rubric (`src/lib/grounding.ts`) already has the criterion,
deliberately empty: *"Grounded in a quoted source — nothing drafts answers
yet, so there is no evidence trail to weigh."* When drafting ships, that
criterion stops being null. It still only **orders** the queue; it may never
gate, skip or pre-approve an attestation (G-61).
