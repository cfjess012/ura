# Architecture

Two pictures: what deploys today, and what changes when the agentic layer
arrives. The second one is the reason the first one is shaped as it is.

---

## Today — Phase 1, deterministic

One container and a database. Nothing else is load-bearing.

```mermaid
flowchart TB
  user["Person in a browser"]

  subgraph aws["AWS sandbox account"]
    subgraph express["ECS Express Mode"]
      alb["Application Load Balancer<br/>TLS terminated, health checks /healthz"]
      task["Fargate task · ura-web<br/>Next.js standalone, port 3000"]
    end
    ecr[("Amazon ECR<br/>ura-web:latest")]
    rds[("RDS PostgreSQL 16<br/>schema CHECKs and insert-only triggers")]
    logs["CloudWatch Logs"]
  end

  user -->|HTTPS| alb --> task
  task -->|"5432, inside the VPC"| rds
  ecr -.->|image pulled on deploy| task
  task -.-> logs

  classDef store fill:#eef4ff,stroke:#3b6ea8
  class ecr,rds store
```

**Where the rules live.** Not in the container. Four-eyes on a risk
acceptance, insert-only evidence, "a submission has a timestamp *and* a
submitter or neither" — these are CHECK constraints and triggers in Postgres
(SPEC §5, §7). Replacing the web tier changes nothing about them, which is
the point.

---

## The request path

```mermaid
sequenceDiagram
  participant P as Person
  participant W as ura-web (Fargate)
  participant L as Pure logic (src/lib)
  participant D as Postgres

  P->>W: answers a question
  W->>W: server action — who is this, may they?
  W->>L: derive what follows (paths, severity, objectives)
  Note over L: no framework, no driver,<br/>no environment — liftable as-is
  W->>D: insert (never update)
  D-->>W: constraint holds or the write is refused
  W-->>P: recomputed state, never stored
```

The middle layer is deliberately portable: `src/lib/*` imports no framework,
no database driver and no environment (SPEC §26.1, enforced by
`test/unit/architecture.test.ts`). The same functions run unchanged behind a
Lambda handler or an AgentCore task.

---

## Phase 2 — the agentic layer on Bedrock and AgentCore

Nothing above is discarded. A second service appears, and the web app reaches
it through exactly one module.

```mermaid
flowchart TB
  user["Person in a browser"]

  subgraph aws["AWS sandbox account"]
    subgraph web["ECS Express Mode · ura-web"]
      task["Fargate task<br/>Next.js"]
      seam["src/lib/agent.ts<br/><b>the only module that knows<br/>how the agent is reached</b>"]
      sess["src/lib/session.ts<br/><b>the only module that reads<br/>conversation state</b>"]
    end

    subgraph agentsvc["Agent service"]
      agent["Fargate task or<br/>AgentCore Runtime"]
      model["model access<br/><b>only this service knows<br/>a model exists</b>"]
    end

    rds[("RDS PostgreSQL 16")]
    bedrock["Amazon Bedrock<br/>Claude"]
    memory["AgentCore Memory"]
    otel["CloudWatch / OTel traces"]
  end

  user --> task
  task --> seam --> agent
  task --> sess
  sess -.->|swapped for| memory
  agent --> model --> bedrock
  agent -.-> otel
  task --> rds

  classDef seamStyle fill:#fff6e5,stroke:#c47f17,stroke-width:2px
  class seam,sess,model seamStyle
```

### The three seams (SPEC §6.1)

Everything portable about this design is these three modules. Each exists so
that moving to AWS changes configuration, not code.

| Seam | Module | What it hides | What it becomes |
|---|---|---|---|
| Agent access | `src/lib/agent.ts` | How the agent is reached | Local HTTP now, **AgentCore Runtime** later |
| Session state | `src/lib/session.ts` | Where conversation state lives | Postgres now, **AgentCore Memory** later |
| Model access | `agent/src/model.ts` | That a model exists at all | **Bedrock** via `AGENT_PROVIDER`; the web app never imports a model SDK |

**The rule that keeps it true:** nothing else in the codebase may address the
agent, read conversation state, or import a model SDK. That is not a
convention — it is asserted by tests, in the same file that already forbids
the pure layer from importing a driver.

### What the agent may never do (SPEC §7)

Worth stating on the same page as the architecture, because it is an
architectural constraint and not a prompt:

- Answer from nothing, or paraphrase evidence — every drafted answer carries
  a **verbatim** quote from what the requester provided.
- Attest, declare, resolve or accept anything. Those are people's acts, and
  the authority checks that enforce them are server-side and derived from the
  question, never from the caller's request.
- Act as an autonomous orchestrator. **AgentCore is substrate, never the
  decider.**

A drafted answer arrives as a proposal a person confirms. That is why the
reviewer's rubric already has a criterion for it, sitting deliberately empty:
*"Grounded in a quoted source — nothing drafts answers yet, so there is no
evidence trail to weigh."*

---

## Cost, roughly

For a demo left running in a sandbox:

| Resource | Shape | Rough monthly |
|---|---|---|
| ECS Express (Fargate) | 1 vCPU / 2 GB, 1 task | ~$35 |
| Application Load Balancer | provisioned by Express Mode | ~$18 |
| RDS `db.t4g.micro` | 20 GB gp3, single-AZ | ~$15 |
| ECR + CloudWatch | a few images, modest logs | ~$2 |

Call it **$70/month** left running, and close to nothing if you tear it down
between demos. Express Mode itself costs nothing extra — you pay for what it
creates.
