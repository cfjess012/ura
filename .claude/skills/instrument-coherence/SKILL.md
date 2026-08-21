---
name: instrument-coherence
description: Audit the assessment instrument as a system, not question by question — tier fit, answer-type fit, rubric quality, duplication, reachability, coverage and measurement validity. Use before activating an instrument version, after adding or moving any question, and whenever the instrument grows past what one person can hold in their head.
---

Implements SPEC §3 (structural semantics), §6.2 (instrument as data) and §8
(governance). Run `question-design` on a single question; run **this** on
the set.

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
