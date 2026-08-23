---
name: instrument
description: Any change to what a person is asked — one question, the set, or the data. Use whenever adding, rewording, moving, or removing a question, option, condition, rubric, or control objective, and before activating any instrument version.
---

Implements SPEC §3, §6.2, §8, §24 and G-5 (no runtime authoring — seed-PR
only). Three parts, in the order they run: **the question** (sit in the
answering person's chair), **the set** (coherence), **the path** (the
governed mechanical steps). The instrument is versioned data, never code —
the database can never fork away from the repository.

# Part 1 — the question, from the person's chair

Run this on the single question BEFORE the mechanical path (part 3) applies any edit — that ordering is the point of having them in one file.

## 1. Sit in their chair

Name the person and their situation, then read the question as them.
"John Smith, operations manager, has never done a risk assessment."

- **Could they answer without a glossary?** If a business user needs to
  learn our vocabulary first, the question is wrong — not the user (§24.6).
- **Would two reasonable people answer differently?** Ambiguity at the
  front door corrupts everything routed from it.
- **Are we asking them to classify?** Classification is the system's job.
  People *recognise* their situation; they do not categorise it.

**The ambiguity probe.** Write four real scenarios that stress the wording
and answer as each. If any is a coin flip, the question needs rebuilding.
*Worked example — "Technology / Non-Technology": a SaaS subscription with
no build? A process running on a shared spreadsheet? A vendor using their
own system? A policy change configured in an existing tool? Four coin
flips, so the question was replaced by "What is this activity introducing
or changing?" and the label derived.*

## 2. Ask what the organisation actually needs

Write the underlying need in one sentence ("which assessor queue is this,
and which domains are in play?"). Then ask: **what is the plainest question
that yields it?** Prefer deriving a label from concrete answers over asking
someone to apply the label themselves.

## 3. Make it earn its place

- **Does it route anything?** A question that changes nothing downstream is
  either registry data (fine — say so) or deletable.
- **Is it asked again later?** If a later tier asks it, remove it here or
  pre-fill there — never both (§24.5, FR-22).
- **Is the detail needed *now*?** Deep detail belongs where it applies, not
  at the front door. Assessment fatigue is a real failure mode.

## 4. Design the uncertainty path

Every question a person may genuinely not be able to answer needs an
honest-uncertainty option (FR-23) — and answering it must produce a
**reassurance naming who resolves it**, never a follow-up question (§24.1).

## 4b. The "doesn't apply to me" check (§24.9)

For every question, answer: **what does a person do when this doesn't apply
to them?** An optional field with no guidance leaves someone staring at an
empty box unsure whether blank means "none" or "I forgot" — and the
reviewer inherits that ambiguity rather than an answer.

Say it in the helper text: *"Leave blank if everything is built and run
in-house."* A multi-select needs an explicit "None of the above" option
rather than an empty selection.

*Origin: the vendor-name field. Someone building entirely in-house had no
way to say so — and it survived a slice review, a UI pass, and a screenshot
before the owner caught it. It is now a test.*

## 5. Write the helper text

- **Examples, not definitions.** "Including AI features inside a vendor's
  product" beats defining AI.
- **Say what happens with the answer** when the person might hesitate:
  "leave blank if there isn't a date — reviewers would rather see blank
  than a guess".
- **Let "select all that apply" carry ambiguity** rather than forcing a
  false single choice.
- **Never** an internal identifier, framework code, or acronym battery.
- **Required, not optional** (§24.10): every question a person answers has
  helper text that *teaches* — a restatement of the label is not help. Only
  a genuinely self-evident label may go without, and the test names those
  explicitly.

## 6. Register the agentic opportunity (§22)

For each question, note what an agent would do once Phase 2 exists — and
confirm today's design does not foreclose it (e.g. keep the raw prose an
agent would need to read). Typical: pre-fill from the description, flag
contradictions with other answers, offer a tightening rewrite of the
person's own words, or explain the question on request.

## Output

A short brief: the person and scenario · the ambiguity probe results · the
underlying need · what routes · the uncertainty path · proposed wording
with helper text · the agentic entry · and a recommendation (keep / reword
/ replace / cut) with the reason. Then continue to part 3.

# Part 2 — the set, as a system

Part 1 audits a single question; this part audits the set. Run it before activating a version, and after adding or moving any question.

A questionnaire becomes an *instrument* when the answers mean the same
thing every time, across every assessment, in every hand. These are the
checks that get you there.

## 1. Tier fit — is the question at the right altitude?

Each tier has one contract. A question at the wrong altitude is a
structural defect, not a wording problem, and no amount of rewriting fixes
it.

| Tier | Asks | Answer shape | Smells wrong when |
|---|---|---|---|
| **1 · Gate** | Does this risk area apply at all? | Yes / No | It asks *how much*, or needs a judgement of degree |
| **1 · Path** | Which specific threads apply? | Multi-select of situations | It asks a severity, or duplicates the gate |
| **2 · Severity** | How severe along this path? | Anchored Low / Medium / High, or a fact mapped to a band | It asks yes/no, or has no consequence attached |
| **2 · Detail** | What specifically? (capture) | Multi-select | It is scored as though it were severity |
| **3 · Objective** | Does this control exist? | Yes / Partial / No / N-A | It asks about the activity rather than the control |

**Check:** for every question, name its tier's contract and confirm the
question honours it. A "how critical is this?" in Tier 1 or a "does this
apply?" in Tier 2 must move, not be reworded.

## 2. Answer-type fit — can the answer be used?

The answer type is a promise about what can be done with the answer.

- A **scope** question that is free text cannot gate anything.
- A **severity** question that is free text cannot route a control.
- A **capture** question rendered as a single select forces a false choice
  where several things are true.
