---
name: verify
description: The one definition of "done" — the gate chain, the slice review, and the owner's UAT script. Use before every commit, when starting or finishing any slice, and whenever asked whether the build is green.
---

> **DEMO PUSH until 2026-08-26 (G-70).** The chain below is suspended per
> change. Run `pnpm typecheck && pnpm test:unit` — 35 seconds — and move on.
> The full suite and the verifier run once at the end of the day, and
> `walk:demo` plus one `pnpm e2e` run before the demo. This note expires
> with the entry; after 2026-08-26 the chain below is the rule again.


Implements SPEC §0 (Build Rule 3), §21 and §26.4. **This file is the only
definition of the gate chain.** The Stop gate runs a subset of it and says
so; the slice-verifier agent runs it via this file; nothing else may
restate it.

# The chain

## The chain, in order

```sh
pnpm typecheck            # strict tsc — fastest signal, run first
pnpm test:unit            # pure logic; needs only Node
pnpm test:integration     # real SQL on in-process Postgres; no daemon
pnpm e2e                  # needs the dev server running on :3100
```

`pnpm verify` runs the first three (everything that needs no server).

## Rules

- **Green is the permission slip.** A red gate stops the slice; it is never
  "known failing" or "fixed in the next commit".
- **Start the dev server before E2E** and confirm it answers:
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/` → 200.
- **Read the failure, don't re-run it.** Re-running a red test hoping for
  green is how a real defect gets shipped as flakiness.
- **When a test fails after an intentional change**, decide explicitly:
  either the code is wrong (fix it) or the test encoded the old intent
  (update it, and say so in the commit). Never delete a failing test.
- **File budgets** are part of the chain: nothing over 800 lines, new files
  ≤400 (`find src -name "*.ts*" -exec wc -l {} + | sort -rn | head`).

## Reporting

State the actual numbers ("35 tests, typecheck clean, E2E green"), never
"tests pass". If any tier was skipped, say which and why.

# The slice protocol

## Pre-flight — before the first line

Post, and get confirmation on:
1. **The slice's owned requirements**, restated in your own words from
   §17/§20 — not copied.
2. **The design decisions you intend to make**, with the alternative you
   rejected for each.
3. **Every ambiguity and assumption** you would otherwise resolve silently.
   Unresolved ambiguity blocks the slice (Build Rule 8).

## Slice review — when the done-when holds

Eight parts. **Format precedence: `owner-brief` governs** — if eight parts
breaks its three-to-five-section rule, the review is a committed file
(`uat/` or `docs/`) and the message to the owner is its brief.

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

# The owner's UAT

## Two outputs, not one

1. **`uat/<slice>.md`** — the durable record, committed with the slice.
   Generate the skeleton with `pnpm uat:new S3`, then fill every row with
   what was actually done and actually observed. Six criteria are enforced
   by `test/unit/uat.test.ts`: coverage of every owned requirement, no
   orphan rows, substantive evidence, no blank results, follow-up on every
   failure, and an honest spec-version stamp (what it RAN against — never rewritten on a spec bump). **"Works" is not evidence.**
   The "Not verified" section is mandatory and must be honest — naming the
   gaps in your own coverage is the difference between a record and a
   claim.
2. **The owner's script** — the numbered checks below, delivered in the
   slice review so a person can run the same journey by hand.

## Shape

Numbered checks (T1, T2, …), grouped by persona or track, each with:

- **A title** naming the behaviour, not the code.
- **Numbered steps** a person can follow without knowing the internals.
- **A pass line** that is objectively true or false, quoting the exact
  strings expected on screen.
- **A speed tag** where a step involves a slow dependency, so a wait is not
  mistaken for a hang.

Include a **"known-open, not bugs"** section listing deliberate deferrals —
otherwise the owner files them as defects.

## Rules

- Test behaviour, not implementation. "The save status reads *All changes
  stored*", not "setSavedAt is called".
- Cover the negative paths: an unanswered required field, an "I'm not sure"
  answer, a forced failure (offline), a reopened page.
- Every check must be runnable from a clean start — say what to create
  first.
- Tell the owner up front that "T# failed" plus a screenshot is a complete
  bug report.

## Example

> **T7 · Submit is never silent** · Fast
> 1. Complete intake, click **Save intake**.
> **Pass:** a status region shows "Saving…" immediately, then "All changes
> stored". The old behaviour — a dialog closing followed by silent seconds —
> must not happen.
