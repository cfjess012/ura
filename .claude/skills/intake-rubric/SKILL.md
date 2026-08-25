---
name: intake-rubric
description: The graded rubric behind the intake coherence check — five criteria, four levels, what each level means, how the score is composed, and what may never be done with it. Use when changing the rubric, the scoring prompt, or anything that displays a score to a person.
---

Implements SPEC §22.1 (the intake quality assistant) and FR-43. The machine-readable copy is
`src/data/reference/intake-rubric.json`; **that file is the source of
truth** and this skill is why it says what it says.

## What is graded

The whole intake — Description through Compliance & Data — read as one
document, not field by field. Coherence is a property of the *set*: a
description that says "internal tool" and a data section listing external
recipients is only incoherent when you read both.

## The five criteria

Each is scored **1–4**. The anchors are in the JSON verbatim; what follows
is why each exists.

**Clarity & Coherence** — can a reviewer determine the purpose at all?
Level 1 is unintelligible; level 4 leaves no doubt about exactly what the
thing does.

**Internal Consistency** — do the answers contradict each other? This is
the one a person cannot self-check, because they know what they meant.
Level 1 is a major contradiction (internal app, external users); level 4 is
technical, business and user detail aligning perfectly.

**User Audience & Scope** — who uses it, and where does it stop? Level 1
does not say; level 4 names roles, permission levels and rigid boundaries.

**Data Access & Flow** — who reaches the data, and how does it move? Level 1
ignores it; level 4 maps third parties, APIs, storage locations and the
whole lifecycle.

**Data Sensitivity** — what kind of data, and how sensitive? Level 1 does
not say what data at all; level 4 lists the types, classifies them, and
names the compliance regime that follows.

## How the score composes

Sum of five criteria, 5–20, reported as a **band**, never as a bare number:

| Sum | Band | What it means |
|---|---|---|
| 17–20 | Robust | A reviewer can work from this |
| 13–16 | Workable | Usable; specific gaps named |
| 9–12 | Thin | Routes on guesses |
| 5–8 | Not yet usable | Cannot be assessed as written |

**Two criteria carry more weight in what is said, not in the arithmetic.**
Data Access and Data Sensitivity below 3 are called out first, because
those two decide which risk areas open and who has to review it. A thin
answer there is a wrong routing, not a vague one.

**A contradiction caps the band, and that one *is* arithmetic.** Internal
Consistency at 1 caps the band at Thin; at 2, at Workable — whatever the
sum. Summing five criteria lets four strong answers carry a
self-contradicting intake into "Workable. The gaps below are specific and
quick to close", which is false comfort: the contradiction does not sit
beside those four answers, it undermines them, because any one of them may
be the half that is wrong. Ceilings live in `ceilings.byCriterion` in the
JSON.

This was found the hard way. An intake described a fraud-triage tool
"processed via OpenAI's enterprise API" handling "claimant PII, financial
details" — while answering No to third parties, No to AI, and Public to
classification. It scored 16/20, "Workable", "quick to close".

## What may never be done with the score

- **It never blocks submission.** G-69: a quality assistant that blocks has
  become a gate, and the mission is reducing friction. It is prominent,
  specific and ignorable. If a threshold is ever wanted, that is a
  governance decision and an owner's call — not a default.
- **It never appears as a bare number.** A number a person cannot check is
  a number that replaces their judgement. Every score shows the anchor it
  was scored against, so the grade is readable rather than authoritative.
- **A model assigns levels and names contradictions, and nothing else.** The
  band, the wording, the ordering of asks — all deterministic, all from the
  JSON. A contradiction is the one thing a level cannot express: "two of
  your answers disagree" is only useful attached to *which two*.
- **It fails open.** No agent, a slow agent, a partial answer: the person
  carries on and a reviewer picks up what is thin.

## Naming a contradiction

Internal Consistency is the criterion a person cannot self-check, so it is
the one where a bare level is worth least. The model returns
`conflicts: [{one, two, why}]` alongside the levels, and **both halves must
appear verbatim in the intake** — checked with `quoteAppearsVerbatim`, the
same matcher the drafting gate uses. A conflict with an unquotable half is
discarded before anybody sees it.

Verbatim, because a conflict is an accusation that somebody contradicted
themselves. Shown in their own words it can be checked in a second; shown as
a characterisation it cannot be checked at all, and the cost of a wrong one
is a person hunting for a disagreement that is not there.

Two rules follow, both in the prompt:

- Scoring consistency below 4 **without** a quotable contradiction is a
  failed answer — the prompt says to score 4 and move on instead.
- Look hardest **across the prose/picklist boundary**. Free text says
  "OpenAI's enterprise API" and a dropdown says third-party: No. Both halves
  are in the same document, which is exactly why the check reads the whole
  intake as one document rather than field by field.

When the level claims a contradiction and none survived the gate, the copy
falls back to `noConflictFound` rather than leaving a person hunting for a
list that is not there. Never promise a quote the architecture cannot show.

## The rewrite

Offered only where a long-form field scores below 4, and bound by one rule:
**it uses only facts the person already wrote.** Anything missing becomes a
`[bracketed placeholder]` naming what is needed — never an invention, never
a plausible guess. It is a suggestion they edit and resubmit; it is never
recorded on their behalf, and the scoring judges whatever is finally
submitted rather than what was offered.