- A **control existence** question with only Yes/No cannot express
  "partially, and here is what is missing" — which is the most common real
  answer and the one that produces a useful finding.

**Check:** for each question, ask *what does the engine do with this
answer?* If the answer is "nothing", the type is wrong or the question is
decoration.

## 3. Rubric quality — the craft that makes ratings comparable

For every anchored severity question, its three bands must be:

- **Mutually exclusive.** No plausible situation fits two bands. If a
  reader could justify either Medium or High, two assessors will disagree
  forever and the portfolio numbers stop meaning anything.
- **Exhaustive.** Every plausible situation fits one. A gap forces people
  into the nearest band and hides the case you most wanted to see.
- **Observable.** Anchors describe facts a person can check — *"privileged
  or admin access to production"*, *"0–72 hours"* — not feelings
  (*"very important"*, *"significant"*). Feelings are where inconsistency
  enters.
- **Monotonic.** High is strictly worse than Medium in the same dimension.
  A band that changes *what* is being measured rather than *how much*
  is two questions wearing one coat.
- **Portfolio-comparable.** A "Medium" here should represent roughly the
  same magnitude of concern as a "Medium" three categories away, or
  aggregate severity is meaningless.

**Check:** write two real scenarios per band and place them. Any scenario
that lands in two bands, or none, is a rubric defect.

## 4. Duplication and drift across the set

- **Near-duplicates**: two questions a person would answer identically.
  Delete one, or make the distinction explicit in the wording.
- **Same concept, different words**: "access level" here, "level of access"
  there. Pick one phrasing and use it everywhere — a reader should never
  wonder whether a difference in wording implies a difference in meaning.
- **Same label, different meaning**: an option label that means one thing
  in one question and something else in another is worse than a duplicate,
  because nothing looks wrong.
- **Asked twice across tiers**: if Tier 1 establishes it, Tier 2 must not
  re-ask it — pre-fill instead (FR-22, §24.5).

## 5. Reachability and dead ends (mechanical — keep it in tests)

- Every question is reachable: some answer set makes it visible.
- No unsatisfiable condition (requires X *and* not-X).
- No activation cycles.
- Every path can be lit by at least one Tier-1 selection.
- Every control objective can be accumulated by at least one severity or
  selection — an objective nothing can reach is a control nobody will ever
  be asked about.

These are machine-checkable and belong in the validator, not in judgement.
Judgement is expensive; spend it on §1–§4 and §6.

## 6. Coverage — what a GRC function must be able to prove

- Every risk domain the organisation owns has a route from gate → path →
  severity → control.
- Every control family is reachable from some realistic risk profile.
- Where a policy library exists: every obligation maps to at least one
  question, and every question maps to at least one obligation (§22.1's
  traceability feature makes both reports; until then, check by hand).
- The instrument can answer, for any completed assessment: *why was this
  asked, why was it rated that way, and what control did that require?*

## 7. Measurement validity — does the answer discriminate?

The check most instruments never get.

- **A question everyone answers the same way collects nothing.** If a gate
  is Yes 95% of the time, it is ceremony — pre-fill it, or fold it into
  another question, or accept it as a formality and say so.
- **A severity that accumulates no control is decoration.** Rating
  something changes nothing unless it routes.
- **A capture question nothing consumes is a survey**, not an assessment.
  Either wire it to routing or admit it is registry data.

**Check:** for each question, name what changes downstream when the answer
changes. If nothing does, it is not part of the instrument.

## Output

A findings list, most structural first: tier misfits, then answer-type
misfits, then rubric defects, then duplication, then coverage gaps, then
questions that fail to discriminate. Each with the question, what is wrong,
and the specific fix. Hand structural findings to `instrument-change`;
hand wording findings to `question-design`.

Never silently rewrite the instrument from this audit — findings are
proposals for the owner, and a change to what is asked is a governance
event (§8).

# Part 3 — the governed path for applying the change

## The rule

The instrument is **versioned data**, never code and never a runtime admin
screen. The database can therefore never fork away from the repository.

## The path

1. **Run parts 1 and 2 above** — the single-question probe, and the set
   audit if anything moved. Then edit the data: intake fields in
   `src/lib/intake.ts`; the instrument in `src/data/instrument/*.json`;
   reference lists in `src/data/reference/*.json`. Question content never
   appears in a component. Editing an activated version is refused —
   bump the version string and `pnpm instrument:seed`.
2. **Update the pinned field-set test** in the same commit
   (`test/unit/intake.test.ts`). It exists because a rewrite once dropped a
   field silently — changing the instrument must be a deliberate act, and
   the diff is the proof.
3. **Check the experience laws still hold** — pass 2 of `ui-craft`.
   The mechanical ones are in `test/unit/experience.test.ts`: no
   "I'm not sure" answer may reveal another question; every conditional
   carries "Shown because…"; no acronym batteries or identifiers.
4. **Schema, if the shape changed.** New migration in `drizzle/` (append
   only — never edit an applied file), mirrored in `src/lib/schema.ts`.
   The PGlite integration test applies the real SQL, so drift fails.
5. **Run the `verify` chain.**
6. **Record it.** A governance-log entry in SPEC §13 for anything that
   changes what is asked or how it routes, and a requirement row in §20 if
   it adds a capability.

## Watch for

- **Duplication with a later tier** — if Tier 1 or 2 already asks it,
  intake should not (and vice versa). Prefer pre-fill (FR-22) over asking
  twice.
- **Uncertainty** — any answer a requester may genuinely not know needs an
  "I'm not sure" option that routes to a human (FR-23), plus a reassurance
  note rather than a follow-up question.
- **Plain language** — the label is what a business user reads. Internal
  vocabulary stays internal.
