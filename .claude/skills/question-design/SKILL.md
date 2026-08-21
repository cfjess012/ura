---
name: question-design
description: Assess any question from the answering person's vantage point before it ships — can they answer it honestly, does it earn its place, what helper text do they need, and what would an agent do here later. Use when adding, rewording, or challenging any question a requester or reviewer is asked.
---

Implements SPEC §24 (experience) and §22 (agentic opportunity). Run this
*before* the `instrument-change` skill applies the edit.

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

## 5. Write the helper text

- **Examples, not definitions.** "Including AI features inside a vendor's
  product" beats defining AI.
- **Say what happens with the answer** when the person might hesitate:
  "leave blank if there isn't a date — reviewers would rather see blank
  than a guess".
- **Let "select all that apply" carry ambiguity** rather than forcing a
  false single choice.
- **Never** an internal identifier, framework code, or acronym battery.

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
/ replace / cut) with the reason. Then hand off to `instrument-change`.
