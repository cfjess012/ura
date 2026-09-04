---
name: impact-analysis
description: Work out what a change does to the business outcomes, not just the code, and prove afterwards that nothing else moved. Use before changing any rule, instrument edition, derivation or gate, before re-rating a portfolio, and before calling a change safe.
---

Implements SPEC §0 (Build Rule 3), §5 and §19.

The suite was green all day on 2026-09-03. Typecheck clean, a thousand unit
tests, seventy-six browser tests — through changes that altered what every
assessment in the database said. One of them made an unassessed AI system
holding applicant data read **Low** on the reviewer's queue.

Nothing failed, because nothing was wrong: the machine executed the rules
exactly as written. **The tests verify that the machine works. They do not
verify that the answers are right.** What caught it was opening the queue and
reading it.

That gap is what this skill is for.

# What this is called elsewhere

Use the enterprise words when writing to the owner; they land better than
"I checked some stuff".

- **Impact analysis** — before the change: what could this affect. In change
  management it is the assessment attached to a request for change.
- **Regression testing** — after the change: does everything that worked
  still work. Its business-process flavour is **business process testing**,
  or end-to-end journey testing.
- **Back-testing** / **outcomes analysis** — running new rules across the
  existing portfolio and examining what moved. This is the one that fits a
  rules engine, and it is what model risk management asks for.

This product *is* a rules engine over a portfolio. Back-test it.

# Before the change — trace the outcome, not the caller

Find the call sites, then keep going. A call site tells you what *executes*;
you need what a person will *read differently afterwards*.

Ask, in this order:

1. **Which stored answers does this read?** Anything reading intake, gates,
   parts, severity or control answers touches every assessment ever made, not
   only new ones — nothing derived is stored (NFR-3), so a rule change is
   retroactive by construction.
2. **What band, count or sentence changes on a screen?** Name the screens.
   The rating alone renders in seven places.
3. **What does it gate?** Packaging blocks on unattested controls and open
   findings. Submission blocks on completeness. A change that alters what is
   *required* silently alters what is *blocked*.
4. **Who is told?** The queue, the bell and the reviewer's obligations all
   derive from the same state. A change that alters findings alters who has
   work.
5. **What is frozen?** The package payload carries a snapshot. Anything
   already exported keeps the old reading, so the export and the screen can
   legitimately disagree — say so rather than treating it as drift.
6. **Which editions are immutable?** An activated instrument version cannot
   be edited. A change to what is asked or how it is rated is a **new
   version**, and the old one still governs everything answered under it.

## The dependency map, as it stands

Ordered by how far the blast radius reaches. Verify rather than trust it —
this rots.

| Change this | And you have changed |
|---|---|
| Intake fields or their options | which risk areas open, the rating floor, every downstream count |
| `rating.json` rules | the band on seven screens, appetite breaches, packaging, the frozen block |
| Severity questions or thresholds | which controls accumulate → what is asked → what findings arise → what blocks packaging |
| The control catalogue | accumulation, attestation authority, coverage reports, the crosswalk |
| `control-provision.json` | who is asked a control at all, and what a platform may provide |
| `platforms.json` | what is inherited, and every assessment leaning on it |
| Conditions in `conditions.ts` | every instrument rule at once — this is the widest change available |
| `submission.ts` finding rules | the reviewer's queue, dispositions, packaging |

# After the change — back-test it

**Re-run the portfolio and diff.** Twenty-five seeded scenarios live in the
development database (`scripts/seed-scenarios.mjs`), chosen to span the shapes
a real queue contains. Read each one's rating and reasons before and after,
and account for every row that moved. A row you cannot explain is the finding.

**Read the app, not the database.** Three times in one session a conclusion
drawn from raw SQL was contradicted by the running product, because the store
normalises what the driver returns. Fetch the page.

**Look for the silent outcomes**, which are the dangerous ones:

- an answer that produces *neither* a finding nor a gap — the assessment
  declares itself complete and never reaches a reviewer
- a band that stops being reachable at all
- a rule that can no longer fire
- something that used to block packaging and no longer does
- a count that still adds up while meaning something different

**Expect the distribution to be honest.** If most of the portfolio lands on
one band, the change has stopped sorting anything, whatever the individual
reasons say. Sixty per cent at High is a finding even when every one of them
is defensible.

# What belongs in a test rather than here

This skill is loaded on demand, so it cannot be the safety net (G-18). Turn
each finding into something with teeth:

- an **outcome assertion** — this scenario must rate at least this, must
  require these controls, must block packaging
- an **architecture rule** where a derivation must not be copied again
- a **validator refusal** where content could be authored wrongly

A finding that leaves no test behind will be found again by hand, at full
price, on a later change.

# The report

Say what you traced, what moved, and what you could not explain. Name the
scenarios by their own names. If nothing moved, say what you ran that would
have shown it had it moved — an unwitnessed change is not a verified one.
