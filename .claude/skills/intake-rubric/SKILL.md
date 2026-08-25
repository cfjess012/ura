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

**Only the copy shown beside real quotes may promise quotes.**
`conflictSummary` (which counts the pairs — "4 pairs of your answers
disagree", never "two" over four of them) is used only when conflicts
survived the gate. The `ask` levels are the fallback for when none did, so
they say what is wrong without pointing at a list: "Something here
contradicts something else you wrote." A unit test holds this line, because
the original bug was exactly this sentence promising a below that did not
exist.

**An absence is a quotable half.** Every unanswered field reaches the model
as `Field label: (not answered)`, so prose naming claimant PII beside
`Data Elements: (not answered)` is a contradiction rather than a gap — the
person described the data in one place and declared none in another.

**A picked answer its own prose contradicts is not evidence.** Data
Sensitivity level 3 asks whether sensitive data is *acknowledged*; naming
PII while classifying it Public has denied it, not acknowledged it, so it
caps at 2. Same for Data Access against a third-party answer the prose
refutes. These two decide routing, and routing on a field the document
disputes is the failure this check exists to catch.

## The read

A scorecard is not a reading. Five grades and a list of gaps tell somebody
how they were measured and never once tell them what the platform
*understood them to be building* — so the check opens with a **narrative**:
three or four paragraphs of prose about their activity, written to be read
straight through. No bullets, no headings. Bullets turn it back into a
scorecard, which is what it exists to stop being.

It covers what is actually happening, where the data goes, what drives the
risk here, and what a reviewer will look at first. It goes above everything
because **it is the part they can check**: every other output asks them to
trust a grade, this one they can read and say "no, that is not what this
does". Learning the platform misread you is worth more than any band.

Bounds, since prose cannot be gated the way a quote can:

- Only what they wrote — no inferred vendor, regime, safeguard or user
  group. An absent safeguard is named as an absence.
- Never reassure and never grade. The band is computed from the levels; a
  reassuring sentence would contradict it in the same breath.
- **The narrative may not retell the contradictions.** They are quoted in
  full immediately below it. One clause noting the structured answers
  disagree with the prose is the limit.
- `summaryGate` caps paragraph length and count and drops wrong-shaped
  entries; an empty narrative returns null, because absent beats blank.

## What the panel is, in order

The order is the point, and it was wrong twice before it was right:

1. **Band and score** — one line.
2. **The narrative** — the substance.
3. **What disagrees** — every contradiction, both halves quoted. Hoisted to
   the top level rather than nested inside the consistency grade, because it
   is the finding, not a detail of how one criterion scored.
4. **How it graded** — the five criteria, *collapsed*. Reference material.
   Four cards of anchors competing with the narrative is what made the first
   version read as a scorecard with no context.

## Saying it about their submission

Every rubric sentence is general by construction — it has to fit every
intake ever submitted, so the best it can manage is "worth naming the
downstream systems, not just the first hop". The model now writes one
sentence per shortfall about **their** text: which system they left out.
That is `notes` in the response and `ask.note` on screen, shown in place of
the rubric's sentence when present, with the anchor still beneath it.

The rubric line remains the fallback and remains the definition. The note
never replaces the anchor, because the anchor is what makes a grade
readable rather than authoritative.

## Correcting an answer on their behalf

Where one half of a contradiction is a picked answer and the description
settles which option was meant, the check offers to change it. **The person
clicks; the platform never decides.** The offer sits beside both halves of
the contradiction it settles, and it writes through `saveIntake` like any
other answer — same authority check, same change history, changeable back
on its own section.

What makes this safe is that the model is choosing among answers the form
already allows, not writing one:

- The instrument's fields and their exact options are sent with the scoring
  request. `fixGate` keeps a fix only if the field exists and the value is
  one of its options; matching is case-insensitive but **what gets written
  is the instrument's own string**, never the model's rendering of it.
- A near-miss is dropped, never coerced. Silently turning "Probably" into
  some other option is how somebody ends up attesting to a sentence nobody
  wrote.
- Checked again in `applyIntakeFix`, because a server action is reachable
  without going through the agent at all.
- Free text fields are excluded by construction — they only offer options
  when they have them, and prose gets a rewrite instead.

Only fields with a fixed option set are offered. That is not a limitation
to route around: a wrong sentence needs a person reading it, a wrong pick
has exactly one right alternative.

## The rewrite

The length ceiling counts **prose only**. Placeholders are the one thing a
rewrite may add, so measuring the whole string rejected good rewrites for
doing exactly what they were asked to do — a description with three
bracketed questions in it is not a longer description, it is an honest one.
Bracketed spans are stripped before the words are counted.

Offered only where a long-form field scores below 4, and bound by one rule:
**it uses only facts the person already wrote.** Anything missing becomes a
`[bracketed placeholder]` naming what is needed — never an invention, never
a plausible guess. It is a suggestion they edit and resubmit; it is never
recorded on their behalf, and the scoring judges whatever is finally
submitted rather than what was offered.
