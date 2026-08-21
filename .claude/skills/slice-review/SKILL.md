---
name: slice-review
description: Run the pre-flight before a slice and write the structured review after it. Use when starting any slice, when a slice's done-when holds, or when asked whether a slice is finished.
---

Implements SPEC §21 (and Build Rules 11–15).

## Pre-flight — before the first line

Post, and get confirmation on:
1. **The slice's owned requirements**, restated in your own words from
   §17/§20 — not copied.
2. **The design decisions you intend to make**, with the alternative you
   rejected for each.
3. **Every ambiguity and assumption** you would otherwise resolve silently.
   Unresolved ambiguity blocks the slice (Build Rule 8).

## Slice review — when the done-when holds

One message, these eight parts:

1. **What changed** — files, requirement IDs satisfied, tests added, gates
   passed with real numbers.
2. **Self-critique — at least two.** The weakest decision, the likeliest
   bug, the worst-aged assumption. "Nothing" is not an acceptable answer;
   if the work is genuinely clean, name what would break it first. *This is
   the part that decays fastest under time pressure — write it first, not
   last.*
3. **What was deliberately not done** — deferrals with reasons and where
   they're recorded.
4. **Open questions** — each with a recommendation, not just a question.
5. **A demoable artifact** — running app, screenshot, transcript. Never a
   claim without evidence.
6. **The agentic opportunity** (§22) — what an agent would do for this
   slice's work, its guardrails, and the human decision it must never take.
   Written even when the answer is "nothing here".
7. **UI evidence** — screenshot per surface; §23 criteria met and deferred.
8. **The slice-verifier report** — run the subagent; attach its verdict.

## Then

The owner analyses and returns changes. **Refinements are applied and
re-gated before the next slice starts.** If a refinement changes the
instrument or a requirement, update §20 and the governance log first.

## Tone

Critique is owed in both directions (Build Rule 15). Surface disagreements
with the owner's instructions as readily as with your own work — agreeable
implementation of a flawed instruction is a specification failure, not
courtesy.
